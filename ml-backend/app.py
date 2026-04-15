import os
from flask import Flask, request, jsonify
from flask_cors import CORS
import google.generativeai as genai
import chromadb
from supabase import create_client, Client
import fitz  # PyMuPDF
from dotenv import load_dotenv
from sentence_transformers import SentenceTransformer

# Load environment variables
load_dotenv()

app = Flask(__name__)
# Enable CORS for the React frontend (usually runs on port 5173 or 5174)
CORS(app, resources={r"/api/*": {"origins": "*"}})

# Configurations
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")

# Initialize Gemini
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)
else:
    print("WARNING: GEMINI_API_KEY is not set.")

# Initialize Local Embedding Model
print("Loading local SentenceTransformer model...")
embedding_model = SentenceTransformer('all-MiniLM-L6-v2')
print("Local embedding model loaded successfully.")

# Initialize Supabase
supabase: Client | None = None
if SUPABASE_URL and SUPABASE_KEY:
    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    except Exception as e:
        print(f"WARNING: Failed to initialize Supabase client. Check your API keys in .env. Error: {e}")
else:
    print("WARNING: Supabase credentials are not fully set.")

# Disable ChromaDB telemetry warnings
os.environ["ANONYMIZED_TELEMETRY"] = "False"

# Initialize ChromaDB (persistent local storage in 'db' folder)
chroma_client = chromadb.PersistentClient(path="./chroma_db")
# Using a specific collection for our RAG
collection = chroma_client.get_or_create_collection(
    name="ngo_reports_local",
    metadata={"hnsw:space": "cosine"}
)

def get_embedding(text: str) -> list[float]:
    """Generates an embedding for the given text using local SentenceTransformer."""
    embedding = embedding_model.encode(text)
    return embedding.tolist()

@app.route('/api/embed', methods=['POST'])
def embed_text():
    """Endpoint to generate an embedding for a piece of text using local SentenceTransformer."""
    data = request.json or {}
    text = data.get("text")
    if not text:
        return jsonify({"error": "No text provided"}), 400
    
    try:
        embedding = get_embedding(text)
        return jsonify({"embedding": embedding}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

def chunk_text(text: str, chunk_size: int = 500, overlap: int = 50) -> list[str]:
    """Splits text into overlapping chunks."""
    chunks = []
    start = 0
    text_length = len(text)
    while start < text_length:
        end = start + chunk_size
        chunks.append(text[start:end])
        start = end - overlap
    return chunks

@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({"status": "healthy"}), 200

@app.route('/api/stats', methods=['GET'])
def get_stats():
    """Returns the current number of chunks embedded in the ChromaDB collection."""
    try:
        count = collection.count()
        return jsonify({"knowledgeBaseCount": count}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/upload', methods=['POST'])
def upload_file():
    """Endpoint to upload a file, extract its text, and store in vector db."""
    if 'file' not in request.files:
        return jsonify({"error": "No file part"}), 400
        
    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400

    filename = file.filename
    ext = filename.rsplit('.', 1)[1].lower() if '.' in filename else ''
    
    text = ""
    try:
        if ext == 'pdf':
            pdf_bytes = file.read()
            doc = fitz.open(stream=pdf_bytes, filetype="pdf")
            for page in doc:
                text += page.get_text() + "\n"
        else:
            text = file.read().decode('utf-8')
    except Exception as e:
        return jsonify({"error": f"Failed to extract text: {str(e)}"}), 500

    if not text.strip():
        return jsonify({"error": "Extracted text is empty"}), 400

    # Chunk and embed
    chunks = chunk_text(text)
    count = 0
    try:
        for i, c_text in enumerate(chunks):
            if not c_text.strip(): continue
            emb = get_embedding(c_text)
            if emb:
                doc_id = f"{filename}_chunk_{i}"
                collection.add(
                    documents=[c_text],
                    embeddings=[emb],
                    metadatas=[{"source": filename}],
                    ids=[doc_id]
                )
                count += 1
    except Exception as e:
        return jsonify({"error": f"Gemini Embedding Error: {str(e)}"}), 500

    return jsonify({
        "success": True, 
        "message": f"File processed. Added {count} chunks to knowledge base."
    }), 200

@app.route('/api/sync-history', methods=['POST'])
def sync_history():
    """Fetch all past agent_runs & issues for the current user and embed them."""
    data = request.json or {}
    user_id = data.get("ngo_user_id")
    
    if not user_id:
        return jsonify({"error": "ngo_user_id is required"}), 400
    
    if not supabase:
        return jsonify({"error": "Supabase client not configured"}), 500

    try:
        # Fetch Issues
        issues_res = supabase.table("issues").select("*").eq("ngo_user_id", user_id).execute()
        issues = issues_res.data or []
        
        # Prepare text representation
        history_text = "Historical NGO Issues Log:\n\n"
        for issue in issues:
            history_text += f"- Issue: {issue.get('issue_summary', 'N/A')}\n"
            history_text += f"  Sector: {issue.get('sector', 'N/A')}\n"
            history_text += f"  Location: {issue.get('location', 'N/A')}\n"
            history_text += f"  Affected: {issue.get('affected_count', 'N/A')}\n"
            history_text += f"  Urgency Score: {issue.get('urgency_score', 'N/A')}\n"
            history_text += f"  Date: {issue.get('created_at', 'N/A')}\n\n"
            
        if not issues:
            return jsonify({"message": "No historical issues found to sync."}), 200

        # Chunk and embed the database logs
        chunks = chunk_text(history_text, chunk_size=800, overlap=100)
        count = 0
        try:
            for i, c_text in enumerate(chunks):
                emb = get_embedding(c_text)
                if emb:
                    doc_id = f"supabase_sync_{user_id}_chunk_{i}"
                    # We use upsert so we don't throw errors on re-syncs
                    collection.upsert(
                        documents=[c_text],
                        embeddings=[emb],
                        metadatas=[{"source": "supabase_history"}],
                        ids=[doc_id]
                    )
                    count += 1
        except Exception as e:
            return jsonify({"error": f"Gemini Embedding Error during Sync: {str(e)}"}), 500
                
        return jsonify({"success": True, "message": f"Synced {len(issues)} database records as {count} context chunks."}), 200

    except Exception as e:
        return jsonify({"error": f"Failed to sync history: {str(e)}"}), 500

@app.route('/api/chat', methods=['POST'])
def chat():
    """Process user queries against the vector db and generate LLM response."""
    data = request.json or {}
    query = data.get("query")
    
    if not query:
        return jsonify({"error": "Query cannot be empty"}), 400
        
    try:
        query_emb = get_embedding(query)
    except Exception as e:
        return jsonify({"error": f"Embedding Error: {str(e)}"}), 500

    # Retrieve context — cap n_results to avoid crashing when collection is small
    total_docs = collection.count()
    n_results = min(5, total_docs) if total_docs > 0 else 0
    
    retrieved_docs = []
    if n_results > 0:
        results = collection.query(
            query_embeddings=[query_emb],
            n_results=n_results
        )
        retrieved_docs = results['documents'][0] if results['documents'] else []
    
    if retrieved_docs:
        context_section = "Relevant context from uploaded NGO reports and historical data:\n\n" + "\n\n---\n\n".join(retrieved_docs)
    else:
        context_section = "No uploaded reports or historical data available."
        
    prompt = f"""You are an expert AI assistant for NGO management and analysis. Your primary role is to help NGO workers understand their field reports and data.

You have access to the following context from the organization's uploaded reports and database:

{context_section}

Instructions:
- If the user's question can be answered using the context above, prioritize that information.
- If the context does not contain relevant information, use your own expert knowledge to answer helpfully.
- Always be concise, actionable, and professional.
- If asked about specific data points not in the context, let the user know and suggest they upload the relevant report.

User Question: {query}

Answer:"""

    try:
        model = genai.GenerativeModel("gemini-2.5-flash")
        response = model.generate_content(
            prompt,
            generation_config=genai.types.GenerationConfig(temperature=0.3)
        )
        return jsonify({
            "response": response.text, 
            "context_used": len(retrieved_docs)
        }), 200
    except Exception as e:
        return jsonify({"error": f"Failed to generate response: {str(e)}"}), 500



@app.route('/api/smart-analysis', methods=['POST'])
def smart_analysis():
    """
    Runs a full smart analysis:
    - Pulls historical issues + active volunteers from Supabase
    - Pulls relevant context from uploaded reports in ChromaDB
    - Sends everything to Gemini for predictions + volunteer assignments
    """
    data = request.json or {}
    ngo_user_id = data.get("ngo_user_id")

    if not ngo_user_id:
        return jsonify({"error": "ngo_user_id is required"}), 400

    # --- 1. Pull from Supabase ---
    issues_text = "No historical issues found."
    volunteers_text = "No volunteers found."

    if supabase:
        try:
            issues_res = supabase.table("issues").select("*").eq("ngo_user_id", ngo_user_id).execute()
            issues = issues_res.data or []
            if issues:
                lines = ["Historical Issues Log:"]
                for iss in issues:
                    lines.append(
                        f"- [{iss.get('sector','N/A')}] {iss.get('issue_summary','N/A')} | "
                        f"Location: {iss.get('location','N/A')} | "
                        f"Affected: {iss.get('affected_count','?')} | "
                        f"Urgency: {iss.get('urgency_score','?')} | "
                        f"Status: {iss.get('status','N/A')}"
                    )
                issues_text = "\n".join(lines)
        except Exception as e:
            print(f"Supabase issues fetch error: {e}")

        try:
            vols_res = supabase.table("volunteers").select("*").eq("ngo_user_id", ngo_user_id).eq("is_active", True).execute()
            volunteers = vols_res.data or []
            if volunteers:
                lines = ["Active Volunteers:"]
                for vol in volunteers:
                    lines.append(
                        f"- ID:{vol.get('id','')} | Name: {vol.get('name','N/A')} | "
                        f"Skills: {', '.join(vol.get('skills') or [])} | "
                        f"Zone: {vol.get('zone','N/A')} | "
                        f"Availability: {vol.get('availability_hours_per_week','?')}h/week"
                    )
                volunteers_text = "\n".join(lines)
        except Exception as e:
            print(f"Supabase volunteers fetch error: {e}")
    else:
        print("WARNING: Supabase not available. Analysis will use report context only.")

    # --- 2. Pull uploaded report context from ChromaDB ---
    report_context = "No reports uploaded to knowledge base yet."
    total_docs = collection.count()
    if total_docs > 0:
        try:
            query_emb = get_embedding("issues problems needs resource requirements sector location affected")
            results = collection.query(query_embeddings=[query_emb], n_results=min(6, total_docs))
            docs = results['documents'][0] if results['documents'] else []
            if docs:
                report_context = "Relevant Excerpts from Uploaded Field Reports:\n\n" + "\n\n---\n\n".join(docs)
        except Exception as e:
            print(f"ChromaDB query error: {e}")

    # --- 3. Build Gemini Prompt ---
    prompt = f"""You are an expert NGO operations analyst. Based on the data below, perform a comprehensive smart analysis.

## DATABASE RECORDS
{issues_text}

{volunteers_text}

## UPLOADED REPORT CONTEXT
{report_context}

## YOUR TASK
Analyze all the data above and return a JSON object with EXACTLY this structure:

{{
  "predictions": [
    {{
      "title": "Short prediction title",
      "description": "Detailed prediction about upcoming needs based on patterns",
      "sector": "relevant sector",
      "urgency": "high|medium|low",
      "confidence": "high|medium|low",
      "timeframe": "e.g. next 2 weeks"
    }}
  ],
  "assignments": [
    {{
      "issue_summary": "Brief issue description",
      "sector": "sector name",
      "location": "location",
      "urgency_score": 8,
      "primary_volunteer": {{
        "name": "Volunteer Name",
        "skills": ["skill1", "skill2"],
        "zone": "zone name",
        "reason": "Why this volunteer is the best match"
      }},
      "backup_volunteers": [
        {{
          "name": "Backup Name 1",
          "skills": ["skill1"],
          "zone": "zone",
          "reason": "Why this person is a good backup"
        }},
        {{
          "name": "Backup Name 2",
          "skills": ["skill1"],
          "zone": "zone",
          "reason": "Why this person is a good backup"
        }}
      ]
    }}
  ],
  "summary": "A 2-3 sentence executive summary of the overall situation and key recommendations"
}}

IMPORTANT:
- Base assignments ONLY on the volunteers listed above
- If no volunteers match, set primary_volunteer to null and explain in backup_volunteers why
- Return ONLY valid JSON. No markdown, no explanation outside the JSON.
"""

    try:
        model = genai.GenerativeModel("gemini-2.5-flash")
        response = model.generate_content(
            prompt,
            generation_config=genai.types.GenerationConfig(temperature=0.2)
        )
        raw = response.text.strip()
        # Strip markdown code fences if Gemini wraps in ```json
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        import json
        result = json.loads(raw)
        return jsonify({"success": True, "analysis": result}), 200
    except Exception as e:
        return jsonify({"error": f"Analysis generation failed: {str(e)}"}), 500


if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port, debug=True)
