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
    Runs Smart Analysis (forward-looking only):
    - Pulls historical issues + active volunteers from Supabase
    - Pre-computes skill->volunteer availability table in Python (ground truth for Gemini)
    - Pulls relevant context from uploaded reports in ChromaDB
    - Sends curated, pre-computed data to Gemini for forward-looking predictions and insights
    - Assignment of volunteers to current issues is handled separately by the Vertex Agent
    """
    import json as _json

    # Each assigned issue consumes this many of a volunteer's weekly hours.
    # A volunteer CAN hold multiple issues; each one burns HOURS_PER_ISSUE from their capacity.
    HOURS_PER_ISSUE = 1

    data = request.json or {}
    ngo_user_id = data.get("ngo_user_id")

    if not ngo_user_id:
        return jsonify({"error": "ngo_user_id is required"}), 400

    # --- 1. Pull from Supabase ---
    active_issues_text = "No active issues on record."
    volunteers_text = "No volunteers on record."
    skill_availability_table = ""   # pre-computed, injected verbatim into the prompt
    volunteer_lookup = []           # Python-level records with computed fields

    SKILL_LIST = ["Healthcare", "Water", "Electricity", "Sanitation", "Food",
                  "Education", "Shelter", "Safety", "Logistics", "Counseling"]

    if supabase:
        try:
            # Fetch all active issues (unassigned + assigned) as live field signals
            issues_res = supabase.table("issues").select(
                "sector, issue_summary, location, urgency_score, status, affected_count"
            ).eq("ngo_user_id", ngo_user_id).in_("status", ["unassigned", "assigned"]).execute()
            issues = issues_res.data or []

            if issues:
                lines = ["CURRENT ACTIVE ISSUES IN THE FIELD:"]
                for iss in issues:
                    lines.append(
                        f"- [{iss.get('sector','N/A').upper()}] {iss.get('issue_summary','N/A')} "
                        f"| Location: {iss.get('location','N/A')} "
                        f"| Urgency: {iss.get('urgency_score','?')} "
                        f"| Affected: {iss.get('affected_count','?')} "
                        f"| Status: {iss.get('status','N/A')}"
                    )
                active_issues_text = "\n".join(lines)
            print(f"Fetched {len(issues)} active issues for context.")
        except Exception as e:
            print(f"Supabase issues fetch error: {e}")

        try:
            # Count assigned issues per volunteer (each issue burns HOURS_PER_ISSUE from capacity)
            assigned_res = supabase.table("issues").select(
                "assigned_volunteer_id"
            ).eq("ngo_user_id", ngo_user_id).eq("status", "assigned").not_.is_(
                "assigned_volunteer_id", "null"
            ).execute()
            vol_loads: dict = {}
            for row in (assigned_res.data or []):
                vid = row.get("assigned_volunteer_id")
                if vid:
                    vol_loads[vid] = vol_loads.get(vid, 0) + 1
            print(f"Active assignment counts: {vol_loads}")
        except Exception as e:
            vol_loads = {}
            print(f"Supabase workload fetch error: {e}")

        try:
            # Fetch volunteers and compute remaining hours with the HOURS_PER_ISSUE multiplier
            vols_res = supabase.table("volunteers").select(
                "id, name, skills, zone, availability_hours_per_week, is_active"
            ).eq("ngo_user_id", ngo_user_id).eq("is_active", True).execute()
            volunteers = vols_res.data or []

            if volunteers:
                roster_lines = [
                    "ACTIVE VOLUNTEER ROSTER:",
                    f"NOTE: Each assigned issue consumes {HOURS_PER_ISSUE}h of a volunteer's weekly capacity.",
                    "      A volunteer CAN hold multiple issues simultaneously.",
                    "      Remaining Hours = Weekly Hours - (Assigned Issues x 1h per issue)",
                    "      AVAILABLE = Remaining Hours > 0 | UNAVAILABLE = Remaining Hours = 0",
                    "",
                ]
                for vol in volunteers:
                    total_hrs = vol.get('availability_hours_per_week') or 10
                    assigned_count = vol_loads.get(vol.get('id'), 0)
                    hours_used = assigned_count * HOURS_PER_ISSUE
                    remaining = max(0, total_hrs - hours_used)
                    is_available = remaining > 0
                    status_tag = "AVAILABLE" if is_available else "UNAVAILABLE"
                    skills_list = vol.get('skills') or []
                    skills_str = ', '.join(skills_list) or 'None listed'

                    roster_lines.append(
                        f"- {vol.get('name', 'N/A')} | Skills: {skills_str} | "
                        f"Zone: {vol.get('zone', 'N/A')} | "
                        f"Weekly: {total_hrs}h | Assigned Issues: {assigned_count} | "
                        f"Hours Used: {hours_used}h | Remaining: {remaining}h | {status_tag}"
                    )
                    volunteer_lookup.append({
                        "name": vol.get('name', 'N/A'),
                        "skills": [s.capitalize() for s in skills_list],
                        "zone": vol.get('zone', 'N/A'),
                        "assigned_count": assigned_count,
                        "remaining_hours": remaining,
                        "is_available": is_available,
                    })

                volunteers_text = "\n".join(roster_lines)

            # --- Build pre-computed skill -> volunteer availability table ---
            # This table is the GROUND TRUTH passed to Gemini. Gemini must not recalculate it.
            skill_rows = []
            for skill in SKILL_LIST:
                available_vols = [
                    v for v in volunteer_lookup
                    if skill in v["skills"] and v["is_available"]
                ]
                exhausted_vols = [
                    v for v in volunteer_lookup
                    if skill in v["skills"] and not v["is_available"]
                ]
                if available_vols:
                    avail_str = ", ".join(
                        f"{v['name']} ({v['remaining_hours']}h left, zone: {v['zone']}, load: {v['assigned_count']} issues)"
                        for v in available_vols
                    )
                    exhausted_str = ", ".join(v['name'] for v in exhausted_vols) or "none"
                    skill_rows.append(
                        f"  {skill}: COVERED — available: [{avail_str}] | exhausted: [{exhausted_str}]"
                    )
                elif exhausted_vols:
                    exhausted_str = ", ".join(
                        f"{v['name']} (0h left, {v['assigned_count']} issues)" for v in exhausted_vols
                    )
                    skill_rows.append(
                        f"  {skill}: GAP (all matching volunteers exhausted) — [{exhausted_str}]"
                    )
                else:
                    skill_rows.append(
                        f"  {skill}: GAP (no volunteer with this skill in roster)"
                    )

            skill_availability_table = (
                "PRE-COMPUTED SKILL AVAILABILITY TABLE\n"
                "(Generated by system — do NOT override, recalculate, or second-guess this table):\n"
                + "\n".join(skill_rows)
            )

            print(f"Fetched {len(volunteers)} active volunteers for context.")
            print("=== VOLUNTEER ROSTER ===")
            print(volunteers_text)
            print("\n=== SKILL AVAILABILITY TABLE ===")
            print(skill_availability_table)
            print("=================================")
        except Exception as e:
            print(f"Supabase volunteers fetch error: {e}")
    else:
        print("WARNING: Supabase not available. Analysis will use report context only.")

    # --- 2. Pull uploaded report context from ChromaDB ---
    report_context = "No field reports uploaded to knowledge base yet."
    try:
        query_emb = get_embedding(
            "issues problems needs resource requirements sector location affected volunteers capacity"
        )
        results = collection.query(
            query_embeddings=[query_emb], n_results=5, where={"ngo_user_id": ngo_user_id}
        )
        docs = results['documents'][0] if results['documents'] else []
        if docs:
            report_context = "EXCERPTS FROM UPLOADED FIELD REPORTS:\n\n" + "\n\n---\n\n".join(docs)
    except Exception as e:
        print(f"ChromaDB query error: {e}")


    # --- 3. Build Gemini Prompt ---
    skill_vocabulary = ", ".join(SKILL_LIST)

    prompt = f"""You are a Senior NGO Operational Intelligence Analyst. Your role is strictly FORWARD-LOOKING.
Do NOT assign volunteers to existing issues — that is handled by a separate system.
Your job: forecast future crises, assess volunteer readiness using the pre-computed ground-truth data below, and surface strategic insights.

## SKILL TAXONOMY (only valid skill values in this system)
{skill_vocabulary}
Never invent new skill names. Always use exact capitalisation from this list.

## CURRENT FIELD DATA

### Section A — Active Issues (Live Field Signals)
Used for forecasting future risks. Do NOT re-process these as new assignments.
{active_issues_text}

### Section B — Volunteer Roster (Reference Only)
{volunteers_text}

### Section C — AUTHORITATIVE SKILL AVAILABILITY TABLE ← YOUR PRIMARY SOURCE OF TRUTH
{skill_availability_table}

THIS TABLE IS THE SINGLE SOURCE OF TRUTH FOR VOLUNTEER AVAILABILITY.
- If a skill row says COVERED: Volunteers listed as "available" MUST be placed in ready_volunteers if that skill is needed.
- If a skill row says GAP:
    • "exhausted" volunteers MUST go into missing_requirements as "<Name> has no hours left".
    • "no volunteer..." skills MUST go into missing_requirements as "No <Skill> volunteer in roster".
- NEVER put a COVERED-available volunteer into missing_requirements.
- NEVER put a GAP-exhausted volunteer into ready_volunteers.

### Section D — Uploaded Field Reports (Raw Context)
{report_context}

---

## YOUR THREE TASKS

### TASK 1 — Predict Future Crises (2 to 4 predictions)
Forecast crises likely to emerge or escalate in the next 48-96 hours.
- Prediction logic: Cite specific issues (Section A) or report signals (Section D).
- Needed Skills: Identify 1-3 skills from the taxonomy required for prevention.
- Matching Logic (CROSS-CHECKSection C):
    • For every skill needed: If Section C says COVERED, add all listed available volunteers to 'ready_volunteers'.
    • If Section C says GAP, add the specific reason to 'missing_requirements' and set capacity_gap = true.

### TASK 2 — Volunteer Needs (Gap Analysis)
For every 'capacity_gap' prediction, specify exactly what is missing: skill name, estimated count, zone, and urgency.

### TASK 3 — Strategic Insights (3 to 5 insights)
Surface operational intelligence (capacity_risk, blind_spot, skill_gap, coverage_ok, escalation_risk).
BE SPECIFIC: Reference real names, zones, and hour counts from Section B/C.

---

Return ONLY valid JSON. No markdown fences. No preamble.

{{
  "predictions": [
    {{
      "title": "<Specific crisis forecast title>",
      "description": "<2-3 sentence reasoning citing live data.>",
      "sector": "<one of the taxonomy skills, lowercase>",
      "urgency": "high|medium|low",
      "confidence": "high|medium|low",
      "timeframe": "48-72h|72-96h",
      "resolution": "<Action to prevent this crisis.>",
      "needed_skills": ["<SkillFromTaxonomy>"],
      "capacity_gap": false,
      "missing_requirements": [],
      "ready_volunteers": [
        {{
          "name": "<Name from Section C>",
          "skills": ["<SkillFromTaxonomy>"],
          "zone": "<Zone from roster>",
          "current_load": "<assigned_count from Section B>",
          "availability_hours": "<remaining_hours from Section B>"
        }}
      ]
    }}
  ],
  "volunteer_needs": [
    {{
      "skill": "<SkillFromTaxonomy>",
      "count_needed": "<integer>",
      "zone": "<Zone from data>",
      "urgency": "high|medium|low",
      "linked_prediction": "<prediction title>",
      "reason": "<Specific data-backed reason>"
    }}
  ],
  "insights": [
    {{
      "type": "capacity_risk|blind_spot|skill_gap|coverage_ok|escalation_risk",
      "title": "<Insight Title>",
      "detail": "<Specific detail with names/hours.>",
      "action": "<Managerial action needed>"
    }}
  ],
  "summary": "<Overall health of the organization and top priority.>"
}}

CRITICAL VALIDATION:
1. Every name in ready_volunteers MUST match Section C's "available" list for the given skill.
2. If remaining_hours > 0, they MUST NOT be in missing_requirements.
3. Use the exact skill names from the taxonomy.
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
            # Persist predictions to the smart_predictions table
            try:
                preds = result.get("predictions", [])
                # Attach shared insights to each prediction row for easy retrieval
                shared_insights = result.get("insights", [])
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
                            "overall_risk_assessment": result.get("summary", ""),
                            "needed_skills": p.get("needed_skills", []),
                            "capacity_gap": p.get("capacity_gap", False),
                            "missing_resources": p.get("missing_requirements", []),
                            "ready_volunteers": p.get("ready_volunteers", []),
                            "insights": shared_insights  # shared across all predictions in this run
                        })
                    supabase.table("smart_predictions").insert(insert_data).execute()
                    print(f"Persisted {len(insert_data)} smart predictions with {len(shared_insights)} insights.")
                    if result.get("volunteer_needs"):
                        print(f"Volunteer needs detected: {[n.get('skill') for n in result.get('volunteer_needs', [])]}")
            except Exception as e:
                print(f"Failed to persist smart predictions: {e}")

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
