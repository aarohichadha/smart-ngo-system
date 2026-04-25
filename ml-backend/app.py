import os
from datetime import datetime, timezone
from pathlib import Path
from flask import Flask, request, jsonify
from flask_cors import CORS
import google.generativeai as genai
import chromadb
from supabase import create_client, Client
import fitz  # PyMuPDF
from dotenv import load_dotenv
from sentence_transformers import SentenceTransformer

# Load environment variables
BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

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
os.environ["ANONYMIZED_TELEMETRY"] = "false"
os.environ["CHROMA_SERVER_NO_TELEMETRY"] = "1"

# Initialize ChromaDB (persistent local storage in 'db' folder)
from chromadb.config import Settings
chroma_client = chromadb.PersistentClient(
    path="./chroma_db",
    settings=Settings(anonymized_telemetry=False)
)
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


def build_sync_report_title(issue_count: int) -> str:
    """Builds a human-readable title for a synced history snapshot."""
    timestamp = datetime.now(timezone.utc).strftime("%b %d, %Y %H:%M UTC")
    return f"Supabase history sync ({issue_count} reports) - {timestamp}"

@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({"status": "healthy"}), 200

@app.route('/api/stats', methods=['GET'])
def get_stats():
    """Returns the current number of chunks embedded in the ChromaDB collection for this NGO."""
    try:
        ngo_user_id = request.args.get("ngo_user_id")
        if not ngo_user_id:
            return jsonify({"error": "ngo_user_id is required"}), 400
            
        results = collection.get(where={"ngo_user_id": ngo_user_id}, include=[])
        count = len(results['ids']) if results and 'ids' in results else 0
        return jsonify({"knowledgeBaseCount": count}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/documents', methods=['GET'])
def list_documents():
    """Lists knowledge-base documents grouped by source with chunk counts and previews."""
    try:
        ngo_user_id = request.args.get("ngo_user_id")
        if not ngo_user_id:
            return jsonify({"error": "ngo_user_id is required"}), 400

        try:
            requested_limit = int(request.args.get("limit", 500))
        except (TypeError, ValueError):
            requested_limit = 500

        limit = max(1, min(requested_limit, 1000))

        raw = collection.get(
            limit=limit,
            where={"ngo_user_id": ngo_user_id},
            include=["metadatas", "documents"]
        )

        metadatas = raw.get("metadatas") or []
        documents = raw.get("documents") or []
        total_docs = len(metadatas)

        if total_docs == 0:
            return jsonify({"documents": [], "scanned_chunks": 0, "total_chunks": 0}), 200

        grouped = {}
        for metadata, doc_text in zip(metadatas, documents):
            source = "unknown"
            if isinstance(metadata, dict):
                source = metadata.get("source") or "unknown"

            if source not in grouped:
                grouped[source] = {
                    "source": source,
                    "chunks": 0,
                    "preview": "",
                    "kind": "synced" if source == "supabase_history" else "uploaded",
                }

            grouped[source]["chunks"] += 1
            if not grouped[source]["preview"] and isinstance(doc_text, str):
                grouped[source]["preview"] = doc_text[:240]

        documents_out = sorted(
            grouped.values(),
            key=lambda item: (item["kind"] != "uploaded", item["source"].lower())
        )

        return jsonify({
            "documents": documents_out,
            "scanned_chunks": limit,
            "total_chunks": total_docs,
        }), 200
    except Exception as e:
        return jsonify({"error": f"Failed to list documents: {str(e)}"}), 500

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

    ngo_user_id = request.form.get("ngo_user_id")

    # Chunk and embed
    chunks = chunk_text(text)
    count = 0
    try:
        for i, c_text in enumerate(chunks):
            if not c_text.strip(): continue
            emb = get_embedding(c_text)
            if emb:
                doc_id = f"{filename}_chunk_{i}"
                metadata = {"source": filename}
                if ngo_user_id:
                    metadata["ngo_user_id"] = ngo_user_id
                collection.add(
                    documents=[c_text],
                    embeddings=[emb],
                    metadatas=[metadata],
                    ids=[doc_id]
                )
                count += 1
    except Exception as e:
        return jsonify({"error": f"Gemini Embedding Error: {str(e)}"}), 500

    # Persist uploaded document to Supabase
    if supabase and ngo_user_id:
        try:
            upload_payload = {
                "ngo_user_id": ngo_user_id,
                "source_type": "uploaded_document",
                "report_title": filename,
                "report_summary": f"Uploaded document: {filename}",
                "report_count": 1,
                "knowledge_chunks": count,
                "report_data": [{"filename": filename, "text": text}],
            }
            supabase.table("chatbot_synced_reports").insert(upload_payload).execute()
            print(f"Successfully persisted {filename} to Supabase database.")
        except Exception as e:
            print(f"Failed to persist uploaded document to Supabase: {e}")

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

        # Fetch Run Agent Reports
        reports_res = supabase.table("run_agent_reports").select("*").eq("ngo_user_id", user_id).execute()
        run_agent_reports = reports_res.data or []

        if not issues and not run_agent_reports:
            return jsonify({"message": "No historical data found to sync."}), 200

        snapshot_payload = {
            "ngo_user_id": user_id,
            "source_type": "supabase_history",
            "report_title": build_sync_report_title(len(issues) + len(run_agent_reports)),
            "report_summary": f"Synced {len(issues)} issues and {len(run_agent_reports)} reports from Supabase into the chatbot knowledge base.",
            "report_count": len(issues) + len(run_agent_reports),
            "knowledge_chunks": 0,
            "report_data": {
                "issues": issues,
                "run_agent_reports": run_agent_reports
            },
        }

        try:
            save_result = supabase.table("chatbot_synced_reports").insert(snapshot_payload).execute()
            saved_rows = save_result.data or []
        except Exception as e:
            return jsonify({"error": f"Failed to save synced reports: {str(e)}"}), 500
        
        # Prepare text representation
        history_text = "Historical NGO Issues Log:\n\n"
        for issue in issues:
            history_text += f"- Issue: {issue.get('issue_summary', 'N/A')}\n"
            history_text += f"  Sector: {issue.get('sector', 'N/A')}\n"
            history_text += f"  Location: {issue.get('location', 'N/A')}\n"
            history_text += f"  Affected: {issue.get('affected_count', 'N/A')}\n"
            history_text += f"  Urgency Score: {issue.get('urgency_score', 'N/A')}\n"
            history_text += f"  Date: {issue.get('created_at', 'N/A')}\n\n"
            
        if run_agent_reports:
            history_text += "NGO Run Agent Pipeline Reports Log:\n\n"
            for rpt in run_agent_reports:
                history_text += f"- Report Title: {rpt.get('title', 'N/A')}\n"
                history_text += f"  Source Type: {rpt.get('source_type', 'N/A')}\n"
                history_text += f"  Date: {rpt.get('created_at', 'N/A')}\n"
                
                pipeline = rpt.get('pipeline_result') or {}
                if isinstance(pipeline, dict):
                    alerts = pipeline.get('alerts', [])
                    extr_issues = pipeline.get('issues', [])
                    history_text += f"  Alerts Generated: {len(alerts)}\n"
                    history_text += f"  Issues Extracted: {len(extr_issues)}\n"
                
                processed = rpt.get('processed_output') or {}
                if isinstance(processed, dict):
                    summary = processed.get('summary', 'N/A')
                    history_text += f"  Summary: {summary}\n"
                
                history_text += "\n"
            
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
                        metadatas=[{"source": "supabase_history", "ngo_user_id": user_id}],
                        ids=[doc_id]
                    )
                    count += 1
        except Exception as e:
            return jsonify({"error": f"Gemini Embedding Error during Sync: {str(e)}"}), 500

        if saved_rows:
            try:
                synced_report_id = saved_rows[0].get("id")
                supabase.table("chatbot_synced_reports").update({"knowledge_chunks": count}).eq("id", synced_report_id).execute()
            except Exception as e:
                print(f"WARNING: Failed to update synced report chunk count: {e}")
                
        return jsonify({"success": True, "message": f"Synced {len(issues)} issues and {len(run_agent_reports)} reports as {count} context chunks and saved a report snapshot."}), 200

    except Exception as e:
        return jsonify({"error": f"Failed to sync history: {str(e)}"}), 500

@app.route('/api/chat', methods=['POST'])
def chat():
    """Process user queries against the vector db and generate LLM response."""
    data = request.json or {}
    query = data.get("query")
    history = data.get("history") or []  # Expecting list of {role: "user"|"assistant", content: "..."}
    
    if not query:
        return jsonify({"error": "Query cannot be empty"}), 400
        
    ngo_user_id = data.get("ngo_user_id")
    if not ngo_user_id:
        return jsonify({"error": "ngo_user_id is required"}), 400
        
    try:
        query_emb = get_embedding(query)
    except Exception as e:
        return jsonify({"error": f"Embedding Error: {str(e)}"}), 500

    # Retrieve context — cap n_results to avoid crashing when collection is small
    total_docs = collection.count() # This is a global count, it's fine just for limiting n_results loosely
    n_results = min(5, total_docs) if total_docs > 0 else 0
    
    retrieved_docs = []
    if n_results > 0:
        results = collection.query(
            query_embeddings=[query_emb],
            n_results=n_results,
            where={"ngo_user_id": ngo_user_id}
        )
        retrieved_docs = results['documents'][0] if results['documents'] else []
    
    if retrieved_docs:
        context_section = "Relevant context from uploaded NGO reports and historical data:\n\n" + "\n\n---\n\n".join(retrieved_docs)
    else:
        context_section = "No uploaded reports or historical data available."
        
    # Format history for the prompt
    history_section = ""
    if history:
        history_section = "Chat History (Current Session):\n"
        for msg in history:
            role_label = "User" if msg.get("role") == "user" else "Assistant"
            history_section += f"{role_label}: {msg.get('content')}\n"
        history_section += "\n---\n"

    prompt = f"""You are an expert AI assistant for NGO management and analysis. Your primary role is to help NGO workers understand their field reports and data.

You have access to the following context from the organization's uploaded reports and database:

{context_section}

{history_section}

Instructions:
- If the user's question can be answered using the context above, prioritize that information.
- Use the Chat History to maintain context of the current conversation.
- If the context does not contain relevant information, use your own expert knowledge to answer helpfully.
- Always be concise, actionable, and professional.
- If asked about specific data points not in the context, let the user know and suggest they upload the relevant report.

User Question: {query}

Answer:"""

    try:
        model = genai.GenerativeModel("gemini-2.5-flash-lite")
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
    unassigned_text = "No active unassigned issues."
    history_text = "No historical issues found."
    volunteers_text = "No volunteers found."

    if supabase:
        try:
            issues_res = supabase.table("issues").select("*").eq("ngo_user_id", ngo_user_id).order("created_at", desc=True).limit(30).execute()
            issues = issues_res.data or []
            
            # Separate active unassigned vs historical
            unassigned_issues = [iss for iss in issues if iss.get('status') == 'unassigned']
            historical_issues = [iss for iss in issues if iss.get('status') != 'unassigned']

            if unassigned_issues:
                lines = ["Current UNASSIGNED Crises:"]
                for iss in unassigned_issues:
                    lines.append(f"- [{iss.get('sector','N/A')}] {iss.get('issue_summary','N/A')} | Location: {iss.get('location','N/A')} | Urgency: {iss.get('urgency_score','?')}")
                unassigned_text = "\n".join(lines)
                
            if historical_issues:
                lines = ["Historical/Assigned Issues Log (for context only):"]
                for iss in historical_issues[:15]:
                    lines.append(f"- [{iss.get('sector','N/A')}] {iss.get('issue_summary','N/A')} | Status: {iss.get('status','N/A')}")
                history_text = "\n".join(lines)
                
            # Build volunteer workload map
            vol_loads = {}
            for iss in historical_issues:
                if iss.get('status') == 'assigned' and iss.get('assigned_volunteer_id'):
                    vid = iss.get('assigned_volunteer_id')
                    vol_loads[vid] = vol_loads.get(vid, 0) + 1

        except Exception as e:
            print(f"Supabase issues fetch error: {e}")

        try:
            vols_res = supabase.table("volunteers").select("*").eq("ngo_user_id", ngo_user_id).eq("is_active", True).execute()
            volunteers = vols_res.data or []
            if volunteers:
                lines = ["Active Volunteers (with Current Workload):"]
                for vol in volunteers:
                    active_load = vol_loads.get(vol.get('id'), 0)
                    lines.append(
                        f"- ID:{vol.get('id','')} | Name: {vol.get('name','N/A')} | "
                        f"Skills: {', '.join(vol.get('skills') or [])} | "
                        f"Zone: {vol.get('zone','N/A')} | "
                        f"Availability: {vol.get('availability_hours_per_week','?')}h/week | "
                        f"CURRENT ACTIVE ISSUES: {active_load}"
                    )
                volunteers_text = "\n".join(lines)
        except Exception as e:
            print(f"Supabase volunteers fetch error: {e}")
            
        try:
            reports_res = supabase.table("run_agent_reports").select("*").eq("ngo_user_id", ngo_user_id).order('created_at', desc=True).limit(5).execute()
            r_data = reports_res.data or []
            if r_data:
                lines = ["Recent Run Agent Pipeline Reports:"]
                for rpt in r_data:
                    lines.append(f"- Title: {rpt.get('title', 'N/A')} | Source: {rpt.get('source_type','N/A')} | Date: {rpt.get('created_at', 'N/A')}")
                reports_text = "\n".join(lines)
        except Exception as e:
            print(f"Supabase run_agent_reports fetch error: {e}")
    else:
        print("WARNING: Supabase not available. Analysis will use report context only.")

    # --- 2. Pull uploaded report context from ChromaDB ---
    report_context = "No reports uploaded to knowledge base yet."
    total_docs = collection.count()
    try:
        query_emb = get_embedding("issues problems needs resource requirements sector location affected")
        results = collection.query(query_embeddings=[query_emb], n_results=6, where={"ngo_user_id": ngo_user_id})
        docs = results['documents'][0] if results['documents'] else []
        if docs:
            report_context = "Relevant Excerpts from Uploaded Field Reports:\n\n" + "\n\n---\n\n".join(docs)
    except Exception as e:
        print(f"ChromaDB query error: {e}")

    # --- 3. Build Gemini Prompt ---
    prompt = f"""You are an NGO Operations Strategist. Your goal is to cross-reference our Database Records with recent Field Reports to find gaps.

## DATABASE RECORDS (What we already know)
- UNASSIGNED CRISES IN DB:
{unassigned_text}

- HISTORICAL CONTEXT:
{history_text}

- VOLUNTEER CAPACITY:
{volunteers_text}

## UPLOADED REPORT CONTEXT (Raw data from the field)
{report_context}

## YOUR TASK
Perform a deep analysis. Do not just summarize what is already in the database. 
1. **Identify Missing Issues**: Find problems mentioned in the "Uploaded Report Context" that ARE NOT listed in the "UNASSIGNED CRISES IN DB". These are newly discovered gaps.
2. **Predictive Risk**: Forecast what will happen in the next 48-72 hours if these specific issues aren't addressed.
3. **Optimized Placement**: Assign volunteers to the DB issues, ensuring workload is safe.

Return a JSON object with this structure:

{{
  "predictions": [
    {{
      "title": "A tactical forecast (e.g. 'Potential Water Disease Outbreak')",
      "description": "Specific reasoning linking report data to DB history",
      "sector": "sector",
      "urgency": "high|medium|low",
      "confidence": "high|medium|low",
      "timeframe": "48h-72h",
      "resolution": "Specific preventative tactical operation to stop the trend",
      "resource_allocation": [{{"item": "Medication", "quantity": "500 units", "priority": "high", "reason": "Based on trend X"}}],
      "overall_risk_assessment": "How this impacts the NGO's mission",
      "needed_skills": ["List", "of", "skills", "needed", "for", "prevention"]
    }}
  ],
  "assignments": [
    {{
      "issue_summary": "Description of unassigned issue",
      "type": "database_sync" | "discovered_from_report",
      "sector": "sector",
      "location": "location",
      "urgency_score": 8,
      "primary_volunteer": {{
         "name": "Name",
         "skills": ["skill1"],
         "zone": "zone",
         "reason": "Why they are safe/optimized"
      }},
      "backup_volunteers": []
    }}
  ],
  "summary": "High-level strategic overview of gaps found between reports and the database."
}}

IMPORTANT:
- If you find a new issue in the 'Uploaded Report Context' that isn't in the DB, add it to 'assignments' with type 'discovered_from_report'.
- For 'database_sync' issues, use the exact data provided.
- Return ONLY valid JSON.
"""

    try:
        model = genai.GenerativeModel("gemini-2.5-flash-lite")
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

        if supabase:
            assignments = result.get("assignments", [])
            for assignment in assignments:
                pv = assignment.get("primary_volunteer")
                if pv is None:
                    try:
                        urgency_score = int(assignment.get("urgency_score", 5))
                    except:
                        urgency_score = 5

                    urg_str = "low"
                    if urgency_score >= 8: urg_str = "critical"
                    elif urgency_score >= 6: urg_str = "high"
                    elif urgency_score >= 4: urg_str = "medium"

                    reason_text = "Skill shortage"
                    b_vols = assignment.get("backup_volunteers", [])
                    if b_vols and isinstance(b_vols, list) and isinstance(b_vols[0], dict):
                        reason_text = b_vols[0].get("reason", reason_text)
                    
                    req_payload = {
                        "owner_id": ngo_user_id,
                        "title": assignment.get("issue_summary", "Help Needed"),
                        "description": f"Automated Request: We urgently need volunteers for an ongoing crisis matching this criteria.\\nReason: {reason_text}\\nLocation: {assignment.get('location', 'N/A')}",
                        "category": assignment.get("sector", "General"),
                        "urgency": urg_str,
                        "location": assignment.get("location", "N/A"),
                        "volunteers_needed": 1,
                        "funding_amount": 0,
                        "skills_needed": [assignment.get("sector", "General")],
                        "contact_method": "Platform Messaging"
                    }
                    try:
                        supabase.table("ngo_requests").insert(req_payload).execute()
                        print("Automated community post created for missing volunteer.")
                    except Exception as e:
                        print(f"Failed to post automated request: {e}")


            # Persist individual predictions to the new smart_predictions table
            try:
                preds = result.get("predictions", [])
                if preds:
                    insert_data = []
                    for p in preds:
                        insert_data.append({
                            "ngo_user_id": ngo_user_id,
                            "title": p.get("title", ""),
                            "description": p.get("description", ""),
                            "sector": p.get("sector", "unknown"),
                            "urgency": p.get("urgency", "low"),
                            "confidence": p.get("confidence", "low"),
                            "timeframe": p.get("timeframe", ""),
                            "resolution": p.get("resolution", ""),
                            "resource_allocation": p.get("resource_allocation", []),
                            "overall_risk_assessment": p.get("overall_risk_assessment", ""),
                            "needed_skills": p.get("needed_skills", [])
                        })
                    supabase.table("smart_predictions").insert(insert_data).execute()
                    print("Smart predictions persisted separately.")
            except Exception as e:
                print(f"Failed to persist individual smart predictions: {e}")

        return jsonify({"success": True, "analysis": result}), 200
    except Exception as e:
        return jsonify({"error": f"Analysis generation failed: {str(e)}"}), 500


def rehydrate_chroma():
    try:
        total_docs = collection.count()
        if total_docs > 0:
            print(f"ChromaDB is already hydrated with {total_docs} documents.")
            return

        if not supabase:
            print("Supabase client not initialized. Cannot rehydrate ChromaDB.")
            return

        print("Local ChromaDB is empty. Rehydrating from Supabase...")
        res = supabase.table("chatbot_synced_reports").select("*").execute()
        reports = res.data or []
        
        count = 0
        for report in reports:
            user_id = report.get("ngo_user_id", "system")
            source_type = report.get("source_type")
            
            if source_type == "supabase_history":
                raw_data = report.get("report_data", [])
                if isinstance(raw_data, dict):
                    issues = raw_data.get("issues", [])
                    agent_reports = raw_data.get("run_agent_reports", [])
                else:
                    issues = raw_data
                    agent_reports = []

                history_text = "Historical NGO Issues Log:\n\n"
                for issue in issues:
                    history_text += f"- Issue: {issue.get('issue_summary', 'N/A')}\n"
                    history_text += f"  Sector: {issue.get('sector', 'N/A')}\n"
                    history_text += f"  Location: {issue.get('location', 'N/A')}\n"
                    history_text += f"  Affected: {issue.get('affected_count', 'N/A')}\n"
                    history_text += f"  Urgency Score: {issue.get('urgency_score', 'N/A')}\n"
                    history_text += f"  Date: {issue.get('created_at', 'N/A')}\n\n"
                
                if agent_reports:
                    history_text += "NGO Run Agent Pipeline Reports Log:\n\n"
                    for rpt in agent_reports:
                        history_text += f"- Report Title: {rpt.get('title', 'N/A')}\n"
                        history_text += f"  Source Type: {rpt.get('source_type', 'N/A')}\n"
                        history_text += f"  Date: {rpt.get('created_at', 'N/A')}\n"
                        pipeline = rpt.get('pipeline_result') or {}
                        if isinstance(pipeline, dict):
                            history_text += f"  Alerts Generated: {len(pipeline.get('alerts', []))}\n"
                            history_text += f"  Issues Extracted: {len(pipeline.get('issues', []))}\n"
                        processed = rpt.get('processed_output') or {}
                        if isinstance(processed, dict):
                            history_text += f"  Summary: {processed.get('summary', 'N/A')}\n"
                        history_text += "\n"
                    
                chunks = chunk_text(history_text, chunk_size=800, overlap=100)
                for i, c_text in enumerate(chunks):
                    emb = get_embedding(c_text)
                    if emb:
                        doc_id = f"supabase_sync_{user_id}_{report.get('id', 'r')}_chunk_{i}"
                        collection.upsert(
                            documents=[c_text],
                            embeddings=[emb],
                            metadatas=[{"source": "supabase_history", "ngo_user_id": user_id}],
                            ids=[doc_id]
                        )
                        count += 1
                        
            elif source_type == "uploaded_document":
                report_data_list = report.get("report_data", [])
                if report_data_list and isinstance(report_data_list, list):
                    data = report_data_list[0]
                    if isinstance(data, dict):
                        filename = data.get("filename", "unknown")
                        text = data.get("text", "")
                        if text:
                            chunks = chunk_text(text)
                            for i, c_text in enumerate(chunks):
                                if not c_text.strip(): continue
                                emb = get_embedding(c_text)
                                if emb:
                                    # Need a unique ID in case same filename uploaded multiple times
                                    doc_id = f"{filename}_{report.get('id', 'r')}_chunk_{i}"
                                    collection.upsert(
                                        documents=[c_text],
                                        embeddings=[emb],
                                        metadatas=[{"source": filename, "ngo_user_id": user_id}],
                                        ids=[doc_id]
                                    )
                                    count += 1
        print(f"Rehydration complete. Restored {count} chunk(s).")
    except Exception as e:
        print(f"Failed to rehydrate fallback: {e}")

rehydrate_chroma()

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5001))
    app.run(host='0.0.0.0', port=port, debug=True)
