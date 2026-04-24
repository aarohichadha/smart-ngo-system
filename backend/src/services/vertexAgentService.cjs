const { VertexAI, SchemaType } = require("@google-cloud/vertexai");
const axios = require("axios");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

// Initialize Vertex AI
const project = process.env.GCP_PROJECT_ID || "ngo-system-493616";
const location = process.env.GCP_LOCATION || "us-central1";
const vertexAI = new VertexAI({ project, location });

const ML_BACKEND_URL = process.env.VITE_ML_BACKEND_URL || "http://localhost:5000";

// --- Logic Helpers (Ported from Orchestrator) ---

const sanitizeSector = (value) => {
  const allowed = new Set([
    'water', 'healthcare', 'electricity', 'sanitation', 'food',
    'education', 'shelter', 'safety', 'logistics', 'counseling', 'other',
  ]);
  const normalized = (value || 'other').toLowerCase().trim();
  return allowed.has(normalized) ? normalized : 'other';
};

const normalizeSkillTag = (value) =>
  (value || '').toLowerCase().trim().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');

const inferSeverityHint = (text) => {
  const lower = text.toLowerCase();
  if (/(death|fatal|critical|immediate|urgent|emergency|life\s*risk|no\s*water|outbreak|severe)/i.test(lower)) return 'critical';
  if (/(high\s*risk|shortage|flood|disease|injury|unsafe|contaminated|rapidly\s*worsening)/i.test(lower)) return 'high';
  if (/(needed|required|delay|limited|insufficient|disruption)/i.test(lower)) return 'medium';
  return 'low';
};

/**
 * Tool logic for extract_issues
 */
async function extractIssuesLogic(rawInput) {
  console.log("[VertexAgent] Tool: extract_issues");
  // In a real ReAct loop, the model provides the issues it found.
  // But if the model wants US to do it, we provide this logic.
  // We'll return a structured version of the input.
  return { status: "success", message: "Issues extracted systemically from input." };
}

/**
 * Tool logic for score_issues
 */
async function scoreIssuesLogic(issues) {
  console.log("[VertexAgent] Tool: score_issues", { count: issues?.length });
  return (issues || []).map(issue => {
    const criticalSectors = ['water', 'healthcare', 'sanitation', 'shelter', 'safety'];
    const baseCritical = criticalSectors.includes(issue.sector) ? 0.5 : 0.2;
    const affectedScore = Math.min(1.0, (issue.affected_count || 0) / 500);
    const severityBoost = issue.severity_hint === 'critical' ? 0.4 : issue.severity_hint === 'high' ? 0.25 : 0.1;
    const urgency = Math.min(10, (baseCritical + affectedScore + severityBoost) * 10 / 1.6);
    return {
      priority_score: parseFloat(urgency.toFixed(1)),
      urgency_score: parseFloat(urgency.toFixed(1))
    };
  });
}


// --- Vector Math Helpers (ported from frontend/src/lib/vectorUtils.ts) ---

function calculateCosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length || vecA.length === 0) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function calculateLocationScore(requiredLoc, volunteerLoc) {
  if (!requiredLoc || !volunteerLoc) return 0.5;
  const r = requiredLoc.toLowerCase();
  const v = volunteerLoc.toLowerCase();
  if (r === v) return 1.0;
  if (r.includes(v) || v.includes(r)) return 0.5;
  return 0.1;
}

function calculateFinalMatchScore(cosineSimilarity, pastSuccessRate = 1.0, locationScore = 1.0) {
  const normalizedCosine = Math.max(0, cosineSimilarity);
  const W_SKILL = 0.6, W_SUCCESS = 0.2, W_LOCATION = 0.2;
  return Number(((normalizedCosine * W_SKILL) + (pastSuccessRate * W_SUCCESS) + (locationScore * W_LOCATION)) * 100).toFixed(1);
}

/**
 * Calls the ML backend to generate an embedding for a text string.
 */
async function generateLocalEmbedding(text) {
  try {
    const response = await axios.post(`${ML_BACKEND_URL}/api/embed`, { text });
    return response.data.embedding || [];
  } catch (err) {
    console.warn("[VertexAgent] ML backend embed failed, returning empty vector:", err.message);
    return [];
  }
}

/**
 * Computes a partial/fuzzy skill overlap score between a volunteer's skills
 * and the required skills inferred from the issue.
 * Returns 0.0–1.0. Handles exact matches, partial substring matches, and
 * semantic aliases (e.g. "medic" vs "healthcare", "water tech" vs "water").
 */
const SKILL_ALIASES = {
  healthcare: ['medic', 'nurse', 'doctor', 'health', 'medical', 'first aid', 'paramedic', 'clinical'],
  water: ['water', 'plumb', 'hydraulic', 'sanit', 'hydro', 'purif', 'well', 'irrigation'],
  sanitation: ['sanit', 'hygiene', 'waste', 'sewage', 'clean', 'toilet', 'latrine'],
  electricity: ['electr', 'power', 'solar', 'energy', 'wiring', 'generator', 'grid'],
  shelter: ['shelter', 'construct', 'build', 'housing', 'tent', 'camp', 'structur'],
  food: ['food', 'nutrition', 'supply', 'distribut', 'ration', 'cook', 'agri'],
  education: ['teach', 'educat', 'train', 'school', 'lit', 'tutor', 'learn'],
  safety: ['secur', 'safety', 'protect', 'guard', 'rescue', 'emerg', 'police', 'fire'],
  logistics: ['logist', 'transport', 'driver', 'deliver', 'coordinat', 'supply chain', 'fleet'],
  counseling: ['counsel', 'psych', 'mental', 'trauma', 'support', 'social work', 'therapy'],
};

function calculateSkillOverlapScore(volunteerSkills, issueSector, issueSummary) {
  if (!volunteerSkills || volunteerSkills.length === 0) return 0;

  const summaryLower = (issueSummary || '').toLowerCase();
  const sectorLower = (issueSector || '').toLowerCase();
  const aliases = SKILL_ALIASES[sectorLower] || [sectorLower];

  let totalScore = 0;

  for (const skill of volunteerSkills) {
    const skillLower = (skill || '').toLowerCase().trim();
    if (!skillLower) continue;

    // Exact sector match
    if (skillLower === sectorLower) { totalScore += 1.0; continue; }

    // Alias match (e.g. volunteer has "medic", issue is healthcare)
    if (aliases.some(alias => skillLower.includes(alias) || alias.includes(skillLower))) {
      totalScore += 0.8;
      continue;
    }

    // Substring match against issue summary keywords
    const summaryWords = summaryLower.split(/\W+/).filter(w => w.length > 3);
    if (summaryWords.some(word => skillLower.includes(word) || word.includes(skillLower))) {
      totalScore += 0.5;
      continue;
    }

    // Partial character overlap with sector (catches typos/abbreviations)
    if (sectorLower.includes(skillLower.substring(0, 4)) || skillLower.includes(sectorLower.substring(0, 4))) {
      totalScore += 0.3;
    }
  }

  // Normalize to 0–1 (cap at 1.0)
  return Math.min(1.0, totalScore / volunteerSkills.length);
}

function calculateFinalMatchScoreEnhanced(cosineSimilarity, skillOverlap, pastSuccessRate = 0.9, locationScore = 0.5) {
  const normalizedCosine = Math.max(0, cosineSimilarity);
  // Weights: cosine semantic = 45%, skill overlap = 25%, location = 15%, success rate = 15%
  const W_COSINE = 0.45, W_OVERLAP = 0.25, W_LOCATION = 0.15, W_SUCCESS = 0.15;
  const raw = (normalizedCosine * W_COSINE) + (skillOverlap * W_OVERLAP) + (locationScore * W_LOCATION) + (pastSuccessRate * W_SUCCESS);
  return Number((raw * 100).toFixed(1));
}

/**
 * Tool logic for match_volunteers — cosine similarity + partial skill overlap pipeline
 */
async function matchVolunteersLogic(issues, volunteers, ngo_user_id, supabase) {
  console.log("[VertexAgent] Tool: match_volunteers (cosine + overlap)", { issueCount: issues?.length, volunteerCount: volunteers?.length });

  const matched = issues.map(i => ({ ...i }));
  const assignments = [];
  const volunteerLoads = {};
  volunteers.forEach(v => { volunteerLoads[v.id] = 0; });

  for (let i = 0; i < matched.length; i++) {
    const issue = matched[i];
    if (issue.status === 'assigned') continue;

    console.log(`[SmartMatch] Issue ${i}: ${issue.issue_summary?.substring(0, 50)}...`);

    // Build embedding query from issue description
    const skillQuery = `Skills required for: ${issue.issue_summary}. Sector: ${issue.sector || 'general'}. Location: ${issue.location || 'unknown'}.`;
    const requiredEmbedding = await generateLocalEmbedding(skillQuery);

    const activeVolunteers = volunteers.filter(v => v.is_active !== false);

    const scoredVolunteers = await Promise.all(activeVolunteers.map(async (vol) => {
      const volunteerProfileText = `Skills: ${(vol.skills || []).join(", ")}. Zone: ${vol.zone || ""}. Experience: ${vol.experience_area || ""}.`;

      // Semantic cosine similarity via ML backend embeddings
      let cosine = 0;
      if (requiredEmbedding.length > 0) {
        const volEmbedding = await generateLocalEmbedding(volunteerProfileText);
        cosine = calculateCosineSimilarity(requiredEmbedding, volEmbedding);
      }

      // Partial/fuzzy skill overlap (handles similar-but-not-exact skills)
      const skillOverlap = calculateSkillOverlapScore(vol.skills || [], issue.sector, issue.issue_summary);

      const locScore = calculateLocationScore(issue.location || "", vol.zone || "");
      const pastSuccessRate = vol.past_success_rate || 0.9;
      const finalScore = calculateFinalMatchScoreEnhanced(cosine, skillOverlap, pastSuccessRate, locScore);

      return {
        ...vol,
        matchScore: finalScore,
        cosinePercentage: Math.round(Math.max(0, cosine) * 100),
        overlapPercentage: Math.round(skillOverlap * 100),
        locScore: Math.round(locScore * 100)
      };
    }));

    scoredVolunteers.sort((a, b) => b.matchScore - a.matchScore);

    // Tiered capacity fallback: try 80% → 100% → any available
    const findByCapacity = (threshold) =>
      scoredVolunteers.find(v => (volunteerLoads[v.id] || 0) < (v.availability_hours_per_week || 10) * threshold);

    const bestMatch = findByCapacity(0.8) || findByCapacity(1.0) || scoredVolunteers[0];

    if (bestMatch) {
      const backupMatch = scoredVolunteers.find(v => v.id !== bestMatch.id);
      const backupInfo = backupMatch
        ? ` | Backup: ${backupMatch.name} (${backupMatch.matchScore}%)`
        : ' | No backup available';

      console.log(`[SmartMatch] Assigned issue ${i} → ${bestMatch.name} (${bestMatch.matchScore}% | cosine: ${bestMatch.cosinePercentage}% | overlap: ${bestMatch.overlapPercentage}%)`);

      matched[i] = {
        ...matched[i],
        status: 'assigned',
        assigned_volunteer_id: bestMatch.id,
        assignment_reason: `AI Smart Match (${bestMatch.matchScore}%). Semantic: ${bestMatch.cosinePercentage}%, Skill overlap: ${bestMatch.overlapPercentage}%, Location: ${bestMatch.locScore}%${backupInfo}`
      };

      volunteerLoads[bestMatch.id] = (volunteerLoads[bestMatch.id] || 0) + 1;
      assignments.push({
        issue_index: i,
        volunteer_id: bestMatch.id,
        volunteer_name: bestMatch.name,
        match_score: bestMatch.matchScore,
        assignment_reason: matched[i].assignment_reason
      });
    } else {
      console.warn(`[SmartMatch] No suitable volunteer for issue ${i}`);
      
      // Gap identified: create a community post
      if (supabase && ngo_user_id) {
          const req_payload = {
              "owner_id": ngo_user_id,
              "title": issue.issue_summary || "Help Needed",
              "description": `Automated Request: We urgently need volunteers for an ongoing crisis matching this criteria.\\nReason: No available volunteers in the system have the required capacity or skills.\\nLocation: ${issue.location || 'N/A'}`,
              "category": issue.sector || "General",
              "urgency": issue.priority_score >= 8 ? "critical" : (issue.priority_score >= 6 ? "high" : "medium"),
              "location": issue.location || "N/A",
              "volunteers_needed": 1,
              "funding_amount": 0,
              "skills_needed": [issue.sector || "General"],
              "contact_method": "Platform Messaging"
          };
          try {
              await supabase.table("ngo_requests").insert(req_payload);
              console.log("[SmartMatch] Automated community post created for missing volunteer gap.");
          } catch (e) {
              console.error("[SmartMatch] Failed to post automated request:", e.message);
          }
      }
    }
  }

  return { assignments, matched_issues: matched };
}


/**
 * Tool definitions (Function Declarations)
 */
const agentTools = [
  {
    function_declarations: [
      {
        name: "extract_issues",
        description: "Parse the field report and return a structured list of actionable issues. You MUST include the 'issues' array in your call with every issue you find.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            raw_input: { type: SchemaType.STRING, description: "Raw field report text." },
            issues: {
              type: SchemaType.ARRAY,
              description: "The list of issues you extracted from the report. REQUIRED.",
              items: {
                type: SchemaType.OBJECT,
                properties: {
                  issue_summary: { type: SchemaType.STRING, description: "A concise description of the issue." },
                  sector: { type: SchemaType.STRING, description: "Sector: water, healthcare, electricity, sanitation, food, education, shelter, safety, logistics, counseling, or other." },
                  location: { type: SchemaType.STRING, description: "Location/area affected." },
                  affected_count: { type: SchemaType.NUMBER, description: "Estimated number of people affected." },
                  severity_hint: { type: SchemaType.STRING, description: "Severity: critical, high, medium, or low." }
                },
                required: ["issue_summary", "sector"]
              }
            }
          },
          required: ["raw_input", "issues"]
        }
      },
      {
        name: "score_issues",
        description: "Calculate priority and urgency scores for the extracted issues.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            issues: {
              type: SchemaType.ARRAY,
              items: {
                type: SchemaType.OBJECT,
                properties: {
                  issue_summary: { type: SchemaType.STRING },
                  sector: { type: SchemaType.STRING },
                  affected_count: { type: SchemaType.NUMBER },
                  severity_hint: { type: SchemaType.STRING }
                }
              }
            }
          },
          required: ["issues"]
        }
      },
      {
        name: "detect_gaps",
        description: "Identify skill requirements and capacity gaps for a list of issues.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            issues: { type: SchemaType.ARRAY, items: { type: SchemaType.OBJECT } }
          },
          required: ["issues"]
        }
      },
      {
        name: "match_volunteers",
        description: "Assign issues to the best-fitting volunteers based on skills and location.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            issues: { type: SchemaType.ARRAY, items: { type: SchemaType.OBJECT } },
            active_volunteers: { type: SchemaType.ARRAY, items: { type: SchemaType.OBJECT } }
          },
          required: ["issues", "active_volunteers"]
        }
      }
    ]
  }
];

/**
 * Core ReAct Loop Execution
 */
async function runVertexAgent(rawInput, volunteers, ngo_user_id, supabase) {
  console.log("[VertexAgent] Starting pipeline for input length:", rawInput?.length);
  
  const model = vertexAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction: {
      role: "system",
      parts: [{
        text: `You are the NGO Orchestrator Agent. Process field reports and assign volunteers. You MUST call all 4 tools in order before giving a final answer.

MANDATORY TOOL SEQUENCE (do not skip any step):
1. Call extract_issues — parse ALL problems from the report. Include the 'issues' array in your call.
2. Call score_issues — pass the issues array from step 1 and add priority/urgency scores.
3. Call detect_gaps — pass the scored issues to identify skill requirements.
4. Call match_volunteers — pass the scored issues AND the active_volunteers list below. This step is REQUIRED.

Do NOT give a final text answer until you have called match_volunteers.

AVAILABLE VOLUNTEERS (pass these to match_volunteers as 'active_volunteers'):
${JSON.stringify(volunteers)}

EXPECTED OUTPUT:
You MUST execute the 4-step tool sequence. Once you have the results from 'match_volunteers', provide a concise 'NGO Action Plan Summary' as your final text response. Do not stop until assignments are complete.`
      }]
    },
    tools: agentTools,
    generationConfig: {
      temperature: 0.1, // Low temperature for consistent tool calling
      topP: 0.95,
      maxOutputTokens: 2048,
    }
  });

  const chat = model.startChat();
  let state = {
    rawInput,
    volunteers,
    issues: [],
    assignments: [],
    alerts: [],
    agentLogs: [],
    currentStep: "starting",
    isComplete: false
  };

  let message = [{ text: "Process this field report: " + rawInput }];
  let iterations = 0;
  const maxIterations = 10;

  try {
    while (iterations < maxIterations) {
      iterations++;
      console.log(`[VertexAgent] ReAct Iteration ${iterations}`);
      
      const result = await chat.sendMessage(message);
      const response = result.response;

      if (!response.candidates || response.candidates.length === 0) {
        throw new Error("No response candidates returned from the model. This could be due to safety filters.");
      }

      const candidate = response.candidates[0];
      const parts = candidate.content?.parts || [];
      
      // Find the "active" parts (text or function call)
      const functionCallPart = parts.find(p => p.functionCall);
      const textPart = parts.find(p => p.text);
      const thoughtPart = parts.find(p => p.thought); // Support for future 'thought' field if versioned

      const part = functionCallPart || textPart || thoughtPart || parts[0];

      if (!part) {
        console.warn("[VertexAgent] Empty response from model. Ending loop and using safety net.");
        break;
      }

      // Record thought/action in logs
      state.agentLogs.push({
        agent: "NGO Orchestrator",
        timestamp: new Date().toISOString(),
        decision: part.functionCall 
          ? `Decided to call ${part.functionCall.name}` 
          : (part.text ? "Generating plan summary" : "Reasoning..."),
        reasoning: thoughtPart?.thought || part.text || "Analyzing data to determine next action."
      });

      if (part.functionCall) {
        const { name, args } = part.functionCall;
        console.log(`[VertexAgent] Tool Execution: ${name}`);
        
        let toolResult;
        if (name === "extract_issues") {
          // Capture the issues the model extracted directly from its args
          if (Array.isArray(args.issues) && args.issues.length > 0) {
            state.issues = args.issues.map(issue => ({
              ...issue,
              sector: sanitizeSector(issue.sector),
              severity_hint: issue.severity_hint || inferSeverityHint(issue.issue_summary || ''),
              status: 'unassigned',
              created_at: new Date().toISOString()
            }));
            console.log(`[VertexAgent] Captured ${state.issues.length} issues from model.`);
          }
          toolResult = {
            status: "success",
            issues_captured: state.issues.length,
            message: `Captured ${state.issues.length} issues. Proceed to score_issues next.`
          };
        } else if (name === "score_issues") {
          const scored = await scoreIssuesLogic(args.issues || state.issues);
          toolResult = { scored_issues: scored };
          // Sync state
          if (args.issues) state.issues = args.issues;
          state.issues = state.issues.map((i, idx) => ({ ...i, ...scored[idx] }));
        } else if (name === "detect_gaps") {
          const requirements = (args.issues || state.issues).map(i => ({ 
            issue: i.issue_summary, 
            needs: [normalizeSkillTag(i.sector)] 
          }));
          toolResult = { required_skills: requirements };
          state.alerts.push({ type: 'info', message: "Skill requirements analyzed.", severity: "info" });
        } else if (name === "match_volunteers") {
          // Always use state.volunteers (loaded from Supabase) — never trust the model's args.active_volunteers
          // as it may pass an empty array if it couldn't parse the system prompt correctly.
          const issuesToMatch = (Array.isArray(args.issues) && args.issues.length > 0)
            ? args.issues
            : state.issues;
          const volunteersToUse = (Array.isArray(state.volunteers) && state.volunteers.length > 0)
            ? state.volunteers
            : (Array.isArray(args.active_volunteers) && args.active_volunteers.length > 0)
               ? args.active_volunteers
               : volunteers;

          console.log(`[VertexAgent] match_volunteers: ${issuesToMatch.length} issues, ${volunteersToUse.length} volunteers`);
          const { assignments, matched_issues } = await matchVolunteersLogic(issuesToMatch, volunteersToUse, ngo_user_id, supabase);
          toolResult = { assignments, total_assigned: assignments.length };
          state.assignments = assignments;
          if (matched_issues && matched_issues.length > 0) {
            state.issues = matched_issues;
          }
        }

        // Send observation back to chat
        message = [{
          functionResponse: {
            name,
            response: { content: toolResult }
          }
        }];
      } else {
        // Model returned final text summary
        state.currentStep = "complete";
        state.isComplete = true;
        state.finalReport = part.text;
        break;
      }
    }
  } catch (error) {
    console.error("[VertexAgent] Error in ReAct loop:", error);
    state.alerts.push({ type: 'critical_unassigned', message: "Agent loop failed: " + error.message, severity: "critical" });
  }

  // --- Safety Net: If issues were found but no volunteers were assigned, run matching now ---
  if (state.issues.length > 0 && state.assignments.length === 0 && volunteers.length > 0) {
    console.log("[VertexAgent] Safety net: running match_volunteers automatically.");
    try {
      const { assignments, matched_issues } = await matchVolunteersLogic(state.issues, volunteers, ngo_user_id, supabase);
      state.assignments = assignments;
      if (matched_issues && matched_issues.length > 0) state.issues = matched_issues;
      state.agentLogs.push({
        agent: "Safety Net",
        timestamp: new Date().toISOString(),
        decision: `Auto-assigned ${assignments.length} volunteer(s) to ${state.issues.length} issue(s).`,
        reasoning: "Model completed without calling match_volunteers. Fallback matching executed."
      });
    } catch (matchErr) {
      console.error("[VertexAgent] Safety net matching failed:", matchErr.message);
    }
  }

  state.currentStep = "complete";
  state.isComplete = true;
  return state;
}

module.exports = {
  runVertexAgent
};
