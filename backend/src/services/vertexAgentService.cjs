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
        ? ` | Backup: ${backupMatch.name} (ID:${backupMatch.id})`
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


// --- DYNAMIC MULTI-AGENT ARCHITECTURE (STATE MACHINE) ---

/**
 * Supervisor Agent - The Router
 * Decides which agent to call next based on the current state.
 */
async function supervisorRouter(state, logStep) {
  logStep("Supervisor", "Analyzing State", "Determining next logical step or handling feedback loops.");
  
  const model = vertexAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction: {
      role: "system",
      parts: [{ text: `You are the NGO AI Supervisor. Your job is to orchestrate a team of agents: Planner, Scorer, and Matcher.
      
      RULES:
      1. If the state is 'init', route to 'planner'.
      2. If issues are extracted but not scored, route to 'scorer'.
      3. If issues are scored but not matched, route to 'matcher'.
      4. If the Matcher or Scorer reports critical gaps/unassigned issues in 'messages', route to 'planner' with instructions to 'draft_escalation'.
      5. If all issues are processed or no further action is possible, call 'finalize_pipeline'.
      
      CURRENT MESSAGES FROM AGENTS:
      ${JSON.stringify(state.messages)}` }]
    },
    tools: [{
      function_declarations: [
        { name: "route_to_planner", description: "Direct the system to the Planner Agent to extract issues or draft escalation posts.", parameters: { type: SchemaType.OBJECT, properties: { instruction: { type: SchemaType.STRING, description: "Instructions for the planner: 'extract' or 'draft_escalation'" } }, required: ["instruction"] } },
        { name: "route_to_scorer", description: "Direct the system to the Scoring Agent to prioritize issues.", parameters: { type: SchemaType.OBJECT, properties: {} } },
        { name: "route_to_matcher", description: "Direct the system to the Matching Agent to assign volunteers.", parameters: { type: SchemaType.OBJECT, properties: {} } },
        { name: "finalize_pipeline", description: "End the process and provide a final summary report.", parameters: { type: SchemaType.OBJECT, properties: { summary: { type: SchemaType.STRING, description: "A concise executive summary of the NGO action plan." } }, required: ["summary"] } }
      ]
    }],
    generationConfig: { temperature: 0.1 }
  });

  const chat = model.startChat();
  const stateSummary = `Current Status: ${state.status}. Issues: ${state.issues.length}. Assignments: ${state.assignments.length}. Alerts: ${state.alerts.length}.`;
  const result = await chat.sendMessage(stateSummary);
  const part = result.response.candidates?.[0]?.content?.parts?.find(p => p.functionCall);

  if (part) {
    return { name: part.functionCall.name, args: part.functionCall.args };
  }
  
  // Fallback to finishing if the model is confused
  return { name: "finalize_pipeline", args: { summary: "Pipeline reached a terminal state unexpectedly." } };
}

async function plannerAgent(state, instruction, logStep) {
  logStep("Planner Agent", "Acting", `Mode: ${instruction}`);
  
  if (instruction === 'extract') {
    const model = vertexAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction: { role: "system", parts: [{ text: "Extract structured issues from this report. Call extract_issues tool." }] },
      tools: [{ function_declarations: [{
        name: "extract_issues",
        parameters: { type: SchemaType.OBJECT, properties: { issues: { type: SchemaType.ARRAY, items: { type: SchemaType.OBJECT, properties: { issue_summary: { type: SchemaType.STRING }, sector: { type: SchemaType.STRING }, location: { type: SchemaType.STRING }, affected_count: { type: SchemaType.NUMBER }, severity_hint: { type: SchemaType.STRING } }, required: ["issue_summary", "sector"] } } }, required: ["issues"] }
      }] }],
      generationConfig: { temperature: 0.1 }
    });

    try {
      const result = await model.generateContent(`Report: ${state.rawInput}`);
      const fc = result.response.candidates?.[0]?.content?.parts?.find(p => p.functionCall);
      if (fc && fc.functionCall.args.issues) {
        state.issues = fc.functionCall.args.issues.map(i => ({
          ...i,
          sector: sanitizeSector(i.sector),
          severity_hint: i.severity_hint || inferSeverityHint(i.issue_summary),
          status: 'unassigned',
          created_at: new Date().toISOString()
        }));
        state.status = 'planned';
        logStep("Planner Agent", "Success", `Extracted ${state.issues.length} issues.`);
      }
    } catch (e) { logStep("Planner Agent", "Error", e.message); }
  } else {
    // Draft Escalation Logic
    logStep("Planner Agent", "Escalation", "Drafting automated community alerts for unassigned issues.");
    state.alerts.push({ type: 'warning', message: "Emergency escalation initiated for unassigned critical needs.", severity: 'high' });
    state.messages.push("Planner: Escalation alerts drafted and added to state.");
    state.status = 'escalated';
  }
}

async function scoringAgent(state, logStep) {
  logStep("Scoring Agent", "Scoring", "Calculating priorities.");
  const scored = await scoreIssuesLogic(state.issues);
  state.issues = state.issues.map((i, idx) => ({ ...i, ...scored[idx] }));
  
  // Quick AI gap check
  const model = vertexAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  const result = await model.generateContent(`Analyze issues for gaps: ${JSON.stringify(state.issues)}`);
  const analysis = result.response.candidates?.[0]?.content?.parts?.[0]?.text || "";
  
  state.alerts.push({ type: 'info', message: "Urgency scores updated.", severity: 'info' });
  state.status = 'scored';
  logStep("Scoring Agent", "Success", "Issues scored and prioritized.");
}

async function matchingAgent(state, ngo_user_id, supabase, logStep) {
  logStep("Matching Agent", "Matching", "Searching for best volunteer fits.");
  const { assignments, matched_issues } = await matchVolunteersLogic(state.issues, state.volunteers, ngo_user_id, supabase);
  
  state.assignments = assignments;
  state.issues = matched_issues;
  state.status = 'matched';

  const unassigned = state.issues.filter(i => i.status !== 'assigned' && (i.priority_score > 7 || i.severity_hint === 'critical'));
  if (unassigned.length > 0) {
    const msg = `Matcher: Found ${unassigned.length} critical issues that cannot be filled by current volunteers. Escalation required.`;
    state.messages.push(msg);
    logStep("Matching Agent", "Gaps Found", msg);
  } else {
    logStep("Matching Agent", "Success", `Assigned ${assignments.length} volunteers.`);
  }
}

/**
 * Core Dynamic Orchestrator
 */
async function runVertexAgent(rawInput, volunteers, ngo_user_id, supabase) {
  console.log("[DynamicAgent] Starting autonomous pipeline.");
  
  const state = {
    rawInput,
    volunteers,
    issues: [],
    assignments: [],
    alerts: [],
    agentLogs: [],
    messages: [],
    status: 'init',
    isComplete: false,
    finalReport: ""
  };

  const logStep = (agent, decision, reasoning) => {
    state.agentLogs.push({ agent, timestamp: new Date().toISOString(), decision, reasoning });
  };

  let iterations = 0;
  const MAX_ITERATIONS = 6;

  try {
    while (!state.isComplete && iterations < MAX_ITERATIONS) {
      iterations++;
      console.log(`[DynamicAgent] Iteration ${iterations}, Status: ${state.status}`);
      
      const action = await supervisorRouter(state, logStep);
      
      switch (action.name) {
        case 'route_to_planner':
          await plannerAgent(state, action.args.instruction, logStep);
          break;
        case 'route_to_scorer':
          await scoringAgent(state, logStep);
          break;
        case 'route_to_matcher':
          await matchingAgent(state, ngo_user_id, supabase, logStep);
          break;
        case 'finalize_pipeline':
          state.isComplete = true;
          state.finalReport = action.args.summary;
          logStep("Supervisor", "Finalizing", "Pipeline mission accomplished.");
          break;
        default:
          state.isComplete = true;
          break;
      }
    }
  } catch (error) {
    console.error("[DynamicAgent] Loop Error:", error);
    logStep("System", "Error", error.message);
  }

  return state;
}

module.exports = {
  runVertexAgent
};
