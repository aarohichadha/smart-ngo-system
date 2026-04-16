import { supabase } from "@/integrations/supabase/client";
import { getMockSession, isMockAuthEnabled, setMockSession } from "@/lib/mockAuth";
import { VOLUNTEER_DOMAINS } from "@/lib/volunteerDomains";
import type {
  CommunityPost,
  CommunityPostType,
  ConnectionResponse,
  NotificationItem,
  SponsorDirectoryItem,
  SponsorMatch,
  SponsorMatchSource,
  SponsorPortalStatus,
  UserRole,
} from "@/types/impact";

type SessionLikeUser = {
  id: string;
  email: string | null;
};

type NgoExtraFields = {
  address?: string;
  email?: string;
  contact_info?: string;
  bank_details?: string;
  image_url?: string;
  work_area?: string;
  past_works?: string;
};

const NGO_EXTRA_STORAGE_PREFIX = "ngo-about:";

function getNgoExtraStorageKey(userId: string) {
  return `${NGO_EXTRA_STORAGE_PREFIX}${userId}`;
}

function readNgoExtraFields(userId: string): NgoExtraFields {
  if (typeof window === "undefined") return {};

  try {
    const raw = window.localStorage.getItem(getNgoExtraStorageKey(userId));
    return raw ? JSON.parse(raw) as NgoExtraFields : {};
  } catch (error) {
    console.warn("Failed to read NGO extra fields from local storage:", error);
    return {};
  }
}

function writeNgoExtraFields(userId: string, patch: NgoExtraFields) {
  if (typeof window === "undefined") return;

  try {
    const merged = { ...readNgoExtraFields(userId), ...patch };
    window.localStorage.setItem(getNgoExtraStorageKey(userId), JSON.stringify(merged));
  } catch (error) {
    console.warn("Failed to write NGO extra fields to local storage:", error);
  }
}

const MOCK_NGO_DIRECTORY = [
  {
    id: "ngo-1",
    role: "ngo" as const,
    display_name: "SilverCare Foundation",
    location: "Delhi",
    contact_info: "contact@silvercare.org",
    verification_status: "verified" as const,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    details: {
      description: "Supports senior citizens with weekly health camps and home visits.",
      sector: "Old Age Support",
      contact_info: "contact@silvercare.org",
    },
  },
  {
    id: "ngo-2",
    role: "ngo" as const,
    display_name: "Bright Futures Trust",
    location: "Mumbai",
    contact_info: "hello@brightfutures.org",
    verification_status: "verified" as const,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    details: {
      description: "Runs after-school and nutrition programs for underserved children.",
      sector: "Children Welfare",
      contact_info: "hello@brightfutures.org",
    },
  },
  {
    id: "ngo-3",
    role: "ngo" as const,
    display_name: "Rapid Relief Collective",
    location: "Bengaluru",
    contact_info: "ops@rapidrelief.org",
    verification_status: "pending" as const,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    details: {
      description: "Coordinates volunteer response during floods and local emergencies.",
      sector: "Disaster Management",
      contact_info: "ops@rapidrelief.org",
    },
  },
  {
    id: "ngo-4",
    role: "ngo" as const,
    display_name: "HealthReach Network",
    location: "Pune",
    contact_info: "team@healthreach.org",
    verification_status: "verified" as const,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    details: {
      description: "Organizes preventive healthcare and awareness drives in urban slums.",
      sector: "Healthcare Outreach",
      contact_info: "team@healthreach.org",
    },
  },
  {
    id: "ngo-5",
    role: "ngo" as const,
    display_name: "LearnForward Initiative",
    location: "Hyderabad",
    contact_info: "volunteer@learnforward.org",
    verification_status: "verified" as const,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    details: {
      description: "Builds digital and foundational learning opportunities for youth.",
      sector: "Education Support",
      contact_info: "volunteer@learnforward.org",
    },
  },
  {
    id: "ngo-6",
    role: "ngo" as const,
    display_name: "WaterBridge Alliance",
    location: "Lucknow",
    contact_info: "help@waterbridge.org",
    verification_status: "verified" as const,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    details: {
      description: "Restores village handpumps and runs water-safety awareness camps.",
      sector: "Water Access",
      contact_info: "help@waterbridge.org",
    },
  },
  {
    id: "ngo-7",
    role: "ngo" as const,
    display_name: "GreenStep Mission",
    location: "Chennai",
    contact_info: "action@greenstep.org",
    verification_status: "verified" as const,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    details: {
      description: "Coordinates mangrove restoration and urban clean-up drives.",
      sector: "Environment",
      contact_info: "action@greenstep.org",
    },
  },
  {
    id: "ngo-8",
    role: "ngo" as const,
    display_name: "SafeHome Collective",
    location: "Jaipur",
    contact_info: "support@safehome.org",
    verification_status: "pending" as const,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    details: {
      description: "Supports women and families with legal aid and safe shelter referrals.",
      sector: "Women Support",
      contact_info: "support@safehome.org",
    },
  },
  {
    id: "ngo-9",
    role: "ngo" as const,
    display_name: "SkillLift Foundation",
    location: "Kolkata",
    contact_info: "team@skilllift.org",
    verification_status: "verified" as const,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    details: {
      description: "Runs employability, mentoring, and apprenticeship programs for youth.",
      sector: "Livelihood",
      contact_info: "team@skilllift.org",
    },
  },
  {
    id: "ngo-10",
    role: "ngo" as const,
    display_name: "CareNet Relief",
    location: "Bhopal",
    contact_info: "response@carenetrelief.org",
    verification_status: "verified" as const,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    details: {
      description: "Provides emergency ration and medicine support in crisis-hit neighborhoods.",
      sector: "Emergency Relief",
      contact_info: "response@carenetrelief.org",
    },
  },
];

const MOCK_VOLUNTEER_DIRECTORY = [
  {
    id: "vol-1",
    role: "individual" as const,
    display_name: "Anita Sharma",
    location: "Delhi",
    contact_info: "anita@example.org",
    verification_status: "verified" as const,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    details: {
      skills: ["counseling", "first aid"],
      interests: ["Old Age Support", "Healthcare Outreach"],
      availability: "Weekends",
    },
  },
  {
    id: "vol-2",
    role: "individual" as const,
    display_name: "Rohan Mehta",
    location: "Mumbai",
    contact_info: "rohan@example.org",
    verification_status: "pending" as const,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    details: {
      skills: ["teaching", "event coordination"],
      interests: ["Children Welfare", "Education Support"],
      availability: "Evenings",
    },
  },
  {
    id: "vol-3",
    role: "individual" as const,
    display_name: "Meera Iyer",
    location: "Bengaluru",
    contact_info: "meera@example.org",
    verification_status: "verified" as const,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    details: {
      skills: ["community outreach", "content creation"],
      interests: ["Women Support", "Education Support"],
      availability: "Hybrid - 10 hrs/week",
    },
  },
];

const MOCK_SPONSOR_DIRECTORY: SponsorDirectoryItem[] = [
  {
    id: "sponsor-1",
    display_name: "Apex CSR Foundation",
    organization: "Apex Group",
    description: "Supports clean water, healthcare camps, sanitation and emergency relief in underserved districts.",
    location: "Delhi",
    email: "csr@apexgroup.org",
    contact_number: "+91 98765 40001",
    website: "https://apexgroup.org/csr",
    focus_areas: ["water", "healthcare", "sanitation", "disaster relief"],
    portal_status: "registered",
  },
  {
    id: "sponsor-2",
    display_name: "BrightFuture Philanthropy",
    organization: "BrightFuture Trust",
    description: "Focuses on education access, child welfare, nutrition, and learning continuity programs.",
    location: "Mumbai",
    email: "partnerships@brightfuture.org",
    contact_number: "+91 98200 12002",
    website: "https://brightfuture.org",
    focus_areas: ["education", "child welfare", "nutrition"],
    portal_status: "registered",
  },
  {
    id: "sponsor-3",
    display_name: "SafeStep Corporate Social Impact",
    organization: "SafeStep India",
    description: "Backs women safety, safe transport, livelihood access, and community empowerment initiatives.",
    location: "Bengaluru",
    email: "impact@safestep.in",
    contact_number: "+91 98111 23003",
    website: "https://safestep.in",
    focus_areas: ["women safety", "livelihood", "empowerment"],
    portal_status: "external",
  },
  {
    id: "sponsor-4",
    display_name: "ReliefFirst Foundation",
    organization: "ReliefFirst",
    description: "Funds flood relief, shelter setup, ration kits, logistics and rapid response operations.",
    location: "Hyderabad",
    email: "relief@relieffirst.org",
    contact_number: "+91 98450 45004",
    website: "https://relieffirst.org",
    focus_areas: ["shelter", "food", "logistics", "flood relief"],
    portal_status: "registered",
  },
  {
    id: "sponsor-5",
    display_name: "HealthBridge Care Partners",
    organization: "HealthBridge",
    description: "Supports medical camps, medicines, maternal health, child screening and outreach.",
    location: "Pune",
    email: "care@healthbridge.org",
    contact_number: "+91 98901 50005",
    website: "https://healthbridge.org",
    focus_areas: ["healthcare", "maternal health", "child health", "medicines"],
    portal_status: "registered",
  },
  {
    id: "sponsor-6",
    display_name: "AquaLife CSR",
    organization: "AquaLife Ltd.",
    description: "Invests in water purification, tankers, hygiene, sanitation and WASH programs.",
    location: "Lucknow",
    email: "wash@aqualife.in",
    contact_number: "+91 98133 60006",
    website: "https://aqualife.in",
    focus_areas: ["water", "sanitation", "hygiene", "wash"],
    portal_status: "registered",
  },
  {
    id: "sponsor-7",
    display_name: "SkillRise Foundation",
    organization: "SkillRise Network",
    description: "Delivers vocational training, job linkage, mentoring and youth employability programs.",
    location: "Kolkata",
    email: "jobs@skillrise.org",
    contact_number: "+91 98888 70007",
    website: "https://skillrise.org",
    focus_areas: ["education", "training", "livelihood", "job opportunities"],
    portal_status: "external",
  },
  {
    id: "sponsor-8",
    display_name: "Community Care Alliance",
    organization: "CCA",
    description: "Works on nutrition awareness, child screening, hygiene kits and community outreach.",
    location: "Chennai",
    email: "community@cca.org",
    contact_number: "+91 98321 80008",
    website: "https://cca.org",
    focus_areas: ["nutrition", "child health", "sanitation", "community outreach"],
    portal_status: "external",
  },
  {
    id: "sponsor-9",
    display_name: "WomenRise Collective",
    organization: "WomenRise",
    description: "Funds women safety, transport, rights awareness and financial independence initiatives.",
    location: "Jaipur",
    email: "hello@womenrise.org",
    contact_number: "+91 98710 90009",
    website: "https://womenrise.org",
    focus_areas: ["women safety", "rights", "financial independence", "transport"],
    portal_status: "registered",
  },
  {
    id: "sponsor-10",
    display_name: "GreenPath Foundation",
    organization: "GreenPath",
    description: "Supports environmental resilience, climate response and community disaster preparedness.",
    location: "Bhopal",
    email: "partners@greenpath.org",
    contact_number: "+91 98155 10010",
    website: "https://greenpath.org",
    focus_areas: ["environment", "disaster relief", "resilience", "community preparedness"],
    portal_status: "external",
  },
];

const SPONSOR_GEMINI_API_KEY = import.meta.env.VITE_SPONSOR_GEMINI_API_KEY;

type SponsorRankPayload = {
  sponsor_id: string;
  match_score: number;
  match_reason: string;
  connect_available?: boolean;
};

type SponsorDiscoveryPayload = {
  display_name: string;
  organization: string;
  description: string;
  location: string;
  email: string;
  contact_number: string;
  website: string;
  focus_areas: string[];
  match_score: number;
  match_reason: string;
};

function normalizeTextForMatching(value: string | null | undefined): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toSponsorKey(value: string | null | undefined) {
  return normalizeTextForMatching(value).replace(/\s+/g, " ");
}

function toSponsorId(prefix: string, displayName: string, organization: string) {
  const slug = `${displayName}-${organization}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

  return `${prefix}-${slug || "sponsor"}`;
}

function getNgoMatchSummary(ngoProfile: any) {
  const pieces = [
    ngoProfile?.ngo_name,
    ngoProfile?.description,
    ngoProfile?.sector,
    ngoProfile?.work_area,
    ngoProfile?.location,
    ngoProfile?.past_works,
  ]
    .filter(Boolean)
    .map((value) => String(value))
    .join(" | ");

  return pieces;
}

function isEmailLike(value: string | null | undefined): boolean {
  return /.+@.+\..+/.test(String(value || "").trim());
}

function toSafeSponsorName(profile: any): string {
  const fullName = String(profile?.full_name || "").trim();
  if (fullName) return fullName;

  const displayName = String(profile?.display_name || "").trim();
  if (displayName && !isEmailLike(displayName)) return displayName;

  return "Sponsor";
}

function mapProfileToSponsorEntry(profile: any): SponsorDirectoryItem {
  const safeName = toSafeSponsorName(profile);

  return {
    id: profile.id,
    display_name: safeName,
    organization: safeName === "Sponsor" ? "Sponsor Organization" : safeName,
    description: profile.contact_info || profile.email || "Potential sponsor registered on the portal.",
    location: profile.location || "Unknown",
    email: profile.email || profile.contact_info || "",
    contact_number: profile.contact_number || "",
    website: profile.website || "",
    focus_areas: Array.isArray(profile.focus_areas)
      ? profile.focus_areas
      : typeof profile.focus_areas === "string"
        ? profile.focus_areas.split(",").map((item: string) => item.trim()).filter(Boolean)
        : [],
    portal_status: "registered",
  };
}

function computeSponsorLocalScore(ngoText: string, sponsor: SponsorDirectoryItem): number {
  const normalizedNgo = normalizeTextForMatching(ngoText);
  const sponsorTokens = [
    sponsor.display_name,
    sponsor.organization,
    sponsor.description,
    sponsor.location,
    sponsor.focus_areas.join(" "),
  ]
    .map((value) => normalizeTextForMatching(value))
    .join(" ");

  const focusHits = sponsor.focus_areas.reduce((score, area) => {
    const areaTokens = normalizeTextForMatching(area).split(" ");
    const hasAny = areaTokens.some((token) => normalizedNgo.includes(token));
    return score + (hasAny ? 1 : 0);
  }, 0);

  let score = focusHits * 18;

  if (sponsorTokens.includes("water") && normalizedNgo.includes("water")) score += 20;
  if (sponsorTokens.includes("health") && (normalizedNgo.includes("health") || normalizedNgo.includes("medical"))) score += 18;
  if (sponsorTokens.includes("education") && normalizedNgo.includes("education")) score += 18;
  if (sponsorTokens.includes("safety") && normalizedNgo.includes("safety")) score += 18;
  if (sponsorTokens.includes("nutrition") && normalizedNgo.includes("nutrition")) score += 16;
  if (sponsorTokens.includes("disaster") && (normalizedNgo.includes("flood") || normalizedNgo.includes("disaster") || normalizedNgo.includes("relief"))) score += 16;
  if (sponsorTokens.includes("women") && (normalizedNgo.includes("women") || normalizedNgo.includes("gender"))) score += 16;
  if (sponsorTokens.includes("livelihood") && (normalizedNgo.includes("livelihood") || normalizedNgo.includes("employment") || normalizedNgo.includes("job"))) score += 14;
  if (normalizedNgo.includes(normalizeTextForMatching(sponsor.location))) score += 6;
  if (sponsor.portal_status === "registered") score += 6;

  return Math.min(100, score);
}

function rankSponsorsLocally(ngoText: string, sponsors: SponsorDirectoryItem[]): SponsorMatch[] {
  return sponsors
    .map((sponsor) => ({
      sponsor,
      match_score: computeSponsorLocalScore(ngoText, sponsor),
      match_reason: `Matches ${sponsor.focus_areas.slice(0, 3).join(", ")}`,
      connect_available: sponsor.portal_status === "registered",
    }))
    .sort((a, b) => b.match_score - a.match_score)
    .slice(0, 5)
    .map((item) => ({
      ...item.sponsor,
      match_score: item.match_score,
      match_reason: item.match_reason,
      connect_available: item.connect_available,
      match_source: "directory" as SponsorMatchSource,
    }));
}

function safeParseSponsorDiscovery(content: string): SponsorDiscoveryPayload[] {
  const normalized = (content || "")
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  const attempts = [normalized];
  const arrayMatch = normalized.match(/\[[\s\S]*\]/);
  if (arrayMatch?.[0]) attempts.push(arrayMatch[0]);

  for (const attempt of attempts) {
    try {
      const parsed = JSON.parse(attempt);
      if (Array.isArray(parsed)) return parsed as SponsorDiscoveryPayload[];
    } catch {
      try {
        const repaired = attempt.replace(/,\s*([}\]])/g, "$1");
        const parsed = JSON.parse(repaired);
        if (Array.isArray(parsed)) return parsed as SponsorDiscoveryPayload[];
      } catch {
        // continue
      }
    }
  }

  return [];
}

function rankDiscoveredSponsorsLocally(ngoText: string, sponsors: SponsorDirectoryItem[]): SponsorMatch[] {
  return sponsors
    .map((sponsor) => ({
      ...sponsor,
      match_score: computeSponsorLocalScore(ngoText, sponsor),
      match_reason: `Suggested because it aligns with ${sponsor.focus_areas.slice(0, 3).join(", ")}`,
      connect_available: false,
      match_source: "gemini" as SponsorMatchSource,
    }))
    .sort((a, b) => b.match_score - a.match_score)
    .slice(0, 5);
}

function buildFallbackExternalSponsorLeads(ngoText: string): SponsorDirectoryItem[] {
  const normalizedNgo = normalizeTextForMatching(ngoText);
  const leads: SponsorDirectoryItem[] = [];

  const templates = [
    {
      keywords: ["women", "gender", "safety"],
      display_name: "HerFuture CSR Alliance",
      organization: "HerFuture CSR Alliance",
      description: "Potential external sponsor for women safety, rights, and economic empowerment programs.",
      location: "India",
      focus_areas: ["women safety", "gender equity", "livelihood", "rights"],
    },
    {
      keywords: ["education", "school", "learning", "children"],
      display_name: "LearnForward Foundation",
      organization: "LearnForward Foundation",
      description: "Potential sponsor lead for education, skilling, and child learning initiatives.",
      location: "India",
      focus_areas: ["education", "children", "skilling", "learning"],
    },
    {
      keywords: ["health", "medical", "hospital", "care"],
      display_name: "CareBridge Philanthropy",
      organization: "CareBridge Philanthropy",
      description: "Potential sponsor lead for healthcare access, medical camps, and public health outreach.",
      location: "India",
      focus_areas: ["health", "medical care", "community outreach", "awareness"],
    },
    {
      keywords: ["water", "sanitation", "wash"],
      display_name: "BlueRoot Sustainability Fund",
      organization: "BlueRoot Sustainability Fund",
      description: "Potential sponsor lead for water, sanitation, and sustainable development work.",
      location: "India",
      focus_areas: ["water", "sanitation", "sustainability", "environment"],
    },
    {
      keywords: ["disaster", "flood", "relief", "resilience"],
      display_name: "Resilience Partners Trust",
      organization: "Resilience Partners Trust",
      description: "Potential sponsor lead for disaster response, resilience, and recovery projects.",
      location: "India",
      focus_areas: ["disaster relief", "resilience", "preparedness", "community support"],
    },
  ];

  for (const template of templates) {
    const matches = template.keywords.some((keyword) => normalizedNgo.includes(keyword));
    if (matches || leads.length < 3) {
      leads.push({
        id: toSponsorId("external-lead", template.display_name, template.organization),
        display_name: template.display_name,
        organization: template.organization,
        description: template.description,
        location: template.location,
        email: "",
        contact_number: "",
        website: "",
        focus_areas: template.focus_areas,
        portal_status: "external" as SponsorPortalStatus,
      });
    }
    if (leads.length >= 3) break;
  }

  return leads.slice(0, 3);
}

function ensureExternalSponsorLeadCount(
  ngoText: string,
  existingSponsors: SponsorDirectoryItem[],
  discoveredSponsors: SponsorDirectoryItem[],
): SponsorDirectoryItem[] {
  const existingKeys = new Set([
    ...existingSponsors.map((sponsor) => `${toSponsorKey(sponsor.display_name)}|${toSponsorKey(sponsor.organization)}`),
    ...discoveredSponsors.map((sponsor) => `${toSponsorKey(sponsor.display_name)}|${toSponsorKey(sponsor.organization)}`),
  ]);

  const fallbackSponsors = buildFallbackExternalSponsorLeads(ngoText).filter(
    (sponsor) => !existingKeys.has(`${toSponsorKey(sponsor.display_name)}|${toSponsorKey(sponsor.organization)}`),
  );

  return [...discoveredSponsors, ...fallbackSponsors].slice(0, 3);
}

function safeParseSponsorRanking(content: string): SponsorRankPayload[] {
  const normalized = (content || "")
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  const attempts = [normalized];
  const arrayMatch = normalized.match(/\[[\s\S]*\]/);
  if (arrayMatch?.[0]) attempts.push(arrayMatch[0]);

  for (const attempt of attempts) {
    try {
      const parsed = JSON.parse(attempt);
      if (Array.isArray(parsed)) return parsed as SponsorRankPayload[];
    } catch {
      try {
        const repaired = attempt.replace(/,\s*([}\]])/g, "$1");
        const parsed = JSON.parse(repaired);
        if (Array.isArray(parsed)) return parsed as SponsorRankPayload[];
      } catch {
        // continue
      }
    }
  }

  return [];
}

async function rankSponsorsWithGemini(ngoText: string, sponsors: SponsorDirectoryItem[]): Promise<SponsorRankPayload[]> {
  if (!SPONSOR_GEMINI_API_KEY || SPONSOR_GEMINI_API_KEY === "your-sponsor-gemini-api-key-here") {
    return [];
  }

  const prompt = `You are matching an NGO to potential sponsors.

Select the top 5 sponsors that best fit the NGO profile.
Only use the sponsor_ids from the provided list.
Prefer the strongest mission fit, sector overlap, and location relevance.
If a sponsor has portal_status = registered, connect_available should be true.

Return ONLY a JSON array with objects in this exact schema:
[
  {"sponsor_id": string, "match_score": number, "match_reason": string, "connect_available": boolean}
]

NGO profile:
${ngoText}

Sponsor candidates:
${JSON.stringify(sponsors, null, 2)}`;

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${SPONSOR_GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        topP: 0.9,
        maxOutputTokens: 1200,
        responseMimeType: "application/json",
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Sponsor Gemini request failed (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const content = (data.candidates?.[0]?.content?.parts?.[0]?.text || "").trim();
  return safeParseSponsorRanking(content);
}

async function discoverAdditionalSponsorsWithGemini(
  ngoText: string,
  existingSponsors: SponsorDirectoryItem[],
): Promise<SponsorDirectoryItem[]> {
  if (!SPONSOR_GEMINI_API_KEY || SPONSOR_GEMINI_API_KEY === "your-sponsor-gemini-api-key-here") {
    return ensureExternalSponsorLeadCount(ngoText, existingSponsors, []);
  }

  const prompt = `You are discovering additional sponsor leads for an NGO.

Suggest up to 3 sponsor leads that are NOT already in the provided sponsor directory.
These should be realistic external prospects such as foundations, CSR programs, companies, trusts, or philanthropies.
Return ONLY a JSON array with this exact schema:
[
  {
    "display_name": string,
    "organization": string,
    "description": string,
    "location": string,
    "email": string,
    "contact_number": string,
    "website": string,
    "focus_areas": string[],
    "match_score": number,
    "match_reason": string
  }
]

NGO profile:
${ngoText}

Existing sponsor directory:
${JSON.stringify(existingSponsors, null, 2)}

Keep the output concise and practical. If you are unsure of exact contact details, return empty strings instead of fabricating overly specific data.`;

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${SPONSOR_GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.3,
        topP: 0.9,
        maxOutputTokens: 1200,
        responseMimeType: "application/json",
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Sponsor discovery Gemini request failed (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const content = (data.candidates?.[0]?.content?.parts?.[0]?.text || "").trim();
  const parsed = safeParseSponsorDiscovery(content);
  const existingKeys = new Set(existingSponsors.map((sponsor) => `${toSponsorKey(sponsor.display_name)}|${toSponsorKey(sponsor.organization)}`));
  const discovered = parsed
    .filter((item) => item?.display_name && item?.organization)
    .filter((item) => !existingKeys.has(`${toSponsorKey(item.display_name)}|${toSponsorKey(item.organization)}`))
    .slice(0, 3)
    .map((item, index) => ({
      id: toSponsorId(`gemini-lead-${index + 1}`, item.display_name, item.organization),
      display_name: item.display_name,
      organization: item.organization,
      description: item.description || "AI-suggested sponsor lead based on NGO fit.",
      location: item.location || "Remote",
      email: item.email || "",
      contact_number: item.contact_number || "",
      website: item.website || "",
      focus_areas: Array.isArray(item.focus_areas) ? item.focus_areas.filter(Boolean) : [],
      portal_status: "external" as SponsorPortalStatus,
    }));

  return ensureExternalSponsorLeadCount(ngoText, existingSponsors, discovered);
}

async function getSponsorCandidates(): Promise<SponsorDirectoryItem[]> {
  if (isMockAuthEnabled()) {
    return MOCK_SPONSOR_DIRECTORY;
  }

  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("role", "sponsor" as any)
      .order("created_at", { ascending: false });

    if (error) throw error;

    const mapped = (data || []).map(mapProfileToSponsorEntry);
    return mapped.length > 0 ? mapped : MOCK_SPONSOR_DIRECTORY;
  } catch (error) {
    console.warn("Falling back to mock sponsor directory:", error);
    return MOCK_SPONSOR_DIRECTORY;
  }
}

export async function getSponsorMatchesForNgo(userId: string): Promise<SponsorMatch[]> {
  const profilePayload = await getProfileByUserId(userId);
  const ngoProfile = profilePayload.ngoProfile;

  if (!ngoProfile) return [];

  const ngoText = getNgoMatchSummary(ngoProfile);
  const sponsors = await getSponsorCandidates();

  try {
    const ranked = await rankSponsorsWithGemini(ngoText, sponsors);
    const discovered = await discoverAdditionalSponsorsWithGemini(ngoText, sponsors);

    if (ranked.length > 0) {
      const sponsorMap = new Map(sponsors.map((sponsor) => [sponsor.id, sponsor]));
      const matched = ranked
        .map((rankedSponsor) => {
          const sponsor = sponsorMap.get(rankedSponsor.sponsor_id);
          if (!sponsor) return null;

          return {
            ...sponsor,
            match_score: Math.max(0, Math.min(100, Number(rankedSponsor.match_score) || 0)),
            match_reason: rankedSponsor.match_reason || `Strong fit for ${sponsor.focus_areas.slice(0, 2).join(", ")}`,
            connect_available: sponsor.portal_status === "registered" && Boolean(rankedSponsor.connect_available),
            match_source: "directory" as SponsorMatchSource,
          } as SponsorMatch;
        })
        .filter(Boolean) as SponsorMatch[];

      const discoveredMatches = discovered.length > 0 ? rankDiscoveredSponsorsLocally(ngoText, discovered) : [];
      const combined = [...matched, ...discoveredMatches]
        .sort((a, b) => b.match_score - a.match_score)
        .filter((sponsor, index, array) => {
          const sponsorKey = `${toSponsorKey(sponsor.display_name)}|${toSponsorKey(sponsor.organization)}`;
          return index === array.findIndex((item) => `${toSponsorKey(item.display_name)}|${toSponsorKey(item.organization)}` === sponsorKey);
        });

      if (combined.length > 0) {
        return combined.slice(0, 5);
      }
    }
  } catch (error) {
    console.warn("Sponsor Gemini ranking failed, using local fallback:", error);
  }

  const localMatches = rankSponsorsLocally(ngoText, sponsors);
  const localDiscovered = await discoverAdditionalSponsorsWithGemini(ngoText, sponsors).catch(() => buildFallbackExternalSponsorLeads(ngoText));
  const discoveredMatches = localDiscovered.length > 0 ? rankDiscoveredSponsorsLocally(ngoText, localDiscovered) : [];

  return [...localMatches, ...discoveredMatches]
    .sort((a, b) => b.match_score - a.match_score)
    .filter((sponsor, index, array) => {
      const sponsorKey = `${toSponsorKey(sponsor.display_name)}|${toSponsorKey(sponsor.organization)}`;
      return index === array.findIndex((item) => `${toSponsorKey(item.display_name)}|${toSponsorKey(item.organization)}` === sponsorKey);
    })
    .slice(0, 5);
}

const MOCK_NGO_REQUESTS = MOCK_NGO_DIRECTORY.map((ngo, idx) => ({
  id: `mock-req-${idx + 1}`,
  owner_id: ngo.id,
  title: `${ngo.display_name} needs volunteers`,
  description: `${ngo.details.description} Looking for committed volunteers to support current field activities this month.`,
  category: ngo.details.sector,
  urgency: idx % 4 === 0 ? "high" : idx % 3 === 0 ? "critical" : "medium",
  location: ngo.location || "Not specified",
  funding_amount: [15000, 22000, 18000, 32000, 28000, 25000, 40000, 20000, 30000, 26000][idx] || 20000,
  status: "open",
  created_at: new Date(Date.now() - idx * 3600_000).toISOString(),
}));

const MOCK_VOLUNTEER_OFFERS = [
  {
    id: "mock-offer-1",
    owner_id: "vol-1",
    title: "Healthcare camp support volunteer",
    description: "Can assist with patient registration, elder support, and awareness drives on weekends.",
    preferred_causes: ["Healthcare Outreach", "Old Age Support"],
    urgency: "normal",
    location: "Delhi",
    status: "available",
    created_at: new Date(Date.now() - 2 * 3600_000).toISOString(),
  },
  {
    id: "mock-offer-2",
    owner_id: "vol-2",
    title: "After-school teaching volunteer",
    description: "Can mentor students in math and science and coordinate small learning events.",
    preferred_causes: ["Children Welfare", "Education Support"],
    urgency: "normal",
    location: "Mumbai",
    status: "available",
    created_at: new Date(Date.now() - 3 * 3600_000).toISOString(),
  },
  {
    id: "mock-offer-3",
    owner_id: "vol-3",
    title: "Outreach and communication volunteer",
    description: "Can help NGOs with campaign messaging, volunteer onboarding, and community updates.",
    preferred_causes: ["Women Support", "Livelihood"],
    urgency: "normal",
    location: "Bengaluru",
    status: "available",
    created_at: new Date(Date.now() - 4 * 3600_000).toISOString(),
  },
];

const buildMockCommunityFeed = (): CommunityPost[] => {
  const requestPosts: CommunityPost[] = MOCK_NGO_REQUESTS.map((request) => {
    const owner = MOCK_NGO_DIRECTORY.find((ngo) => ngo.id === request.owner_id);
    return {
      id: request.id,
      postType: "ngo_request",
      ownerId: request.owner_id,
      title: request.title,
      description: request.description,
      category: request.category,
      urgency: request.urgency,
      location: request.location,
      status: request.status,
      createdAt: request.created_at,
      ownerName: owner?.display_name || "Unknown NGO",
      ownerRole: "ngo",
      fundingAmount: request.funding_amount,
    };
  });

  const offerPosts: CommunityPost[] = MOCK_VOLUNTEER_OFFERS.map((offer) => {
    const owner = MOCK_VOLUNTEER_DIRECTORY.find((volunteer) => volunteer.id === offer.owner_id);
    return {
      id: offer.id,
      postType: "volunteer_offer",
      ownerId: offer.owner_id,
      title: offer.title,
      description: offer.description,
      category: offer.preferred_causes[0] || "General",
      urgency: offer.urgency,
      location: offer.location,
      status: offer.status,
      createdAt: offer.created_at,
      ownerName: owner?.display_name || "Volunteer",
      ownerRole: "individual",
    };
  });

  return [...requestPosts, ...offerPosts].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
};

const splitList = (value: string): string[] =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const isMissingTableError = (error: unknown) => {
  const message = (error as { message?: string } | null)?.message?.toLowerCase() || "";
  return message.includes("could not find the table") || message.includes("schema cache");
};

const buildOwnerMap = async () => {
  const { data } = await supabase
    .from("profiles")
    .select("id, user_type, display_name, full_name");

  const ownerMap = new Map<string, { role: UserRole; name: string }>();
  (data || []).forEach((profile) => {
    ownerMap.set(profile.id, {
      role: profile.user_type as UserRole,
      name: profile.display_name || profile.full_name || "Unknown",
    });
  });

  return ownerMap;
};

export async function getCurrentSessionUser() {
  if (isMockAuthEnabled()) {
    const session = getMockSession();
    if (!session) return null;
    return {
      id: session.id,
      email: session.email,
    } as SessionLikeUser;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user as SessionLikeUser | null;
}

export async function getMyProfile() {
  const user = await getCurrentSessionUser();
  if (!user) return null;

  if (isMockAuthEnabled()) {
    const session = getMockSession();
    if (!session) return null;

    return {
      id: session.id,
      role: session.role,
      display_name: session.displayName,
      location: null,
      contact_info: session.email,
      verification_status: "unverified",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function ensureProfileForCurrentUser(role: UserRole, displayName: string) {
  const user = await getCurrentSessionUser();
  if (!user) throw new Error("No authenticated user found.");

  if (isMockAuthEnabled()) {
    const session = setMockSession({
      email: user.email || "user@example.org",
      displayName,
      role,
      volunteeringDomain: VOLUNTEER_DOMAINS[0],
      availableForNgo: false,
    });

    return {
      id: session.id,
      role: session.role,
      display_name: session.displayName,
      location: null,
      contact_info: session.email,
      verification_status: "unverified",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .upsert(
      {
        id: user.id,
        email: user.email || `${user.id}@example.org`,
        user_type: role,
        role,
        display_name: displayName || user.email?.split("@")[0] || "User",
        full_name: displayName || user.email?.split("@")[0] || "User",
        contact_info: user.email || null,
      },
      { onConflict: "id" },
    )
    .select("*")
    .single();

  if (profileError) throw profileError;

  if (role === "ngo") {
    const { error } = await supabase.from("ngo_profiles").upsert(
      {
        user_id: user.id,
        ngo_name: displayName || "New NGO",
        contact_info: user.email || null,
      },
      { onConflict: "user_id" },
    );

    if (error) throw error;
  } else {
    const { error } = await supabase.from("individual_profiles").upsert(
      {
        user_id: user.id,
        full_name: displayName || "New Volunteer",
        contact_info: user.email || null,
      },
      { onConflict: "user_id" },
    );

    if (error) throw error;
  }

  return profile;
}

export async function getCommunityFeed() {
  if (isMockAuthEnabled()) {
    return buildMockCommunityFeed();
  }

  const [requestsResult, offersResult] = await Promise.all([
    supabase
      .from("ngo_requests")
      .select("*")
      .order("created_at", { ascending: false }),
    supabase
      .from("volunteer_offers")
      .select("*")
      .order("created_at", { ascending: false }),
  ]);

  if (isMissingTableError(requestsResult.error) || isMissingTableError(offersResult.error)) {
    return buildMockCommunityFeed();
  }

  const ownerMap = await buildOwnerMap();

  if (requestsResult.error) throw requestsResult.error;
  if (offersResult.error) throw offersResult.error;

  const requestPosts: CommunityPost[] = (requestsResult.data || []).map((request) => {
    const owner = ownerMap.get(request.owner_id);
    return {
      id: request.id,
      postType: "ngo_request",
      ownerId: request.owner_id,
      title: request.title,
      description: request.description,
      category: request.category,
      urgency: request.urgency,
      location: request.location || "Not specified",
      status: request.status,
      createdAt: request.created_at,
      ownerName: owner?.name || "Unknown",
      ownerRole: owner?.role || "ngo",
      fundingAmount: request.funding_amount ?? null,
    };
  });

  const offerPosts: CommunityPost[] = (offersResult.data || []).map((offer) => {
    const owner = ownerMap.get(offer.owner_id);
    return {
      id: offer.id,
      postType: "volunteer_offer",
      ownerId: offer.owner_id,
      title: offer.title,
      description: offer.description,
      category: (offer.preferred_causes || ["General"])[0] || "General",
      urgency: "normal",
      location: offer.location || "Not specified",
      status: offer.status,
      createdAt: offer.created_at,
      ownerName: owner?.name || "Unknown",
      ownerRole: owner?.role || "individual",
    };
  });

  return [...requestPosts, ...offerPosts].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export async function createNgoRequest(payload: {
  title: string;
  description: string;
  category: string;
  urgency: "low" | "medium" | "high" | "critical";
  location: string;
  volunteersNeeded: number;
  fundingAmount: number;
  skillsNeeded: string;
  deadline?: string;
  contactMethod: string;
}): Promise<{ id: string }> {
  const user = await getCurrentSessionUser();
  if (!user) throw new Error("Please sign in first.");

  const { data, error } = await supabase
    .from("ngo_requests")
    .insert({
      owner_id: user.id,
      title: payload.title,
      description: payload.description,
      category: payload.category,
      urgency: payload.urgency,
      location: payload.location,
      volunteers_needed: payload.volunteersNeeded,
      funding_amount: payload.fundingAmount,
      skills_needed: splitList(payload.skillsNeeded),
      deadline: payload.deadline || null,
      contact_method: payload.contactMethod,
    })
    .select("id")
    .single();

  if (error) throw error;
  return data;
}

export async function updateNgoRequest(
  id: string,
  patch: Partial<{
    title: string;
    description: string;
    category: string;
    urgency: "low" | "medium" | "high" | "critical";
    location: string;
    volunteers_needed: number;
    skills_needed: string[];
    deadline: string | null;
    contact_method: string;
    status: string;
  }>,
) {
  const { error } = await supabase.from("ngo_requests").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteNgoRequest(id: string) {
  const [connectionsResult, commentsResult, savesResult] = await Promise.all([
    supabase.from("connections_or_responses").delete().eq("request_id", id),
    supabase.from("post_comments").delete().eq("request_id", id),
    supabase.from("saved_posts").delete().eq("request_id", id),
  ]);

  if (connectionsResult.error) throw connectionsResult.error;
  if (commentsResult.error) throw commentsResult.error;
  if (savesResult.error) throw savesResult.error;

  const { error } = await supabase.from("ngo_requests").delete().eq("id", id);
  if (error) throw error;
}

export async function createVolunteerOffer(payload: {
  title: string;
  description: string;
  skills: string;
  availability: string;
  preferredCauses: string;
  location: string;
  mode: "remote" | "on_ground" | "hybrid";
  contactMethod: string;
}): Promise<{ id: string }> {
  const user = await getCurrentSessionUser();
  if (!user) throw new Error("Please sign in first.");

  const { data, error } = await supabase
    .from("volunteer_offers")
    .insert({
      owner_id: user.id,
      title: payload.title,
      description: payload.description,
      skills: splitList(payload.skills),
      availability: payload.availability,
      preferred_causes: splitList(payload.preferredCauses),
      location: payload.location,
      mode: payload.mode,
      contact_method: payload.contactMethod,
    })
    .select("id")
    .single();

  if (error) throw error;
  return data;
}

export async function updateVolunteerOffer(
  id: string,
  patch: Partial<{
    title: string;
    description: string;
    skills: string[];
    availability: string;
    preferred_causes: string[];
    location: string;
    mode: "remote" | "on_ground" | "hybrid";
    contact_method: string;
    status: string;
  }>,
) {
  const { error } = await supabase.from("volunteer_offers").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteVolunteerOffer(id: string) {
  const [connectionsResult, commentsResult, savesResult] = await Promise.all([
    supabase.from("connections_or_responses").delete().eq("offer_id", id),
    supabase.from("post_comments").delete().eq("offer_id", id),
    supabase.from("saved_posts").delete().eq("offer_id", id),
  ]);

  if (connectionsResult.error) throw connectionsResult.error;
  if (commentsResult.error) throw commentsResult.error;
  if (savesResult.error) throw savesResult.error;

  const { error } = await supabase.from("volunteer_offers").delete().eq("id", id);
  if (error) throw error;
}

export async function addConnection(payload: {
  requestId?: string;
  offerId?: string;
  receiverId: string;
  message: string;
}) {
  const user = await getCurrentSessionUser();
  if (!user) throw new Error("Please sign in first.");

  const { error } = await supabase.from("connections_or_responses").insert({
    request_id: payload.requestId || null,
    offer_id: payload.offerId || null,
    sender_id: user.id,
    receiver_id: payload.receiverId,
    message: payload.message,
    status: "pending",
  });

  if (error) throw error;
}

export async function getConnectionsForMe() {
  const user = await getCurrentSessionUser();
  if (!user) return [] as ConnectionResponse[];

  if (isMockAuthEnabled()) {
    const session = getMockSession();
    const now = new Date();
    const targetNgoIds = MOCK_NGO_DIRECTORY.slice(0, 3).map((ngo) => ngo.id);

    return targetNgoIds.map((ngoId, idx) => ({
      id: `mock-conn-${idx + 1}`,
      request_id: `mock-req-${idx + 1}`,
      offer_id: null,
      sender_id: session?.role === "ngo" ? ngoId : user.id,
      receiver_id: session?.role === "ngo" ? user.id : ngoId,
      message: session?.role === "ngo"
        ? `Thanks for helping ${MOCK_NGO_DIRECTORY[idx].display_name}. Follow-up impact report shared.`
        : `I supported ${MOCK_NGO_DIRECTORY[idx].display_name} on ground operations and volunteer coordination.`,
      status: "completed",
      created_at: new Date(now.getTime() - (idx + 4) * 86_400_000).toISOString(),
      updated_at: new Date(now.getTime() - idx * 43_200_000).toISOString(),
    })) as ConnectionResponse[];
  }

  const { data, error } = await supabase
    .from("connections_or_responses")
    .select("*")
    .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function updateConnectionStatus(id: string, status: ConnectionResponse["status"]) {
  const { error } = await supabase
    .from("connections_or_responses")
    .update({ status })
    .eq("id", id);

  if (error) throw error;
}

export async function getComments(postType: CommunityPostType, postId: string) {
  if (isMockAuthEnabled()) {
    const baseComments = [
      {
        id: `${postId}-comment-1`,
        content: "We can mobilize 4 volunteers this weekend.",
        created_at: new Date(Date.now() - 90 * 60_000).toISOString(),
        author_id: "vol-1",
      },
      {
        id: `${postId}-comment-2`,
        content: "Please share shift timings and exact location.",
        created_at: new Date(Date.now() - 70 * 60_000).toISOString(),
        author_id: "vol-2",
      },
      {
        id: `${postId}-comment-3`,
        content: "Our team can help with outreach and beneficiary registration.",
        created_at: new Date(Date.now() - 40 * 60_000).toISOString(),
        author_id: "vol-3",
      },
    ];

    return baseComments.map((comment) => ({
      ...comment,
      post_type: postType,
      request_id: postType === "ngo_request" ? postId : null,
      offer_id: postType === "volunteer_offer" ? postId : null,
      author_name: MOCK_VOLUNTEER_DIRECTORY.find((volunteer) => volunteer.id === comment.author_id)?.display_name || "Volunteer",
      author_role: "individual",
    }));
  }

  const query = supabase
    .from("post_comments")
    .select("*")
    .eq(postType === "ngo_request" ? "request_id" : "offer_id", postId)
    .order("created_at", { ascending: false });

  const { data, error } = await query;
  if (error) throw error;

  const ownerMap = await buildOwnerMap();
  return (data || []).map((comment) => ({
    ...comment,
    author_name: ownerMap.get(comment.author_id)?.name || "Unknown",
    author_role: ownerMap.get(comment.author_id)?.role || "individual",
  }));
}

export async function addComment(postType: CommunityPostType, postId: string, content: string) {
  const user = await getCurrentSessionUser();
  if (!user) throw new Error("Please sign in first.");

  const payload = {
    post_type: postType,
    author_id: user.id,
    content,
    request_id: postType === "ngo_request" ? postId : null,
    offer_id: postType === "volunteer_offer" ? postId : null,
  };

  const { error } = await supabase.from("post_comments").insert(payload);
  if (error) throw error;
}

export async function savePost(postType: CommunityPostType, postId: string) {
  const user = await getCurrentSessionUser();
  if (!user) throw new Error("Please sign in first.");

  const { error } = await supabase.from("saved_posts").upsert(
    {
      user_id: user.id,
      post_type: postType,
      request_id: postType === "ngo_request" ? postId : null,
      offer_id: postType === "volunteer_offer" ? postId : null,
    },
    { onConflict: "user_id,post_type,request_id,offer_id" },
  );

  if (error) throw error;
}

export async function unsavePost(postType: CommunityPostType, postId: string) {
  const user = await getCurrentSessionUser();
  if (!user) throw new Error("Please sign in first.");

  const { error } = await supabase
    .from("saved_posts")
    .delete()
    .eq("user_id", user.id)
    .eq(postType === "ngo_request" ? "request_id" : "offer_id", postId)
    .eq("post_type", postType);

  if (error) throw error;
}

export async function getSavedPosts() {
  if (isMockAuthEnabled()) {
    const feed = await getCommunityFeed();
    return feed.slice(0, 3);
  }

  const user = await getCurrentSessionUser();
  if (!user) return [] as CommunityPost[];

  const [savedResult, feed] = await Promise.all([
    supabase.from("saved_posts").select("*").eq("user_id", user.id),
    getCommunityFeed(),
  ]);

  if (isMissingTableError(savedResult.error)) {
    return feed.slice(0, 3);
  }

  if (savedResult.error) throw savedResult.error;

  const savedLookup = new Set(
    (savedResult.data || []).map((saved) =>
      `${saved.post_type}:${saved.request_id || saved.offer_id}`,
    ),
  );

  return feed.filter((post) => savedLookup.has(`${post.postType}:${post.id}`));
}

export async function getNotifications() {
  if (isMockAuthEnabled()) {
    const user = await getCurrentSessionUser();
    const mockUserId = user?.id || "mock-user";
    const now = new Date();
    return [
      {
        id: "mock-notif-fest-2026",
        user_id: mockUserId,
        actor_id: null,
        event_type: "ngo_fest_2026",
        title: "NGO Fest 2026",
        body: "Happening on 5th April, 2026 at Enlarge Mall, Preet Vihar, New Delhi. Timings: 12:00 noon onwards.",
        is_read: false,
        related_request_id: null,
        related_offer_id: null,
        related_connection_id: null,
        related_comment_id: null,
        created_at: new Date(now.getTime() - 20 * 60_000).toISOString(),
      },
      {
        id: "mock-notif-1",
        user_id: mockUserId,
        actor_id: "ngo-1",
        event_type: "connection_completed",
        title: "Connection completed",
        body: "You successfully helped SilverCare Foundation. Impact note added to your history.",
        is_read: false,
        related_request_id: "mock-req-1",
        related_offer_id: null,
        related_connection_id: "mock-conn-1",
        related_comment_id: null,
        created_at: new Date(now.getTime() - 2 * 3600_000).toISOString(),
      },
      {
        id: "mock-notif-2",
        user_id: mockUserId,
        actor_id: "ngo-4",
        event_type: "new_ngo_request",
        title: "New NGO request near you",
        body: "HealthReach Network posted an urgent request in your area.",
        is_read: false,
        related_request_id: "mock-req-4",
        related_offer_id: null,
        related_connection_id: null,
        related_comment_id: null,
        created_at: new Date(now.getTime() - 6 * 3600_000).toISOString(),
      },
      {
        id: "mock-notif-3",
        user_id: mockUserId,
        actor_id: null,
        event_type: "profile_tip",
        title: "Profile boost tip",
        body: "Add one more skill to match with 2 new NGO opportunities.",
        is_read: true,
        related_request_id: null,
        related_offer_id: null,
        related_connection_id: null,
        related_comment_id: null,
        created_at: new Date(now.getTime() - 24 * 3600_000).toISOString(),
      },
    ] as NotificationItem[];
  }

  const user = await getCurrentSessionUser();
  if (!user) return [] as NotificationItem[];

  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(30);

  if (isMissingTableError(error)) {
    const now = new Date();
    return [
      {
        id: "fallback-notif-fest-2026",
        user_id: user.id,
        actor_id: null,
        event_type: "ngo_fest_2026",
        title: "NGO Fest 2026",
        body: "Happening on 5th April, 2026 at Enlarge Mall, Preet Vihar, New Delhi. Timings: 12:00 noon onwards.",
        related_request_id: null,
        related_offer_id: null,
        related_connection_id: null,
        related_comment_id: null,
        is_read: false,
        created_at: new Date(now.getTime() - 20 * 60_000).toISOString(),
      },
      {
        id: "fallback-notif-1",
        user_id: user.id,
        actor_id: null,
        event_type: "fallback_notice",
        title: "Using demo notifications",
        body: "Supabase notifications table is not available yet. Showing demo activity.",
        related_request_id: null,
        related_offer_id: null,
        related_connection_id: null,
        related_comment_id: null,
        is_read: false,
        created_at: new Date(now.getTime() - 30 * 60_000).toISOString(),
      },
      {
        id: "fallback-notif-2",
        user_id: user.id,
        actor_id: null,
        event_type: "new_ngo_request",
        title: "New NGO request posted",
        body: "WaterBridge Alliance requested 3 field volunteers.",
        related_request_id: null,
        related_offer_id: null,
        related_connection_id: null,
        related_comment_id: null,
        is_read: true,
        created_at: new Date(now.getTime() - 3 * 3600_000).toISOString(),
      },
    ] as NotificationItem[];
  }

  if (error) throw error;
  return data || [];
}

export async function markNotificationRead(id: string) {
  if (isMockAuthEnabled()) {
    return;
  }

  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("id", id);

  if (error) throw error;
}

export async function getNgoDirectory() {
  if (isMockAuthEnabled()) {
    const session = getMockSession();
    const domain = session?.volunteeringDomain?.toLowerCase() || "";

    const prioritized = [...MOCK_NGO_DIRECTORY].sort((a, b) => {
      const aMatch = a.details.sector.toLowerCase().includes(domain) ? 1 : 0;
      const bMatch = b.details.sector.toLowerCase().includes(domain) ? 1 : 0;
      return bMatch - aMatch;
    });

    return prioritized;
  }

  const [baseProfiles, ngoProfiles] = await Promise.all([
    supabase.from("profiles").select("*").eq("user_type", "ngo"),
    supabase.from("ngo_profiles").select("*"),
  ]);

  if (baseProfiles.error) throw baseProfiles.error;
  if (ngoProfiles.error) throw ngoProfiles.error;

  const ngoMap = new Map((ngoProfiles.data || []).map((ngo) => [ngo.user_id, ngo]));

  return (baseProfiles.data || []).map((profile) => ({
    ...profile,
    details: ngoMap.get(profile.id),
  }));
}

export async function getVolunteerDirectory() {
  if (isMockAuthEnabled()) {
    return MOCK_VOLUNTEER_DIRECTORY;
  }

  const [baseProfiles, individualProfiles] = await Promise.all([
    supabase.from("profiles").select("*").eq("user_type", "individual"),
    supabase.from("individual_profiles").select("*"),
  ]);

  if (baseProfiles.error) throw baseProfiles.error;
  if (individualProfiles.error) throw individualProfiles.error;

  const individualMap = new Map((individualProfiles.data || []).map((person) => [person.user_id, person]));

  return (baseProfiles.data || []).map((profile) => ({
    ...profile,
    details: individualMap.get(profile.id),
  }));
}

export async function getProfileByUserId(userId: string) {
  if (isMockAuthEnabled()) {
    const session = getMockSession();

    if (session?.id === userId) {
      return {
        profile: {
          id: session.id,
          role: session.role,
          display_name: session.displayName,
          location: "Delhi",
          contact_info: session.email,
          verification_status: "unverified",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        ngoProfile: session.role === "ngo"
          ? {
              user_id: session.id,
              ngo_name: session.displayName,
              description: "Community support organization",
              sector: session.volunteeringDomain,
              location: "Delhi",
              contact_info: session.email,
              address: "Delhi",
              email: session.email,
              bank_details: "",
              image_url: "",
              work_area: session.volunteeringDomain,
              past_works: "",
              verification_status: "unverified",
            }
          : null,
        individualProfile: session.role === "individual"
          ? {
              user_id: session.id,
              full_name: session.displayName,
              skills: ["coordination", "outreach"],
              interests: [session.volunteeringDomain],
              location: "Delhi",
              availability: session.availableForNgo ? "Available for NGO assignments" : "Not available",
              contact_info: session.email,
            }
          : null,
        requests: MOCK_NGO_REQUESTS.slice(0, 3).map((request) => ({
          id: request.id,
          title: request.title,
          status: request.status,
          category: request.category,
        })),
        offers: MOCK_VOLUNTEER_OFFERS.slice(0, 3).map((offer) => ({
          id: offer.id,
          title: offer.title,
          status: offer.status,
          mode: "hybrid",
        })),
      };
    }

    const ngo = MOCK_NGO_DIRECTORY.find((item) => item.id === userId);
    if (ngo) {
      return {
        profile: ngo,
        ngoProfile: {
          user_id: ngo.id,
          ngo_name: ngo.display_name,
          description: ngo.details.description,
          sector: ngo.details.sector,
          location: ngo.location,
          contact_info: ngo.contact_info,
          address: ngo.location,
          email: ngo.contact_info,
          bank_details: "",
          image_url: "",
          work_area: ngo.details.sector,
          past_works: "",
          verification_status: ngo.verification_status,
        },
        individualProfile: null,
        requests: [
          ...MOCK_NGO_REQUESTS.filter((request) => request.owner_id === ngo.id).slice(0, 3).map((request) => ({
            id: request.id,
            title: request.title,
            status: request.status,
            category: request.category,
          })),
        ],
        offers: MOCK_VOLUNTEER_OFFERS.slice(0, 3).map((offer) => ({
          id: offer.id,
          title: offer.title,
          status: offer.status,
          mode: "hybrid",
        })),
      };
    }
  }

  const [base, ngo, individual, requests, offers] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
    supabase.from("ngo_profiles").select("*").eq("user_id", userId).maybeSingle(),
    supabase.from("individual_profiles").select("*").eq("user_id", userId).maybeSingle(),
    supabase.from("ngo_requests").select("*").eq("owner_id", userId).order("created_at", { ascending: false }),
    supabase.from("volunteer_offers").select("*").eq("owner_id", userId).order("created_at", { ascending: false }),
  ]);

  if (base.error) throw base.error;
  if (ngo.error) throw ngo.error;
  if (individual.error) throw individual.error;
  if (requests.error) throw requests.error;
  if (offers.error) throw offers.error;

  const ngoExtras = readNgoExtraFields(userId);
  const mergedNgoProfile = ngo.data
    ? {
        ...ngo.data,
        ...ngoExtras,
        address: ngoExtras.address ?? ngo.data.location ?? null,
        email: ngoExtras.email ?? ngo.data.contact_info ?? null,
        contact_info: ngoExtras.contact_info ?? ngo.data.contact_info ?? null,
        bank_details: ngoExtras.bank_details ?? null,
        image_url: ngoExtras.image_url ?? null,
        work_area: ngoExtras.work_area ?? ngo.data.sector ?? null,
        past_works: ngoExtras.past_works ?? null,
      }
    : base.data?.role === "ngo"
      ? {
          user_id: userId,
          ngo_name: base.data.display_name,
          description: null,
          sector: null,
          location: base.data.location,
          contact_info: ngoExtras.contact_info ?? base.data.contact_info ?? null,
          address: ngoExtras.address ?? base.data.location ?? null,
          email: ngoExtras.email ?? base.data.contact_info ?? null,
          bank_details: ngoExtras.bank_details ?? null,
          image_url: ngoExtras.image_url ?? null,
          work_area: ngoExtras.work_area ?? null,
          past_works: ngoExtras.past_works ?? null,
          created_at: null,
          updated_at: null,
          verification_status: null,
        }
      : null;

  return {
    profile: base.data,
    ngoProfile: mergedNgoProfile,
    individualProfile: individual.data,
    requests: requests.data || [],
    offers: offers.data || [],
  };
}

export async function updateNgoProfile(userId: string, patch: {
  ngo_name?: string;
  description?: string;
  sector?: string;
  location?: string;
  contact_info?: string;
  address?: string;
  email?: string;
  bank_details?: string;
  image_url?: string;
  work_area?: string;
  past_works?: string;
}) {
  const extraPatch: NgoExtraFields = {
    address: patch.address,
    email: patch.email,
    contact_info: patch.contact_info,
    bank_details: patch.bank_details,
    image_url: patch.image_url,
    work_area: patch.work_area,
    past_works: patch.past_works,
  };

  writeNgoExtraFields(userId, extraPatch);

  const stablePatch = {
    user_id: userId,
    ngo_name: patch.ngo_name,
    description: patch.description,
    sector: patch.sector,
    location: patch.location,
    contact_info: patch.contact_info ?? patch.email,
  };

  const fullPatch = {
    ...stablePatch,
    address: patch.address,
    email: patch.email,
    bank_details: patch.bank_details,
    image_url: patch.image_url,
    work_area: patch.work_area,
    past_works: patch.past_works,
  };

  const { error } = await supabase.from("ngo_profiles").upsert(fullPatch, { onConflict: "user_id" });
  if (error) {
    const isMissingColumnError = error.code === "PGRST204"
      || error.message.toLowerCase().includes("column")
      || error.message.toLowerCase().includes("schema cache");

    if (isMissingColumnError) {
      const { error: fallbackError } = await supabase.from("ngo_profiles").upsert(stablePatch, { onConflict: "user_id" });
      if (fallbackError) throw fallbackError;
    } else {
      throw error;
    }
  }

  if (patch.ngo_name || patch.location || patch.contact_info || patch.email) {
    const { error: profileError } = await supabase
      .from("profiles")
      .update({
        display_name: patch.ngo_name,
        location: patch.location,
        contact_info: patch.contact_info ?? patch.email,
      })
      .eq("id", userId);
    if (profileError) throw profileError;
  }
}

export async function updateIndividualProfile(userId: string, patch: {
  full_name?: string;
  skills?: string;
  interests?: string;
  location?: string;
  availability?: string;
  contact_info?: string;
}) {
  const profilePatch = {
    full_name: patch.full_name,
    skills: patch.skills ? splitList(patch.skills) : undefined,
    interests: patch.interests ? splitList(patch.interests) : undefined,
    location: patch.location,
    availability: patch.availability,
    contact_info: patch.contact_info,
  };

  const { error } = await supabase.from("individual_profiles").update(profilePatch).eq("user_id", userId);
  if (error) throw error;

  if (patch.full_name || patch.location || patch.contact_info) {
    const { error: profileError } = await supabase
      .from("profiles")
      .update({
        display_name: patch.full_name,
        location: patch.location,
        contact_info: patch.contact_info,
      })
      .eq("id", userId);
    if (profileError) throw profileError;
  }
}

export async function getRecommendations() {
  const user = await getCurrentSessionUser();
  if (!user) return [] as CommunityPost[];

  if (isMockAuthEnabled()) {
    const session = getMockSession();
    const feed = await getCommunityFeed();

    if (session?.role === "ngo") {
      return feed.filter((post) => post.postType === "volunteer_offer").slice(0, 3);
    }

    return feed.filter((post) => post.postType === "ngo_request").slice(0, 6);
  }

  const [profileResult, individualResult, ngoResult, feed] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase.from("individual_profiles").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("ngo_profiles").select("*").eq("user_id", user.id).maybeSingle(),
    getCommunityFeed(),
  ]);

  if (profileResult.error) throw profileResult.error;
  if (individualResult.error) throw individualResult.error;
  if (ngoResult.error) throw ngoResult.error;

  const profile = profileResult.data;

  const scored = feed
    .filter((post) => post.ownerId !== user.id)
    .map((post) => {
      let score = 0;
      const locationMatch = profile.location && post.location && profile.location === post.location;
      if (locationMatch) score += 2;

      if (profile.user_type === "individual") {
        if (post.postType === "ngo_request") {
          score += 2;
          const interests = new Set((individualResult.data?.interests || []).map((x) => x.toLowerCase()));
          const skills = new Set((individualResult.data?.skills || []).map((x) => x.toLowerCase()));

          if (interests.has(post.category.toLowerCase())) score += 3;
          if (skills.has(post.category.toLowerCase())) score += 1;
        }
      } else {
        if (post.postType === "volunteer_offer") {
          score += 2;
          const ngoSector = (ngoResult.data?.sector || "").toLowerCase();
          if (ngoSector && post.category.toLowerCase().includes(ngoSector)) score += 2;
        }
      }

      if (post.urgency === "critical") score += 1;
      if (post.status === "open") score += 1;

      return { post, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map((item) => item.post);

  return scored;
}
