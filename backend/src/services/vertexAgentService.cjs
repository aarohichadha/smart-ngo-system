const { VertexAI } = require("@google-cloud/vertexai");
const axios = require("axios");
const fs = require("fs");
require("dotenv").config();

const project = process.env.GCP_PROJECT_ID;
const location = process.env.GCP_LOCATION;
const ML_BACKEND_URL = process.env.ML_BACKEND_URL || "https://ml-backend-209112805853.asia-south2.run.app";

function getGoogleAuthOptions() {
  const credentialEnvNames = [
    "GOOGLE_APPLICATION_CREDENTIALS",
    "VERTEX_AI_CREDENTIALS",
    "GOOGLE_CREDENTIALS",
    "GCP_CREDENTIALS",
    "GOOGLE_SERVICE_ACCOUNT_JSON",
  ];

  const detectedEnvName = credentialEnvNames.find((name) => {
    const value = process.env[name];
    return typeof value === "string" && value.trim().length > 0;
  });

  if (!detectedEnvName) {
    console.warn(
      "[VertexAgent] No Google credentials env var found. Falling back to default Cloud Run service account auth."
    );
    return {};
  }

  const rawCreds = process.env[detectedEnvName].trim();
  console.warn(`[VertexAgent] Google credentials detected in ${detectedEnvName}.`);

  try {
    if (rawCreds.trim().startsWith("{")) {
      return {
        credentials: JSON.parse(rawCreds),
      };
    }
  } catch (error) {
    console.error(
      `[VertexAgent] Failed to parse JSON credentials from ${detectedEnvName}: ${error.message}`
    );
    return {};
  }

  try {
    const decoded = Buffer.from(rawCreds, "base64").toString("utf8").trim();
    if (decoded.startsWith("{")) {
      return {
        credentials: JSON.parse(decoded),
      };
    }
  } catch (error) {
    console.error(
      `[VertexAgent] Failed to parse base64 JSON credentials from ${detectedEnvName}: ${error.message}`
    );
  }

  if (fs.existsSync(rawCreds)) {
    return {
      keyFilename: rawCreds,
    };
  }

  console.warn(
    `[VertexAgent] ${detectedEnvName} was detected but is not JSON, base64 JSON, or a valid file path. Falling back to default auth.`
  );
  return {};
}

const vertexAI = new VertexAI({
  project,
  location,
  googleAuthOptions: getGoogleAuthOptions(),
});

const MODEL_NAME = process.env.VERTEX_MODEL || "gemini-2.5-flash";

const ALLOWED_SECTORS = new Set([
  "water",
  "healthcare",
  "electricity",
  "sanitation",
  "food",
  "education",
  "shelter",
  "safety",
  "logistics",
  "counseling",
  "other",
]);

const SKILL_ALIASES = {
  healthcare: ["medic", "nurse", "doctor", "health", "medical", "first aid", "paramedic", "clinical"],
  water: ["water", "plumb", "hydraulic", "sanit", "hydro", "purif", "well", "irrigation"],
  sanitation: ["sanit", "hygiene", "waste", "sewage", "clean", "toilet", "latrine"],
  electricity: ["electr", "power", "solar", "energy", "wiring", "generator", "grid"],
  shelter: ["shelter", "construct", "build", "housing", "tent", "camp", "structur"],
  food: ["food", "nutrition", "supply", "distribut", "ration", "cook", "agri"],
  education: ["teach", "educat", "train", "school", "lit", "tutor", "learn"],
  safety: ["secur", "safety", "protect", "guard", "rescue", "emerg", "police", "fire"],
  logistics: ["logist", "transport", "driver", "deliver", "coordinat", "supply chain", "fleet"],
  counseling: ["counsel", "psych", "mental", "trauma", "support", "social work", "therapy"],
};

function sanitizeSector(value) {
  const normalized = String(value || "other").toLowerCase().trim();
  return ALLOWED_SECTORS.has(normalized) ? normalized : "other";
}

function inferSector(text) {
  const lower = String(text || "").toLowerCase();

  if (/(water|drinking|pipeline|well|flood|rain|drought)/.test(lower)) return "water";
  if (/(hospital|clinic|medicine|medical|doctor|disease|outbreak|health)/.test(lower)) return "healthcare";
  if (/(toilet|sanitation|waste|sewage|garbage|hygiene)/.test(lower)) return "sanitation";
  if (/(food|ration|hunger|nutrition|meal|grain)/.test(lower)) return "food";
  if (/(school|student|teacher|class|education)/.test(lower)) return "education";
  if (/(shelter|tent|housing|roof|home|homeless)/.test(lower)) return "shelter";
  if (/(electric|power|light|wiring|generator)/.test(lower)) return "electricity";
  if (/(safety|violence|unsafe|security|rescue|fire)/.test(lower)) return "safety";
  if (/(transport|delivery|supply|logistics|vehicle)/.test(lower)) return "logistics";
  if (/(trauma|counsel|mental|psychological)/.test(lower)) return "counseling";

  return "other";
}

function inferSeverityHint(text) {
  const lower = String(text || "").toLowerCase();

  if (/(death|fatal|critical|immediate|urgent|emergency|life risk|no water|outbreak|severe|evacuation)/.test(lower)) {
    return "critical";
  }

  if (/(high risk|shortage|flood|disease|injury|unsafe|contaminated|rapidly worsening|out of medicines)/.test(lower)) {
    return "high";
  }

  if (/(needed|required|delay|limited|insufficient|disruption|affected)/.test(lower)) {
    return "medium";
  }

  return "low";
}

function inferAffectedCount(text) {
  const value = String(text || "");

  const familyMatch = value.match(/(\d+)\s*(families|family)/i);
  if (familyMatch) {
    return Number(familyMatch[1]) * 5;
  }

  const peopleMatch = value.match(/(\d+)\s*(people|persons|residents|villagers|students|patients)/i);
  if (peopleMatch) {
    return Number(peopleMatch[1]);
  }

  const approxMatch = value.match(/~\s*(\d+)/);
  if (approxMatch) {
    return Number(approxMatch[1]);
  }

  return 0;
}

function splitIntoIssueCandidates(rawInput) {
  const text = String(rawInput || "").trim();

  if (!text) return [];

  const lines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length > 1) {
    return lines;
  }

  return text
    .split(/(?<=[.!?])\s+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 10);
}

function cleanJsonText(text) {
  let raw = String(text || "").trim();

  if (raw.startsWith("```")) {
    raw = raw.replace(/^```json/i, "").replace(/^```/i, "").replace(/```$/i, "").trim();
  }

  const firstArray = raw.indexOf("[");
  const lastArray = raw.lastIndexOf("]");

  if (firstArray !== -1 && lastArray !== -1 && lastArray > firstArray) {
    return raw.slice(firstArray, lastArray + 1);
  }

  const firstObject = raw.indexOf("{");
  const lastObject = raw.lastIndexOf("}");

  if (firstObject !== -1 && lastObject !== -1 && lastObject > firstObject) {
    return raw.slice(firstObject, lastObject + 1);
  }

  return raw;
}

function normalizeIssue(issue, index, rawTextForFallback = "") {
  const summary =
    issue.issue_summary ||
    issue.summary ||
    issue.title ||
    issue.description ||
    rawTextForFallback ||
    `Issue ${index + 1}`;

  const sector = sanitizeSector(issue.sector || issue.issue_type || inferSector(summary));
  const affectedCount = Number(issue.affected_count || issue.affected || inferAffectedCount(summary) || 0);

  return {
    id: issue.id || undefined,
    issue_summary: String(summary).trim(),
    sector,
    location: String(issue.location || issue.area || "Unknown").trim(),
    affected_count: Number.isFinite(affectedCount) ? affectedCount : 0,
    severity_hint: issue.severity_hint || issue.severity || inferSeverityHint(summary),
    status: "unassigned",
    created_at: new Date().toISOString(),
  };
}

function fallbackExtractIssues(rawInput) {
  const candidates = splitIntoIssueCandidates(rawInput);

  return candidates
    .filter((candidate) => {
      const lower = candidate.toLowerCase();
      return /(water|medicine|clinic|food|shelter|school|power|electric|sanitation|unsafe|families|people|affected|urgent|emergency|shortage|flood|health|medical)/.test(lower);
    })
    .map((candidate, index) => normalizeIssue({}, index, candidate));
}

async function extractIssuesWithVertex(rawInput, logStep) {
  logStep("Extraction Agent", "Parsing report", "Sending raw field report to Vertex AI for structured issue extraction.");

  const model = vertexAI.getGenerativeModel({
    model: MODEL_NAME,
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 2048,
    },
  });

  const prompt = `
You are an NGO field report extraction engine.

Extract every actionable issue from the report.

Return ONLY valid JSON array. No markdown. No explanation.

Each item must have:
{
  "issue_summary": "clear one-line issue",
  "sector": "water|healthcare|electricity|sanitation|food|education|shelter|safety|logistics|counseling|other",
  "location": "specific place if present, else Unknown",
  "affected_count": number,
  "severity_hint": "critical|high|medium|low"
}

Rules:
- If the report says families, estimate 1 family = 5 people.
- Do not return empty array if the report contains any human/community problem.
- Split multiple problems into separate issues.
- Use simple, direct issue summaries.

REPORT:
${rawInput}
`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const parsed = JSON.parse(cleanJsonText(text));

    const list = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed.issues)
        ? parsed.issues
        : [];

    const issues = list
      .map((issue, index) => normalizeIssue(issue, index))
      .filter((issue) => issue.issue_summary && issue.issue_summary.length > 3);

    if (issues.length > 0) {
      logStep("Extraction Agent", "Success", `Extracted ${issues.length} issue(s) using Vertex AI.`);
      return issues;
    }

    logStep("Extraction Agent", "Fallback triggered", "Vertex returned no issues, using deterministic fallback extraction.");
    return fallbackExtractIssues(rawInput);
  } catch (error) {
    logStep("Extraction Agent", "Fallback triggered", `Vertex extraction failed: ${error.message}. Using deterministic fallback.`);
    return fallbackExtractIssues(rawInput);
  }
}

function scoreIssue(issue) {
  const criticalSectors = ["water", "healthcare", "sanitation", "shelter", "safety"];
  const sectorBase = criticalSectors.includes(issue.sector) ? 3.5 : 2.0;

  const affected = Number(issue.affected_count || 0);
  const affectedScore = affected >= 500 ? 3 : affected >= 100 ? 2.2 : affected >= 25 ? 1.4 : affected > 0 ? 0.8 : 0.4;

  const severity = String(issue.severity_hint || "low").toLowerCase();
  const severityScore =
    severity === "critical" ? 3.5 :
    severity === "high" ? 2.8 :
    severity === "medium" ? 1.8 :
    1.0;

  const urgency = Math.min(10, sectorBase + affectedScore + severityScore);

  return {
    ...issue,
    priority_score: Number(urgency.toFixed(1)),
    urgency_score: Number(urgency.toFixed(1)),
  };
}

function calculateCosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length || vecA.length === 0) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

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

  const r = String(requiredLoc).toLowerCase();
  const v = String(volunteerLoc).toLowerCase();

  if (r === v) return 1.0;
  if (r.includes(v) || v.includes(r)) return 0.7;

  return 0.3;
}

function calculateSkillOverlapScore(volunteerSkills, issueSector, issueSummary) {
  if (!Array.isArray(volunteerSkills) || volunteerSkills.length === 0) return 0;

  const sectorLower = String(issueSector || "").toLowerCase();
  const summaryLower = String(issueSummary || "").toLowerCase();
  const aliases = SKILL_ALIASES[sectorLower] || [sectorLower];

  let bestScore = 0;

  for (const skill of volunteerSkills) {
    const skillLower = String(skill || "").toLowerCase().trim();
    if (!skillLower) continue;

    if (skillLower === sectorLower) {
      bestScore = Math.max(bestScore, 1.0);
      continue;
    }

    if (aliases.some((alias) => skillLower.includes(alias) || alias.includes(skillLower))) {
      bestScore = Math.max(bestScore, 0.85);
      continue;
    }

    if (summaryLower.includes(skillLower)) {
      bestScore = Math.max(bestScore, 0.6);
      continue;
    }

    if (
      sectorLower.length >= 4 &&
      (sectorLower.includes(skillLower.slice(0, 4)) || skillLower.includes(sectorLower.slice(0, 4)))
    ) {
      bestScore = Math.max(bestScore, 0.35);
    }
  }

  return bestScore;
}

async function generateLocalEmbedding(text) {
  try {
    const response = await axios.post(`${ML_BACKEND_URL}/api/embed`, { text }, { timeout: 15000 });
    return response.data.embedding || [];
  } catch (err) {
    console.warn("[VertexAgent] ML backend embed failed:", err.message);
    return [];
  }
}

function finalMatchScore({ cosine, skillOverlap, locationScore, pastSuccessRate }) {
  const score =
    Math.max(0, cosine) * 0.35 +
    skillOverlap * 0.4 +
    locationScore * 0.15 +
    pastSuccessRate * 0.1;

  return Number((score * 100).toFixed(1));
}

async function matchVolunteers(issues, volunteers, ngo_user_id, supabase, logStep) {
  logStep("Matching Agent", "Matching volunteers", `Matching ${issues.length} issue(s) against ${volunteers.length} volunteer(s).`);

  const assignments = [];
  const matchedIssues = issues.map((issue) => ({ ...issue }));
  const activeVolunteers = (volunteers || []).filter((volunteer) => volunteer.is_active !== false);
  const volunteerLoads = {};

  for (const volunteer of activeVolunteers) {
    volunteerLoads[volunteer.id] = 0;
  }

  for (let index = 0; index < matchedIssues.length; index++) {
    const issue = matchedIssues[index];

    const requiredText = `Issue: ${issue.issue_summary}. Sector: ${issue.sector}. Location: ${issue.location}.`;
    const requiredEmbedding = await generateLocalEmbedding(requiredText);

    const scoredVolunteers = [];

    for (const volunteer of activeVolunteers) {
      const capacity = Number(volunteer.availability_hours_per_week || 10);
      const currentLoad = volunteerLoads[volunteer.id] || 0;

      if (currentLoad >= capacity) continue;

      const volunteerText = `Name: ${volunteer.name}. Skills: ${(volunteer.skills || []).join(", ")}. Zone: ${volunteer.zone || ""}. Experience: ${volunteer.experience_area || ""}.`;

      let cosine = 0;
      if (requiredEmbedding.length > 0) {
        const volunteerEmbedding = await generateLocalEmbedding(volunteerText);
        cosine = calculateCosineSimilarity(requiredEmbedding, volunteerEmbedding);
      }

      const skillOverlap = calculateSkillOverlapScore(
        volunteer.skills || [],
        issue.sector,
        issue.issue_summary
      );

      const locationScore = calculateLocationScore(issue.location, volunteer.zone);
      const pastSuccessRate = Number(volunteer.past_success_rate || 0.85);

      const matchScore = finalMatchScore({
        cosine,
        skillOverlap,
        locationScore,
        pastSuccessRate,
      });

      scoredVolunteers.push({
        ...volunteer,
        matchScore,
        skillOverlap,
        cosine,
        locationScore,
      });
    }

    scoredVolunteers.sort((a, b) => b.matchScore - a.matchScore);

    const bestMatch = scoredVolunteers[0];

    if (bestMatch && bestMatch.matchScore >= 35) {
      volunteerLoads[bestMatch.id] = (volunteerLoads[bestMatch.id] || 0) + 1;

      matchedIssues[index] = {
        ...issue,
        status: "assigned",
        assigned_volunteer_id: bestMatch.id,
        assignment_reason: `AI match score ${bestMatch.matchScore}%. Skill overlap ${Math.round(bestMatch.skillOverlap * 100)}%, semantic similarity ${Math.round(Math.max(0, bestMatch.cosine) * 100)}%, location fit ${Math.round(bestMatch.locationScore * 100)}%.`,
      };

      assignments.push({
        issue_index: index,
        issue_summary: issue.issue_summary,
        volunteer_id: bestMatch.id,
        volunteer_name: bestMatch.name,
        match_score: bestMatch.matchScore,
        assignment_reason: matchedIssues[index].assignment_reason,
      });
    }
  }

  logStep("Matching Agent", "Completed", `Created ${assignments.length} assignment(s).`);

  return {
    matchedIssues,
    assignments,
  };
}

function buildAlerts(issues, assignments) {
  const alerts = [];

  const criticalUnassigned = issues.filter(
    (issue) =>
      issue.status !== "assigned" &&
      (issue.severity_hint === "critical" || Number(issue.priority_score || 0) >= 8)
  );

  if (criticalUnassigned.length > 0) {
    alerts.push({
      type: "critical_unassigned",
      message: `${criticalUnassigned.length} critical issue(s) remain unassigned.`,
      severity: "critical",
    });
  }

  if (issues.length > 0 && assignments.length === 0) {
    alerts.push({
      type: "skill_gap",
      message: "No suitable volunteer assignment could be made. Check volunteer skills, zones, and availability.",
      severity: "warning",
    });
  }

  if (issues.length > 0 && assignments.length === issues.length) {
    alerts.push({
      type: "reallocation",
      message: "All extracted issues received volunteer assignments.",
      severity: "info",
    });
  }

  return alerts;
}

function buildFinalReport(issues, assignments, alerts) {
  const issueLines = issues.map((issue, index) => {
    return `${index + 1}. ${issue.issue_summary} | Sector: ${issue.sector} | Location: ${issue.location} | Priority: ${issue.priority_score} | Status: ${issue.status}`;
  });

  const assignmentLines = assignments.map((assignment, index) => {
    return `${index + 1}. ${assignment.issue_summary} -> ${assignment.volunteer_name} (${assignment.match_score}%)`;
  });

  const alertLines = alerts.map((alert, index) => {
    return `${index + 1}. [${alert.severity}] ${alert.message}`;
  });

  return [
    "NGO AGENT PIPELINE REPORT",
    "",
    "EXTRACTED ISSUES:",
    issueLines.length ? issueLines.join("\n") : "No issues extracted.",
    "",
    "ASSIGNMENTS:",
    assignmentLines.length ? assignmentLines.join("\n") : "No assignments created.",
    "",
    "ALERTS:",
    alertLines.length ? alertLines.join("\n") : "No alerts generated.",
  ].join("\n");
}

async function persistResultsToSupabase({ supabase, ngo_user_id, issues, assignments, rawInput, finalReport }) {
  if (!supabase || !ngo_user_id) {
    return;
  }

  try {
    const issueRows = issues.map((issue) => ({
      ngo_user_id,
      issue_summary: issue.issue_summary,
      sector: issue.sector,
      location: issue.location,
      affected_count: issue.affected_count,
      urgency_score: issue.urgency_score,
      status: issue.status,
      assigned_volunteer_id: issue.assigned_volunteer_id || null,
    }));

    if (issueRows.length > 0) {
      const { data: insertedIssues, error } = await supabase
        .from("issues")
        .insert(issueRows)
        .select();

      if (error) {
        console.error("[VertexAgent] Failed to persist issues:", error.message);
      } else if (Array.isArray(insertedIssues)) {
        for (let i = 0; i < insertedIssues.length; i++) {
          if (insertedIssues[i]?.id) {
            issues[i].id = insertedIssues[i].id;
          }
        }
      }
    }
  } catch (error) {
    console.error("[VertexAgent] Issue persistence failed:", error.message);
  }

  try {
    await supabase.from("run_agent_reports").insert({
      ngo_user_id,
      title: `Agent run - ${new Date().toISOString()}`,
      source_type: "manual_input",
      raw_input: rawInput,
      processed_output: {
        summary: finalReport,
      },
      pipeline_result: {
        issues,
        assignments,
      },
    });
  } catch (error) {
    console.error("[VertexAgent] Run report persistence failed:", error.message);
  }
}

async function runVertexAgent(rawInput, volunteers, ngo_user_id, supabase) {
  console.log("[VertexAgent] Starting deterministic pipeline.");

  const state = {
    rawInput: String(rawInput || ""),
    volunteers: Array.isArray(volunteers) ? volunteers : [],
    issues: [],
    assignments: [],
    alerts: [],
    agentLogs: [],
    currentStep: "ingestion",
    isComplete: false,
    confidence: 0,
    finalReport: "",
  };

  const logStep = (agent, decision, reasoning) => {
    const entry = {
      agent,
      timestamp: new Date().toISOString(),
      decision,
      reasoning,
    };

    state.agentLogs.push(entry);
    console.log(`[VertexAgent] ${agent} | ${decision}: ${reasoning}`);
  };

  try {
    if (!state.rawInput.trim()) {
      throw new Error("No input report text provided.");
    }

    logStep("Ingestion Agent", "Input received", `Received ${state.rawInput.length} characters and ${state.volunteers.length} volunteer(s).`);

    state.currentStep = "extraction";
    state.issues = await extractIssuesWithVertex(state.rawInput, logStep);

    state.currentStep = "scoring";
    state.issues = state.issues.map(scoreIssue);
    logStep("Scoring Agent", "Completed", `Scored ${state.issues.length} issue(s).`);

    state.currentStep = "matching";
    const { matchedIssues, assignments } = await matchVolunteers(
      state.issues,
      state.volunteers,
      ngo_user_id,
      supabase,
      logStep
    );

    state.issues = matchedIssues;
    state.assignments = assignments;

    state.currentStep = "reporting";
    state.alerts = buildAlerts(state.issues, state.assignments);
    state.finalReport = buildFinalReport(state.issues, state.assignments, state.alerts);
    state.confidence = state.issues.length > 0 ? 0.87 : 0.35;

    await persistResultsToSupabase({
      supabase,
      ngo_user_id,
      issues: state.issues,
      assignments: state.assignments,
      rawInput: state.rawInput,
      finalReport: state.finalReport,
    });

    state.currentStep = "complete";
    state.isComplete = true;

    logStep(
      "System",
      "Pipeline completed",
      `Finished with ${state.issues.length} issue(s), ${state.assignments.length} assignment(s), and ${state.alerts.length} alert(s).`
    );

    console.log("[VertexAgent] Final state before return:", JSON.stringify(state, null, 2));

    return state;
  } catch (error) {
    console.error("[VertexAgent] Pipeline failed:", error);

    state.currentStep = "complete";
    state.isComplete = true;
    state.alerts.push({
      type: "critical_unassigned",
      message: `Pipeline failed: ${error.message}`,
      severity: "critical",
    });

    logStep("System", "Error", error.message);

    state.finalReport = buildFinalReport(state.issues, state.assignments, state.alerts);

    return state;
  }
}

module.exports = {
  runVertexAgent,
};
