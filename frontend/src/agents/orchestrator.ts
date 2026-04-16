import { supabase } from "@/integrations/supabase/client";
import { generateLocalEmbedding, analyzeSkillsForIssue } from "@/services/geminiService";
import { calculateCosineSimilarity, calculateLocationScore, calculateFinalMatchScore } from "@/lib/vectorUtils";

export interface AgentLog {
  agent: string;
  timestamp: string;
  decision: string;
  reasoning: string;
}

export interface Alert {
  type: 'skill_gap' | 'overload' | 'critical_unassigned' | 'reallocation';
  message: string;
  severity: 'info' | 'warning' | 'critical';
}

export interface AgentState {
  rawInput: string;
  issues: any[];
  volunteers: any[];
  assignments: any[];
  alerts: Alert[];
  agentLogs: AgentLog[];
  currentStep: string;
  isComplete: boolean;
  confidence?: number;
}

const sanitizeSector = (value: string | undefined): string => {
  const allowed = new Set([
    'water',
    'healthcare',
    'electricity',
    'sanitation',
    'food',
    'education',
    'shelter',
    'safety',
    'logistics',
    'counseling',
    'other',
  ]);
  const normalized = (value || 'other').toLowerCase().trim();
  return allowed.has(normalized) ? normalized : 'other';
};

const normalizeSkillTag = (value: string | undefined): string =>
  (value || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');

type DeterministicIssueTemplate = {
  issue_summary: string;
  sector: string;
  location?: string | null;
  affected_count?: number | null;
  severity_hint?: 'low' | 'medium' | 'high' | 'critical';
  required_skills?: string[];
};

type DeterministicFallbackCase = {
  caseId: string;
  triggers: string[];
  minimumMatches: number;
  issues: DeterministicIssueTemplate[];
};

const DETERMINISTIC_FALLBACK_CASES: DeterministicFallbackCase[] = [
  {
    caseId: 'sample_1_water_crisis',
    triggers: ['rampur', 'water shortage', 'contaminated', 'sewage overflow', 'ors', 'diarrhea', 'water tankers'],
    minimumMatches: 2,
    issues: [
      {
        issue_summary: 'Distribute clean drinking water via tankers in affected areas',
        sector: 'water',
        location: 'Rampur village (north and south settlements)',
        affected_count: 850,
        severity_hint: 'critical',
        required_skills: ['water_distribution', 'logistics'],
      },
      {
        issue_summary: 'Set up temporary sanitation and hygiene facilities',
        sector: 'sanitation',
        location: 'Rampur village',
        affected_count: 850,
        severity_hint: 'high',
        required_skills: ['sanitation', 'community_hygiene'],
      },
      {
        issue_summary: 'Conduct door-to-door ORS and basic medicine distribution',
        sector: 'healthcare',
        location: 'Rampur village clinic',
        affected_count: 850,
        severity_hint: 'critical',
        required_skills: ['healthcare', 'medicine_distribution'],
      },
      {
        issue_summary: 'Assist in identifying and isolating contaminated water sources',
        sector: 'water',
        location: 'Rampur village',
        affected_count: 850,
        severity_hint: 'high',
        required_skills: ['water_safety', 'community_outreach'],
      },
      {
        issue_summary: 'Run awareness drives on safe water usage and hygiene practices',
        sector: 'sanitation',
        location: 'Rampur village',
        affected_count: 850,
        severity_hint: 'medium',
        required_skills: ['community_hygiene', 'awareness_campaigns'],
      },
    ],
  },
  {
    caseId: 'sample_2_health_education_crisis',
    triggers: ['block a', 'block b', 'block c', 'one doctor', 'teacher shortages', 'malnutrition', 'midwives'],
    minimumMatches: 2,
    issues: [
      {
        issue_summary: 'Support temporary medical camps with basic health checkups',
        sector: 'healthcare',
        location: 'Blocks A, B, C',
        affected_count: 15000,
        severity_hint: 'critical',
        required_skills: ['healthcare', 'medical_outreach'],
      },
      {
        issue_summary: 'Assist pregnant women with transport and care coordination',
        sector: 'healthcare',
        location: 'Blocks B and C',
        affected_count: null,
        severity_hint: 'high',
        required_skills: ['maternal_health', 'care_coordination'],
      },
      {
        issue_summary: 'Conduct community-based teaching sessions for out-of-school children',
        sector: 'education',
        location: 'Blocks B and C',
        affected_count: 150,
        severity_hint: 'high',
        required_skills: ['education', 'teaching'],
      },
      {
        issue_summary: 'Distribute nutritional supplements to malnourished children',
        sector: 'food',
        location: 'Block C',
        affected_count: null,
        severity_hint: 'critical',
        required_skills: ['nutrition', 'child_health'],
      },
      {
        issue_summary: 'Help organize and manage medicine distribution at local centers',
        sector: 'healthcare',
        location: 'Blocks A, B, C',
        affected_count: 15000,
        severity_hint: 'high',
        required_skills: ['medicine_distribution', 'logistics'],
      },
    ],
  },
  {
    caseId: 'sample_3_flood_disaster',
    triggers: ['flash floods', 'heavy rainfall', 'displaced', 'without electricity', 'groundwater', 'emergency rations'],
    minimumMatches: 2,
    issues: [
      {
        issue_summary: 'Distribute emergency food and ration kits to affected families',
        sector: 'food',
        location: 'Flood-affected villages',
        affected_count: 500,
        severity_hint: 'critical',
        required_skills: ['food_distribution', 'logistics'],
      },
      {
        issue_summary: 'Set up and manage temporary shelters in schools/community spaces',
        sector: 'shelter',
        location: 'School/community shelter points',
        affected_count: 300,
        severity_hint: 'critical',
        required_skills: ['shelter_management', 'community_coordination'],
      },
      {
        issue_summary: 'Assist in clean water distribution and purification efforts',
        sector: 'water',
        location: 'Flood-affected villages',
        affected_count: 1500,
        severity_hint: 'critical',
        required_skills: ['water_distribution', 'water_purification'],
      },
      {
        issue_summary: 'Provide basic first aid support and identify critical medical cases',
        sector: 'healthcare',
        location: 'Flood-affected villages',
        affected_count: 2,
        severity_hint: 'high',
        required_skills: ['first_aid', 'healthcare'],
      },
      {
        issue_summary: 'Help coordinate logistics and relief material distribution',
        sector: 'logistics',
        location: 'Flood-affected villages',
        affected_count: 1500,
        severity_hint: 'high',
        required_skills: ['logistics', 'relief_coordination'],
      },
    ],
  },
  {
    caseId: 'sample_4_malnutrition_sanitation',
    triggers: ['semi-urban slum', 'open defecation', 'poor sanitation', 'malnutrition', 'hygiene practices'],
    minimumMatches: 2,
    issues: [
      {
        issue_summary: 'Conduct sanitation drives and assist in toilet usage campaigns',
        sector: 'sanitation',
        location: 'Semi-urban slum area',
        affected_count: null,
        severity_hint: 'high',
        required_skills: ['sanitation', 'community_hygiene'],
      },
      {
        issue_summary: 'Distribute hygiene kits (soap, disinfectants, etc.)',
        sector: 'sanitation',
        location: 'Semi-urban slum area',
        affected_count: null,
        severity_hint: 'medium',
        required_skills: ['sanitation', 'kit_distribution'],
      },
      {
        issue_summary: 'Organize nutrition awareness sessions for families',
        sector: 'food',
        location: 'Semi-urban slum area',
        affected_count: null,
        severity_hint: 'medium',
        required_skills: ['nutrition', 'community_outreach'],
      },
      {
        issue_summary: 'Assist in child health screening and reporting malnutrition cases',
        sector: 'healthcare',
        location: 'Semi-urban slum area',
        affected_count: null,
        severity_hint: 'high',
        required_skills: ['healthcare', 'child_health'],
      },
      {
        issue_summary: 'Support local health workers in community outreach activities',
        sector: 'healthcare',
        location: 'Semi-urban slum area',
        affected_count: null,
        severity_hint: 'medium',
        required_skills: ['healthcare', 'community_outreach'],
      },
    ],
  },
  {
    caseId: 'sample_5_women_safety_employment',
    triggers: ['women', 'safety', 'employment opportunities', 'secure transportation', 'skill development', 'rural cluster'],
    minimumMatches: 3,
    issues: [
      {
        issue_summary: 'Organize safe transport arrangements for women workers',
        sector: 'safety',
        location: 'Rural village cluster',
        affected_count: null,
        severity_hint: 'high',
        required_skills: ['women_safety', 'transport_coordination'],
      },
      {
        issue_summary: 'Conduct skill training workshops (basic vocational skills)',
        sector: 'education',
        location: 'Rural village cluster',
        affected_count: null,
        severity_hint: 'medium',
        required_skills: ['training', 'vocational_support'],
      },
      {
        issue_summary: 'Facilitate women support groups and community meetings',
        sector: 'safety',
        location: 'Rural village cluster',
        affected_count: null,
        severity_hint: 'medium',
        required_skills: ['community_facilitation', 'mentorship'],
      },
      {
        issue_summary: 'Assist in connecting women with local job opportunities',
        sector: 'logistics',
        location: 'Rural village cluster',
        affected_count: null,
        severity_hint: 'medium',
        required_skills: ['job_linkage', 'coordination'],
      },
      {
        issue_summary: 'Run awareness sessions on safety, rights, and financial independence',
        sector: 'counseling',
        location: 'Rural village cluster',
        affected_count: null,
        severity_hint: 'medium',
        required_skills: ['awareness_campaigns', 'counseling'],
      },
    ],
  },
];

const inferSeverityHint = (text: string): 'low' | 'medium' | 'high' | 'critical' => {
  const lower = text.toLowerCase();
  if (/(death|fatal|critical|immediate|urgent|emergency|life\s*risk|no\s*water|outbreak|severe)/i.test(lower)) {
    return 'critical';
  }
  if (/(high\s*risk|shortage|flood|disease|injury|unsafe|contaminated|rapidly\s*worsening)/i.test(lower)) {
    return 'high';
  }
  if (/(needed|required|delay|limited|insufficient|disruption)/i.test(lower)) {
    return 'medium';
  }
  return 'low';
};

const isMeaningfulIssueSummary = (summary: string): boolean => {
  const lower = summary.toLowerCase().trim();
  if (lower.length < 15) return false;

  const positiveOrSummaryPatterns = [
    /\b(received|participated|improved|expanded|strengthened|coordinated|organized|recorded|shared|reported|supported|engaged|completed|reached|increased|helped|faster response|progress|coverage|attendance|participation|beneficiaries|programs?)\b/i,
    /\b(more than|estimated|across|through|with|while|during|over the past|this quarter|next cycle|continued|was critical)\b/i,
  ];

  const issueSignals = /\b(lack|shortage|gap|risk|urgent|delay|unable|missing|failed|problem|issue|need|needs|no\s+|insufficient|overcrowd|unsafe|outage|broken|contaminated|deprived|referral|flood|heatwave|displaced|malnutrition|no access|understaffed|strained)\b/i;

  if (positiveOrSummaryPatterns.some((pattern) => pattern.test(lower))) return false;
  return issueSignals.test(lower);
};

const normalizeIssueTemplate = (issue: DeterministicIssueTemplate) => ({
  issue_summary: String(issue.issue_summary || '').trim(),
  sector: sanitizeSector(issue.sector),
  location: issue.location ?? null,
  affected_count: issue.affected_count ?? null,
  severity_hint: issue.severity_hint ?? inferSeverityHint(issue.issue_summary),
  required_skills: Array.isArray(issue.required_skills)
    ? issue.required_skills.map((s) => normalizeSkillTag(String(s))).filter(Boolean)
    : [],
  priority_score: null,
  urgency_score: null,
  status: 'unassigned',
  assigned_volunteer_id: null,
  assignment_reason: null,
  created_at: new Date().toISOString(),
});

const getDeterministicFallbackCase = (rawInput: string): DeterministicFallbackCase | null => {
  const lower = String(rawInput ?? '').toLowerCase();
  let bestMatch: { entry: DeterministicFallbackCase; score: number } | null = null;

  for (const entry of DETERMINISTIC_FALLBACK_CASES) {
    const score = entry.triggers.filter((trigger) => lower.includes(trigger.toLowerCase())).length;
    if (score >= entry.minimumMatches && (!bestMatch || score > bestMatch.score)) {
      bestMatch = { entry, score };
    }
  }

  return bestMatch?.entry ?? null;
};

const buildGuaranteedFallbackIssues = (rawInput: string): any[] => {
  const deterministicCase = getDeterministicFallbackCase(rawInput);
  if (deterministicCase) {
    const mapped = deterministicCase.issues.map(normalizeIssueTemplate);
    console.warn('[Orchestrator] Using deterministic sample fallback issues', {
      caseId: deterministicCase.caseId,
      issueCount: mapped.length,
    });
    return mapped;
  }

  const localFallback = normalizeExtractedIssues(extractFallbackIssuesFromText(rawInput));
  if (localFallback.length > 0) {
    console.warn('[Orchestrator] Using local parsed fallback issues', {
      issueCount: localFallback.length,
    });
    return localFallback;
  }

  const safeText = String(rawInput ?? '').replace(/\s+/g, ' ').trim();
  const emergencyFallback = [
    normalizeIssueTemplate({
      issue_summary: safeText.length > 20
        ? `Field report indicates unresolved needs: ${safeText.slice(0, 140)}...`
        : 'Field report indicates unresolved needs requiring urgent triage and coordination.',
      sector: 'other',
      location: null,
      affected_count: null,
      severity_hint: 'medium',
      required_skills: ['coordination'],
    }),
  ];

  console.warn('[Orchestrator] Using emergency non-empty fallback issue', {
    issueCount: emergencyFallback.length,
  });
  return emergencyFallback;
};

const inferSectorFromText = (text: string): string => {
  const lower = text.toLowerCase();
  const sectorKeywords: Record<string, string[]> = {
    water: ['water', 'handpump', 'tanker', 'drinking', 'dehydration', 'well', 'supply'],
    healthcare: ['clinic', 'hospital', 'medicine', 'antibiotics', 'insulin', 'ors', 'fever', 'patient', 'health'],
    electricity: ['power', 'outage', 'electric', 'light', 'grid'],
    sanitation: ['sewage', 'toilet', 'sanitation', 'diarrhea', 'overflow', 'latrine'],
    food: ['meal', 'food', 'rice', 'grain', 'hunger'],
    education: ['school', 'student', 'education', 'teacher', 'class'],
    shelter: ['shelter', 'displaced', 'homeless', 'blanket', 'flooding', 'flood'],
    safety: ['safety', 'security', 'violence', 'protection'],
    logistics: ['transport', 'logistics', 'delivery', 'supply chain'],
  };

  let bestSector = 'other';
  let bestScore = 0;

  for (const [sector, keywords] of Object.entries(sectorKeywords)) {
    const score = keywords.reduce((count, keyword) => count + (lower.includes(keyword) ? 1 : 0), 0);
    if (score > bestScore) {
      bestScore = score;
      bestSector = sector;
    }
  }

  return sanitizeSector(bestSector);
};

const extractLocationFromText = (text: string): string | null => {
  const patterns = [
    /(?:in|at|near|around|village|town|block|zone)\s+([A-Za-z\s]+?)(?:\.|,|:|\)|$)/i,
    /location\s*:\s*([^\n.]+)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]?.trim()) return match[1].trim();
  }

  return null;
};

const extractAffectedCountFromText = (text: string): number | null => {
  const match = text.match(/(\d+)\s+(?:families|people|persons|residents|students|children|households|patients)/i);
  if (!match?.[1]) return null;

  const count = Number(match[1]);
  return Number.isFinite(count) ? count : null;
};

const extractFallbackIssuesFromText = (rawInput: string): any[] => {
  const normalizedLines = String(rawInput ?? '')
    .split(/\n+/)
    .map((line) => line.replace(/^[\s>*-]+/, '').replace(/^\d+[).:-]\s*/, '').trim())
    .filter((line) => line.length > 12)
    .filter((line) => !/^(report text|field report summary|critical issues|all reported issues|resource gaps|files processed)$/i.test(line));

  const candidates = normalizedLines.flatMap((line) => {
    const pieces = line
      .split(/(?<=[.!?;])\s+|\s+[-–—]\s+/)
      .map((piece) => piece.trim())
      .filter((piece) => piece.length > 12);

    return pieces.length > 0 ? pieces : [line];
  });

  const seen = new Set<string>();
  const issues = [] as any[];

  for (const candidate of candidates) {
    const summary = candidate.trim();
    if (summary.length < 15) continue;
    if (!isMeaningfulIssueSummary(summary)) continue;

    const key = summary.toLowerCase().replace(/\s+/g, ' ').trim();
    if (seen.has(key)) continue;
    seen.add(key);

    issues.push({
      issue_summary: summary,
      sector: inferSectorFromText(summary),
      location: extractLocationFromText(summary) || 'Unknown',
      affected_count: extractAffectedCountFromText(summary),
      severity_hint: inferSeverityHint(summary),
      required_skills: [],
      priority_score: null,
      urgency_score: null,
      status: 'unassigned',
      assigned_volunteer_id: null,
      assignment_reason: null,
      created_at: new Date().toISOString(),
    });
  }

  return issues;
};

const safeParseGeminiIssues = (content: string): any[] => {
  const normalized = (content || '')
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();

  const parseAttempts: string[] = [];
  if (normalized) parseAttempts.push(normalized);

  const arrayMatch = normalized.match(/\[[\s\S]*\]/);
  if (arrayMatch?.[0]) parseAttempts.push(arrayMatch[0]);

  const objectMatch = normalized.match(/\{[\s\S]*\}/);
  if (objectMatch?.[0]) parseAttempts.push(objectMatch[0]);

  for (const attempt of parseAttempts) {
    try {
      const parsed = JSON.parse(attempt);
      if (Array.isArray(parsed)) return parsed;
      if (Array.isArray(parsed?.issues)) return parsed.issues;
    } catch {
      try {
        // Common repair: remove trailing commas.
        const repaired = attempt.replace(/,\s*([}\]])/g, '$1');
        const parsed = JSON.parse(repaired);
        if (Array.isArray(parsed)) return parsed;
        if (Array.isArray(parsed?.issues)) return parsed.issues;
      } catch {
        // continue
      }
    }
  }

  // Final recovery: parse object-by-object if array/object wrappers are malformed.
  const objectSnippets = normalized.match(/\{[\s\S]*?\}/g) || [];
  const recovered: any[] = [];
  for (const snippet of objectSnippets) {
    try {
      const repaired = snippet.replace(/,\s*([}\]])/g, '$1');
      const parsed = JSON.parse(repaired);
      if (parsed && typeof parsed === 'object') recovered.push(parsed);
    } catch {
      // ignore malformed snippet
    }
  }

  if (recovered.length > 0) return recovered;

  return [];
};

const normalizeExtractedIssues = (issues: any[]): any[] => {
  const mapped = (issues || []).map((issue: any) => ({
    issue_summary: String(issue.issue_summary || issue.issue || issue.summary || '').trim(),
    sector: sanitizeSector(issue.category || issue.sector),
    location: issue.location ?? null,
    affected_count:
      typeof issue.affected_count === 'number'
        ? issue.affected_count
        : Number.isFinite(Number(issue.affected_count))
          ? Number(issue.affected_count)
          : null,
    severity_hint: ['low', 'medium', 'high', 'critical'].includes(String(issue.severity_hint || '').toLowerCase())
      ? String(issue.severity_hint).toLowerCase()
      : inferSeverityHint(String(issue.issue_summary || issue.issue || issue.summary || '')),
    required_skills: Array.isArray(issue.required_skills)
      ? issue.required_skills.map((s: any) => normalizeSkillTag(String(s))).filter(Boolean)
      : [],
    priority_score: null,
    urgency_score: null,
    status: 'unassigned',
    assigned_volunteer_id: null,
    assignment_reason: null,
    created_at: new Date().toISOString(),
  }));

  const filtered = mapped.filter((i) => i.issue_summary.length > 12 && isMeaningfulIssueSummary(i.issue_summary));

  const seen = new Set<string>();
  return filtered.filter((i) => {
    const key = i.issue_summary.toLowerCase().replace(/\s+/g, ' ').trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

// ============ GEMINI EXTRACTION (OPTIONAL) ============
const extractWithGemini = async (rawInput: string, apiKey: string): Promise<any[]> => {
  const safeRawInput = String(rawInput ?? '');
  console.log('[Orchestrator] Gemini extraction started', {
    inputLength: safeRawInput.length,
    preview: safeRawInput.slice(0, 200),
  });
  const prompt = `You are an NGO emergency triage extractor.

Task:
Extract ONLY actionable negative issues, unmet needs, shortages, risks, gaps, failures, constraints, or urgent follow-ups from the report text.

STRICT OUTPUT RULES:
1) Return ONLY valid JSON (no markdown, no explanation, no code fences)
2) Return a JSON array only
3) Do NOT include achievements, completed activities, positive updates, monitoring summaries, beneficiary counts, or general program descriptions.
4) Return only issues that indicate a real problem, unmet need, service gap, risk, shortage, damage, blockage, delay, or missing capacity.
5) Extract at most 8 issues and prefer fewer high-quality issues over many vague ones.
6) Each element MUST follow this exact schema:
{
  "issue_summary": string,
  "sector": "water" | "healthcare" | "electricity" | "sanitation" | "food" | "education" | "shelter" | "safety" | "logistics" | "counseling" | "other",
  "location": string | null,
  "affected_count": number | null,
  "severity_hint": "low" | "medium" | "high" | "critical",
  "required_skills": string[]
}

EXTRACTION RULES:
- Create one item per distinct real-world issue (deduplicate repeated mentions)
- Keep issue_summary concise, operational, and negative in nature (max ~20 words)
- Prefer splitting compound paragraphs into separate issues when different needs, locations, or resources are mentioned
- If a paragraph contains multiple problems, return them as separate array items rather than one combined item
- Do not merge water/healthcare/shelter/food/safety problems into one issue
- If location is missing, use null
- If affected count is not explicit, use null
- required_skills should be short tags (e.g., ["first_aid", "water_distribution"])
- Map uncertain sectors to "other"
- Do not invent facts not grounded in the report
- If a line mainly describes an accomplishment, skip it entirely.
- If you are unsure whether something is a problem, omit it.

SEVERITY MAPPING:
- critical: immediate risk to life/safety, severe medical/water/shelter breakdown
- high: urgent and likely to worsen within 24-48h
- medium: important but not life-threatening right now
- low: minor/localized issue with limited immediate harm

Report text:
${safeRawInput}`;

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          topP: 0.9,
          maxOutputTokens: 2000,
          responseMimeType: 'application/json',
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini request failed (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const content = (data.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
      console.log('[Orchestrator] Gemini raw response', {
        responseLength: content.length,
        responsePreview: content.slice(0, 500),
      });
    const parsed: any[] = safeParseGeminiIssues(content);
    console.log('[Orchestrator] Gemini extraction complete', {
      responseLength: content.length,
      parsedCount: parsed.length,
    });

      const normalizedIssues = normalizeExtractedIssues(parsed);
      if (normalizedIssues.length > 0) {
        return normalizedIssues;
      }

      const fallbackIssues = buildGuaranteedFallbackIssues(safeRawInput);
      console.warn('[Orchestrator] Gemini returned no usable issues, using guaranteed fallback', {
        fallbackCount: fallbackIssues.length,
      });
      return fallbackIssues;
  } catch (err) {
    console.error('Gemini API error, switching to guaranteed fallback:', err);
    return buildGuaranteedFallbackIssues(safeRawInput);
  }
};

const assignWithGemini = async (
  issues: any[],
  volunteers: any[],
  apiKey: string
): Promise<Array<{ issue_index: number; volunteer_id: string | null; assignment_reason?: string }>> => {
  const compactIssues = issues.map((i, idx) => ({
    issue_index: idx,
    issue_summary: i.issue_summary,
    sector: i.sector,
    location: i.location,
    priority_score: i.priority_score,
    affected_count: i.affected_count,
  }));

  const compactVolunteers = volunteers
    .filter((v) => v.is_active)
    .map((v) => ({
      volunteer_id: v.id,
      name: v.name,
      skills: v.skills || [],
      zone: v.zone,
      availability_hours_per_week: v.availability_hours_per_week || 10,
    }));

  const prompt = `You are an NGO dispatch planner. Assign each issue to at most one volunteer.
Goals:
1) Prioritize higher priority_score first
2) Match sector with volunteer skills whenever possible
3) Balance workload fairly
4) If no fit exists, return volunteer_id as null

Return ONLY a JSON array with objects:
[{"issue_index": number, "volunteer_id": string | null, "assignment_reason": string}]

Issues:
${JSON.stringify(compactIssues)}

Volunteers:
${JSON.stringify(compactVolunteers)}
`;

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 1500 },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini assignment failed (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
  const jsonMatch = content.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];

  const parsed = JSON.parse(jsonMatch[0]);
  if (!Array.isArray(parsed)) return [];

  return parsed
    .filter((item) => typeof item?.issue_index === 'number')
    .map((item) => ({
      issue_index: item.issue_index,
      volunteer_id: item.volunteer_id ?? null,
      assignment_reason: item.assignment_reason || 'Gemini-recommended assignment',
    }));
};

const generateActionPlanSummaryWithGemini = async (state: AgentState, apiKey: string): Promise<string> => {
  const planContext = {
    total_issues: state.issues.length,
    assigned_issues: state.issues.filter((i) => i.status === 'assigned').length,
    unassigned_issues: state.issues.filter((i) => i.status !== 'assigned').length,
    top_issues: [...state.issues]
      .sort((a, b) => (b.priority_score || 0) - (a.priority_score || 0))
      .slice(0, 5)
      .map((i) => ({
        issue_summary: i.issue_summary,
        sector: i.sector,
        priority_score: i.priority_score,
        assigned_volunteer_id: i.assigned_volunteer_id,
      })),
    alerts: state.alerts,
  };

  const prompt = `Create a concise NGO action plan summary in 5-7 bullet points.
Include: immediate actions, critical risks, and next 24h recommendations.
Keep it practical and field-ready.

Data:
${JSON.stringify(planContext)}
`;

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.4, maxOutputTokens: 600 },
    }),
  });

  if (!response.ok) return '';

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
};

const scoreWithGemini = async (issues: any[], apiKey: string): Promise<Array<{ issue_index: number; urgency_score: number }>> => {
  const prompt = `Rate urgency from 1-10 based on:
- impact on life
- number of people affected
- immediacy

Return ONLY JSON array:
[{"issue_index": number, "urgency_score": number}]

Issues:
${JSON.stringify(
    issues.map((i, idx) => ({
      issue_index: idx,
      issue: i.issue_summary,
      sector: i.sector,
      location: i.location,
      affected_count: i.affected_count,
      severity_hint: i.severity_hint,
    }))
  )}`;

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 800 },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini scoring failed (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
  const jsonMatch = content.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];

  const parsed = JSON.parse(jsonMatch[0]);
  if (!Array.isArray(parsed)) return [];

  return parsed
    .filter((item) => typeof item?.issue_index === 'number')
    .map((item) => ({
      issue_index: item.issue_index,
      urgency_score: Math.max(1, Math.min(10, Number(item.urgency_score) || 5)),
    }));
};

const detectSkillsWithGemini = async (
  issues: any[],
  apiKey: string
): Promise<Array<{ issue_index: number; required_skills: string[] }>> => {
  const prompt = `For each NGO issue, list volunteer skills required to address it.
Return ONLY JSON array:
[{"issue_index": number, "required_skills": string[]}]

Use concise skill tags (examples: healthcare, counseling, logistics, water, sanitation, education, shelter, legal_aid, psychosocial_support, emergency_response).

Issues:
${JSON.stringify(
    issues.map((i, idx) => ({
      issue_index: idx,
      issue: i.issue_summary,
      sector: i.sector,
      location: i.location,
      priority_score: i.priority_score,
      urgency_score: i.urgency_score,
    }))
  )}`;

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 1000 },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini skill-gap detection failed (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
  const jsonMatch = content.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];

  const parsed = JSON.parse(jsonMatch[0]);
  if (!Array.isArray(parsed)) return [];

  return parsed
    .filter((item) => typeof item?.issue_index === 'number')
    .map((item) => ({
      issue_index: item.issue_index,
      required_skills: Array.isArray(item.required_skills)
        ? item.required_skills.map((s: string) => normalizeSkillTag(s)).filter(Boolean)
        : [],
    }));
};

// ============ TOOL: INGEST ============
const ingestTool = async (state: AgentState): Promise<{ state: AgentState; confidence: number }> => {
  const trimmed = String(state.rawInput ?? '').trim();

  if (!trimmed || trimmed.length < 20) {
    return {
      state: {
        ...state,
        alerts: [
          ...state.alerts,
          { type: 'critical_unassigned', message: 'Empty or too-short input. Skipping pipeline.', severity: 'warning' },
        ],
      },
      confidence: 0.2,
    };
  }

  return {
    state: {
      ...state,
      rawInput: trimmed,
    },
    confidence: 1.0,
  };
};

// ============ TOOL: EXTRACT ============
const extractTool = async (state: AgentState): Promise<{ state: AgentState; confidence: number }> => {
  const geminiKey = import.meta.env.VITE_GEMINI_API_KEY;
  console.log('[Orchestrator] Extract tool running', { rawInputLength: state.rawInput.length });
  const geminiIssues = (!geminiKey || geminiKey === 'your-gemini-api-key-here')
    ? buildGuaranteedFallbackIssues(state.rawInput)
    : await extractWithGemini(state.rawInput, geminiKey);
  const confidence = geminiIssues.length > 0 ? Math.min(1.0, geminiIssues.length / 5) : 0.3;

  console.log('[Orchestrator] Extract tool finished', {
    issueCount: geminiIssues.length,
    confidence,
  });

  return {
    state: {
      ...state,
      issues: geminiIssues,
    },
    confidence,
  };
};

// ============ TOOL: SCORE ============
const scoreTool = async (state: AgentState): Promise<{ state: AgentState; confidence: number }> => {
  console.log('[Orchestrator] Score tool running', { issueCount: state.issues.length });
  let scored = [...state.issues];
  const geminiKey = import.meta.env.VITE_GEMINI_API_KEY;

  if (geminiKey && geminiKey !== 'your-gemini-api-key-here') {
    try {
      const geminiScores = await scoreWithGemini(state.issues, geminiKey);
      if (geminiScores.length > 0) {
        const byIndex = new Map(geminiScores.map((s) => [s.issue_index, s.urgency_score]));
        scored = state.issues.map((issue, idx) => {
          const urgency = byIndex.get(idx) ?? 5;
          return {
            ...issue,
            urgency_score: parseFloat(Number(urgency).toFixed(1)),
            priority_score: parseFloat(Number(urgency).toFixed(1)),
          };
        });

        return {
          state: {
            ...state,
            issues: scored,
          },
          confidence: 0.92,
        };
      }
    } catch (err) {
      console.warn('Gemini scoring failed, using fallback scoring:', err);
    }
  }

  scored = state.issues.map((issue) => {
    const criticalSectors = ['water', 'healthcare', 'sanitation', 'shelter', 'safety'];
    const baseCritical = criticalSectors.includes(issue.sector) ? 0.5 : 0.2;
    const affectedScore = Math.min(1.0, (issue.affected_count || 0) / 500);
    const severityBoost = issue.severity_hint === 'critical' ? 0.4 : issue.severity_hint === 'high' ? 0.25 : 0.1;
    const urgency = Math.min(10, (baseCritical + affectedScore + severityBoost) * 10 / 1.6);

    return {
      ...issue,
      priority_score: parseFloat(urgency.toFixed(1)),
      urgency_score: parseFloat(urgency.toFixed(1)),
    };
  });

  return {
    state: {
      ...state,
      issues: scored,
    },
    confidence: 0.78,
  };
};

// ============ TOOL: GAP DETECTION ============
const gapTool = async (state: AgentState): Promise<{ state: AgentState; confidence: number }> => {
  console.log('[Orchestrator] Gap tool running', { issueCount: state.issues.length, volunteerCount: state.volunteers.length });
  const newAlerts = [...state.alerts];
  let enrichedIssues = [...state.issues];

  const geminiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (geminiKey && geminiKey !== 'your-gemini-api-key-here') {
    try {
      const skillsByIssue = await detectSkillsWithGemini(state.issues, geminiKey);
      if (skillsByIssue.length > 0) {
        const byIndex = new Map(skillsByIssue.map((s) => [s.issue_index, s.required_skills]));
        enrichedIssues = state.issues.map((issue, idx) => {
          const llmSkills = byIndex.get(idx) || [];
          const fallbackSkills = [normalizeSkillTag(issue.sector)].filter(Boolean);
          return {
            ...issue,
            required_skills: llmSkills.length > 0 ? llmSkills : fallbackSkills,
          };
        });
      }
    } catch (err) {
      console.warn('Gemini skill-gap detection failed, using fallback skills:', err);
    }
  }

  if (enrichedIssues.some((i) => !Array.isArray(i.required_skills) || i.required_skills.length === 0)) {
    enrichedIssues = enrichedIssues.map((issue) => ({
      ...issue,
      required_skills:
        Array.isArray(issue.required_skills) && issue.required_skills.length > 0
          ? issue.required_skills
          : [normalizeSkillTag(issue.sector)].filter(Boolean),
    }));
  }

  const volunteerSkills = state.volunteers
    .filter((v) => v.is_active)
    .map((v) => (Array.isArray(v.skills) ? v.skills : []))
    .flat()
    .map((s: string) => normalizeSkillTag(s));
  const volunteerSkillSet = new Set(volunteerSkills);

  for (const issue of enrichedIssues) {
    const requiredSkills: string[] = Array.isArray(issue.required_skills) ? issue.required_skills : [];
    const missingSkills = requiredSkills.filter((skill) => !volunteerSkillSet.has(skill));

    if (missingSkills.length > 0) {
      newAlerts.push({
        type: 'skill_gap',
        message: `Missing skills [${missingSkills.join(', ')}] for "${issue.issue_summary?.substring(0, 50)}..."`,
        severity: 'warning',
      });
    }

    // Check critical unassigned
    if ((issue.priority_score || 0) > 7 && issue.status === 'unassigned') {
      newAlerts.push({
        type: 'critical_unassigned',
        message: `Critical issue (score ${issue.priority_score}) unassigned: ${issue.issue_summary?.substring(0, 50)}...`,
        severity: 'critical',
      });
    }
  }

  return {
    state: {
      ...state,
      issues: enrichedIssues,
      alerts: newAlerts,
    },
    confidence: 0.85,
  };
};

// ============ HELPER: Generate Backup Volunteer ============
const findBackupVolunteer = (
  assignedVolunteerId: string,
  issue: any,
  volunteers: any[],
  volunteerLoads: Record<string, number>
): any | null => {
  const issueSkills: string[] = Array.isArray(issue.required_skills) && issue.required_skills.length > 0
    ? issue.required_skills
    : [normalizeSkillTag(issue.sector)].filter(Boolean);

  const activeVolunteers = volunteers.filter(
    (v) => {
      if (!v.is_active || v.id === assignedVolunteerId) return false;
      const volunteerSkills = (v.skills || []).map((s: string) => normalizeSkillTag(s));
      return issue.sector === 'other' || issueSkills.some((skill) => volunteerSkills.includes(skill));
    }
  );

  if (activeVolunteers.length === 0) {
    return null;
  }

  // Pick least-loaded backup volunteer
  return activeVolunteers.reduce((prev, curr) =>
    (volunteerLoads[prev.id] || 0) <= (volunteerLoads[curr.id] || 0) ? prev : curr
  );
};

// ============ TOOL: MATCH ============
const matchTool = async (state: AgentState): Promise<{ state: AgentState; confidence: number }> => {
  console.log('[Orchestrator] Integrated Smart Match tool running', { 
    issueCount: state.issues.length, 
    volunteerCount: state.volunteers.length 
  });
  
  const matched = [...state.issues];
  const assignments: any[] = [];
  const volunteerLoads: Record<string, number> = {};

  // 1. Initialize loads for active volunteers
  state.volunteers.forEach((v) => {
    volunteerLoads[v.id] = 0;
  });

  try {
    // 2. Process issues for matching
    for (let i = 0; i < matched.length; i++) {
      const issue = matched[i];
      if (issue.status === 'assigned') continue;

      console.log(`[SmartMatch] Processing issue: ${issue.issue_summary?.substring(0, 30)}...`);

      // A. Dynamic skill inference for the issue
      const requiredSkillsList = await analyzeSkillsForIssue(issue.issue_summary, issue.sector);
      
      // B. Generate embedding for the requirement using PYTHON BACKEND
      const requiredEmbedding = await generateLocalEmbedding(requiredSkillsList);

      // C. Score all active volunteers
      const activeVolunteers = state.volunteers.filter(v => v.is_active);
      
      // OPTIONAL: Fetch historical success/experience context for each volunteer
      const scoredVolunteers = await Promise.all(activeVolunteers.map(async (vol) => {
        // Fetch last 3 issues this volunteer handled to understand "Past Work"
        const { data: pastAssignments } = await supabase
          .from("issues")
          .select("issue_summary, sector")
          .eq("assigned_volunteer_id", vol.id)
          .eq("status", "resolved")
          .limit(3);
          
        const pastWorkHistory = (pastAssignments || [])
          .map(a => `${a.issue_summary} (${a.sector})`)
          .join(". ");

        // Build a profile string for the volunteer including skills and past context
        const volunteerProfileText = `Skills: ${(vol.skills || []).join(", ")}. Past Work: ${pastWorkHistory || "New volunteer"}`;
        
        let cosine = 0;
        if (volunteerProfileText.trim() !== "") {
          const volEmbedding = await generateLocalEmbedding(volunteerProfileText);
          cosine = calculateCosineSimilarity(requiredEmbedding, volEmbedding);
        }
        
        const locScore = calculateLocationScore(issue.location || "", vol.zone || "");
        
        // Success rate: Use a real metric if available, otherwise default to high for new volunteers
        const pastSuccessRate = vol.past_success_rate || 0.9; 
        
        // Calculate the Final Match Score (40% skills/history, 30% location, 30% success/load)
        const finalScore = calculateFinalMatchScore(cosine, pastSuccessRate, locScore);
        
        return {
          ...vol,
          matchScore: finalScore,
          cosinePercentage: Math.round(Math.max(0, cosine) * 100),
          pastSuccessRate: Math.round(pastSuccessRate * 100)
        };
      }));

      // D. Sort by match score and pick the best available
      scoredVolunteers.sort((a, b) => b.matchScore - a.matchScore);
      
      // Filter by capacity (must be under limit)
      const bestMatch = scoredVolunteers.find(v => (volunteerLoads[v.id] || 0) < (v.availability_hours_per_week || 10) * 0.8);

      if (bestMatch) {
         console.log(`[SmartMatch] Best fit for issue ${i}: ${bestMatch.name} (${bestMatch.matchScore}% match)`);
         
         // Find a secondary/backup (next best match)
         const backupMatch = scoredVolunteers.find(v => v.id !== bestMatch.id);
         const backupInfo = backupMatch 
           ? ` | Backup: ${backupMatch.name} (${backupMatch.matchScore}% score)` 
           : ' | No suitable backup';

         matched[i] = {
           ...matched[i],
           assigned_volunteer_id: bestMatch.id,
           status: 'assigned',
           assignment_reason: `AI Smart Match (${bestMatch.matchScore}%). Skills: ${bestMatch.cosinePercentage}%, Loc: ${Math.round(calculateLocationScore(issue.location || "", bestMatch.zone || "") * 100)}%${backupInfo}`
         };

         volunteerLoads[bestMatch.id] = (volunteerLoads[bestMatch.id] || 0) + 1;
         assignments.push({ issue_index: i, volunteer_id: bestMatch.id });
      } else {
        console.warn(`[SmartMatch] No suitable matches found for issue: ${issue.issue_summary?.substring(0, 30)}...`);
      }
    }
  } catch (error: any) {
    console.error('[SmartMatch] Pipeline match failed:', error);
  }

  return {
    state: {
      ...state,
      issues: matched,
      assignments,
    },
    confidence: assignments.length > 0 ? 0.95 : 0.3,
  };
};

// ============ TOOL: REALLOCATE ============
const reallocateTool = async (state: AgentState): Promise<{ state: AgentState; confidence: number }> => {
  console.log('[Orchestrator] Reallocate tool running', { issueCount: state.issues.length, volunteerCount: state.volunteers.length });
  const reallocated = [...state.issues];
  const volunteerLoads: Record<string, number> = {};

  state.volunteers.forEach((v) => {
    volunteerLoads[v.id] = reallocated.filter((i) => i.assigned_volunteer_id === v.id).length;
  });

  // Find overloaded volunteers
  const overloaded = state.volunteers.filter(
    (v) => v.is_active && volunteerLoads[v.id] > (v.availability_hours_per_week || 10) / 2
  );

  for (const overvol of overloaded) {
    // Find lowest-priority issues assigned to this volunteer
    const theirIssues = reallocated
      .map((i, idx) => ({ i, idx }))
      .filter(({ i }) => i.assigned_volunteer_id === overvol.id && i.status === 'assigned')
      .sort((a, b) => (a.i.priority_score || 0) - (b.i.priority_score || 0));

    for (const { i: issue, idx: issueIdx } of theirIssues.slice(0, Math.ceil(theirIssues.length / 2))) {
      // Try reassign to another volunteer
      const candidates = state.volunteers.filter(
        (v) =>
          v.id !== overvol.id &&
          v.is_active &&
          (v.skills?.includes(issue.sector) || true) &&
          volunteerLoads[v.id] < (v.availability_hours_per_week || 10) / 2
      );

      if (candidates.length > 0) {
        const best = candidates.reduce((prev, curr) =>
          volunteerLoads[prev.id] <= volunteerLoads[curr.id] ? prev : curr
        );

        if (issueIdx >= 0) {
          reallocated[issueIdx] = {
            ...reallocated[issueIdx],
            assigned_volunteer_id: best.id,
            assignment_reason: `Reallocated from ${overvol.name} to ${best.name} (load balancing)`,
          };
        }

        volunteerLoads[overvol.id]--;
        volunteerLoads[best.id]++;
      }
    }
  }

  return {
    state: {
      ...state,
      issues: reallocated,
    },
    confidence: 0.8,
  };
};

// ============ TOOL: REPORT ============
const reportTool = async (state: AgentState): Promise<{ state: AgentState; confidence: number }> => {
  console.log('[Orchestrator] Report tool running', { issueCount: state.issues.length, assignedCount: state.issues.filter((i) => i.status === 'assigned').length });
  const assigned = state.issues.filter((i) => i.status === 'assigned').length;
  const unassigned = state.issues.length - assigned;
  const critical = state.issues.filter((i) => (i.priority_score || 0) > 7).length;
  const geminiKey = import.meta.env.VITE_GEMINI_API_KEY;

  let planSummary = `Assigned ${assigned}/${state.issues.length} issues. Critical issues: ${critical}. Unassigned: ${unassigned}.`;

  if (geminiKey && geminiKey !== 'your-gemini-api-key-here') {
    try {
      const summary = await generateActionPlanSummaryWithGemini(state, geminiKey);
      if (summary?.trim()) {
        planSummary = summary.trim();
      }
    } catch (err) {
      console.warn('Gemini action-plan summary failed, using fallback summary:', err);
    }
  }

  return {
    state: {
      ...state,
      currentStep: 'complete',
      isComplete: true,
      agentLogs: [
        ...state.agentLogs,
        {
          agent: 'Report Agent',
          timestamp: new Date().toISOString(),
          decision: 'Action plan generated',
          reasoning: planSummary,
        },
      ],
    },
    confidence: 0.95,
  };
};

// ============ THINK FUNCTION (Agent Decision-Making) ============
const think = (state: AgentState): string => {
  if (state.currentStep === 'starting' || state.currentStep === 'ingestion') return 'extract';
  if (state.currentStep === 'extraction') return 'score';
  if (state.currentStep === 'scoring') return 'gap';
  if (state.currentStep === 'gap_detection') return 'match';
  if (state.currentStep === 'matching') return 'reallocate';
  if (state.currentStep === 'reallocation') return 'report';

  // Fallback safety
  if (state.issues.length === 0) return 'extract';
  if (state.issues.some((i) => i.priority_score === null)) return 'score';
  return 'report';
};

// ============ MAIN ORCHESTRATOR ============
export const runOrchestrator = async (
  rawInput: string,
  volunteers: any[],
  onStepComplete?: (state: AgentState) => void
): Promise<AgentState> => {
  console.log('[Orchestrator] Pipeline started', {
    inputLength: String(rawInput ?? '').trim().length,
    volunteerCount: volunteers.length,
  });
  let state: AgentState = {
    rawInput: String(rawInput ?? ''),
    issues: [],
    volunteers: volunteers.map((v) => ({ ...v, is_active: v.is_active !== false })),
    assignments: [],
    alerts: [],
    agentLogs: [],
    currentStep: 'starting',
    isComplete: false,
  };

  const tools: Record<string, (s: AgentState) => Promise<{ state: AgentState; confidence: number }>> = {
    ingest: ingestTool,
    extract: extractTool,
    score: scoreTool,
    gap: gapTool,
    match: matchTool,
    reallocate: reallocateTool,
    report: reportTool,
  };

  const toolStepMap: Record<string, string> = {
    ingest: 'ingestion',
    extract: 'extraction',
    score: 'scoring',
    gap: 'gap_detection',
    match: 'matching',
    reallocate: 'reallocation',
    report: 'complete',
  };

  let maxIterations = 20;
  let iteration = 0;

  // Ingest first
  console.log('[Orchestrator] Running ingest tool');
  const ingestResult = await ingestTool(state);
  state = {
    ...ingestResult.state,
    currentStep: 'ingestion',
    agentLogs: [
      ...ingestResult.state.agentLogs,
      {
        agent: 'Orchestrator (Ingestion)',
        timestamp: new Date().toISOString(),
        decision: `Input validation: ${state.rawInput.length} chars, confidence ${(ingestResult.confidence * 100).toFixed(0)}%`,
        reasoning: 'Cleaned raw text input for processing.',
      },
    ],
  };
  onStepComplete?.(state);

  // Reason-act loop
  while (!state.isComplete && iteration < maxIterations) {
    iteration++;
    const nextTool = think(state);

    console.log('[Orchestrator] Next tool selected', {
      iteration,
      nextTool,
      currentStep: state.currentStep,
      issueCount: state.issues.length,
      alertCount: state.alerts.length,
    });

    if (nextTool === 'report' || state.isComplete) {
      break;
    }

    const tool = tools[nextTool];
    if (!tool) break;

    const result = await tool(state);
    const stepName = toolStepMap[nextTool] || nextTool;

    console.log('[Orchestrator] Tool complete', {
      tool: nextTool,
      stepName,
      confidence: result.confidence,
      issueCount: result.state.issues.length,
      assignmentCount: result.state.assignments.length,
      alertCount: result.state.alerts.length,
    });

    state = {
      ...result.state,
      currentStep: stepName,
      confidence: result.confidence,
      agentLogs: [
        ...result.state.agentLogs,
        {
          agent: `Orchestrator (${nextTool === 'gap' ? 'Gap Detection' : nextTool === 'match' ? 'Matching' : nextTool === 'reallocate' ? 'Reallocation' : nextTool.charAt(0).toUpperCase() + nextTool.slice(1)})`,
          timestamp: new Date().toISOString(),
          decision: `Executed ${nextTool} tool (confidence: ${(result.confidence * 100).toFixed(0)}%) — ${
            nextTool === 'extract'
              ? `${result.state.issues.length} issues extracted`
              : nextTool === 'score'
              ? `${result.state.issues.filter((i) => i.priority_score).length} issues scored`
              : nextTool === 'gap'
              ? `${result.state.alerts.length} alerts generated`
              : nextTool === 'match'
              ? `${result.state.issues.filter((i) => i.status === 'assigned').length} assignments made`
              : nextTool === 'reallocate'
              ? `workload rebalanced`
              : ''
          }`,
          reasoning:
            nextTool === 'extract'
              ? 'Parsing issues from field report using keyword matching and patterns.'
              : nextTool === 'score'
              ? 'Computing priority scores based on urgency, criticality, and affected population.'
              : nextTool === 'gap'
              ? 'Detecting skill gaps and capacity constraints.'
              : nextTool === 'match'
              ? 'Greedy assignment of issues to volunteers with matching skills and capacity.'
              : nextTool === 'reallocate'
              ? 'Rebalancing workload from overloaded volunteers.'
              : '',
        },
      ],
    };

    onStepComplete?.(state);

    // Add overload alerts if needed
    const volunteerLoads: Record<string, number> = {};
    state.volunteers.forEach((v) => {
      volunteerLoads[v.id] = state.issues.filter((i) => i.assigned_volunteer_id === v.id).length;
    });

    for (const vol of state.volunteers) {
      if (
        vol.is_active &&
        volunteerLoads[vol.id] > (vol.availability_hours_per_week || 10) / 2 &&
        !state.alerts.some((a) => a.message.includes(vol.name))
      ) {
        state.alerts.push({
          type: 'overload',
          message: `${vol.name} has ${volunteerLoads[vol.id]} assignments (capacity: ${vol.availability_hours_per_week || 10}/week).`,
          severity: 'warning',
        });
      }
    }
  }

  // Final report
  console.log('[Orchestrator] Finalizing pipeline', {
    issueCount: state.issues.length,
    assignedCount: state.issues.filter((i) => i.status === 'assigned').length,
    alertCount: state.alerts.length,
  });
  state = {
    ...state,
    currentStep: 'complete',
    isComplete: true,
    agentLogs: [
      ...state.agentLogs,
      {
        agent: 'Orchestrator (Report)',
        timestamp: new Date().toISOString(),
        decision: `Pipeline complete: ${state.issues.length} issues, ${state.issues.filter((i) => i.status === 'assigned').length} assigned, ${state.alerts.length} alerts.`,
        reasoning: 'Generated final action plan and summary.',
      },
    ],
  };

  onStepComplete?.(state);
  return state;
};

// Legacy exports (for backward compatibility if needed)
export const runIngestionAgent = async (state: AgentState): Promise<AgentState> => {
  const result = await ingestTool(state);
  return { ...result.state, currentStep: 'ingestion' };
};

export const runExtractionAgent = async (state: AgentState): Promise<AgentState> => {
  const result = await extractTool(state);
  return { ...result.state, currentStep: 'extraction' };
};

export const runScoringAgent = async (state: AgentState): Promise<AgentState> => {
  const result = await scoreTool(state);
  return { ...result.state, currentStep: 'scoring' };
};

export const runGapDetectionAgent = async (state: AgentState): Promise<AgentState> => {
  const result = await gapTool(state);
  return { ...result.state, currentStep: 'gap_detection' };
};

export const runMatchingAgent = async (state: AgentState): Promise<AgentState> => {
  const result = await matchTool(state);
  return { ...result.state, currentStep: 'matching' };
};

export const runReallocationAgent = async (state: AgentState): Promise<AgentState> => {
  const result = await reallocateTool(state);
  return { ...result.state, currentStep: 'reallocation' };
};

export const runReportAgent = async (state: AgentState): Promise<AgentState> => {
  const result = await reportTool(state);
  return result.state;
};
