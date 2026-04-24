import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SmartMatchDialog } from "@/components/SmartMatchDialog";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MapPin, Users, PlusCircle } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { formatDateTime, translateSector, translateStatus } from "@/lib/i18n";
import { AlertTriangle, Lightbulb, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface Issue {
  id: string;
  issue_summary: string | null;
  sector: string | null;
  location: string | null;
  affected_count: number | null;
  priority_score: number | null;
  status: string | null;
  assigned_volunteer_id: string | null;
  assignment_reason: string | null;
  created_at?: string | null;
}

interface Volunteer {
  id: string;
  name: string;
}

interface Prediction {
  id?: string;
  title: string;
  description: string;
  sector: string;
  urgency: "critical" | "high" | "medium" | "low";
  confidence?: "high" | "medium" | "low";
  timeframe?: string;
  resolution?: string;
  resource_allocation?: Array<{ item: string; quantity: number | string; priority: string; reason?: string }>;
  overall_risk_assessment?: string;
}

const DEMO_ISSUES: Issue[] = [
  {
    id: "demo-issue-1",
    issue_summary: "Drinking water shortage in Rampur for 5 days. Immediate tanker support needed.",
    sector: "water",
    location: "Rampur",
    affected_count: 220,
    priority_score: 9.1,
    status: "unassigned",
    assigned_volunteer_id: null,
    assignment_reason: null,
  },
  {
    id: "demo-issue-2",
    issue_summary: "Primary health center in Meerut is low on antibiotics and first-aid supplies.",
    sector: "healthcare",
    location: "Meerut",
    affected_count: 480,
    priority_score: 8.4,
    status: "assigned",
    assigned_volunteer_id: null,
    assignment_reason: "Awaiting NGO assignment sync",
  },
  {
    id: "demo-issue-3",
    issue_summary: "Flood-affected families in Dibrugarh need temporary shelter kits and dry food.",
    sector: "shelter",
    location: "Dibrugarh",
    affected_count: 75,
    priority_score: 8.9,
    status: "unassigned",
    assigned_volunteer_id: null,
    assignment_reason: null,
  },
  {
    id: "demo-issue-4",
    issue_summary: "School sanitation units in Kharagpur are damaged and require urgent repairs.",
    sector: "sanitation",
    location: "Kharagpur",
    affected_count: 160,
    priority_score: 7.2,
    status: "resolved",
    assigned_volunteer_id: null,
    assignment_reason: "Resolved by local sanitation task force",
  },
];

const SECTOR_COLORS: Record<string, string> = {
  water: "bg-teal-100 text-teal-700 border-teal-200",
  healthcare: "bg-red-100 text-red-700 border-red-200",
  electricity: "bg-amber-100 text-amber-700 border-amber-200",
  food: "bg-green-100 text-green-700 border-green-200",
  education: "bg-blue-100 text-blue-700 border-blue-200",
  shelter: "bg-purple-100 text-purple-700 border-purple-200",
  sanitation: "bg-orange-100 text-orange-700 border-orange-200",
  safety: "bg-rose-100 text-rose-700 border-rose-200",
  logistics: "bg-slate-100 text-slate-700 border-slate-200",
  counseling: "bg-pink-100 text-pink-700 border-pink-200",
};

const STATUS_COLORS: Record<string, string> = {
  unassigned: "bg-muted text-muted-foreground",
  assigned: "bg-blue-100 text-blue-700",
  resolved: "bg-green-100 text-green-700",
};

function PriorityBar({ score }: { score: number }) {
  const color = score > 7 ? "bg-destructive" : score >= 4 ? "bg-amber-500" : "bg-primary";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-muted rounded-full h-1.5 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${(score / 10) * 100}%` }}
        />
      </div>
      <span className={`text-xs font-mono font-medium tabular-nums ${score > 7 ? "text-destructive" : score >= 4 ? "text-amber-600" : "text-primary"}`}>
        {score.toFixed(1)}
      </span>
    </div>
  );
}

export default function Issues() {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [volunteers, setVolunteers] = useState<Volunteer[]>([]);
  const [sectorFilter, setSectorFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("priority");
  const [loading, setLoading] = useState(true);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [showPredictions, setShowPredictions] = useState(true);
  const { language, t } = useLanguage();

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setIssues([]);
        setVolunteers([]);
        setLoading(false);
        return;
      }

      const [issuesRes, volRes, predsRes] = await Promise.all([
        supabase
          .from("issues")
          .select("*")
          .eq("ngo_user_id", user.id)
          .neq("status", "resolved"),
        supabase.from("volunteers").select("*").eq("ngo_user_id", user.id),
        supabase.from("smart_predictions")
          .select("*")
          .eq("ngo_user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(10) // fetch up to 10 latest predictions
      ]);

      const dbIssues = (issuesRes.data || []) as Issue[];
      setIssues(dbIssues.length > 0 ? dbIssues : []);
      setVolunteers((volRes.data || []) as Volunteer[]);
      
      if (predsRes.data && predsRes.data.length > 0) {
        setPredictions(predsRes.data as Prediction[]);
      } else {
        setPredictions([]);
      }
      
      setLoading(false);
    };
    fetchData();
  }, []);

  const refreshData = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const [issuesRes, volRes, predsRes] = await Promise.all([
      supabase.from("issues").select("*").eq("ngo_user_id", user.id).neq("status", "resolved"),
      supabase.from("volunteers").select("*").eq("ngo_user_id", user.id),
      supabase.from("smart_predictions").select("*").eq("ngo_user_id", user.id).order("created_at", { ascending: false }).limit(10)
    ]);
    setIssues((issuesRes.data || []) as Issue[]);
    setVolunteers((volRes.data || []) as Volunteer[]);
    
    if (predsRes.data && predsRes.data.length > 0) {
      setPredictions(predsRes.data as Prediction[]);
    } else {
      setPredictions([]);
    }
    
    setLoading(false);
  };

  const postCommunityRequest = async (pred: Prediction) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
       toast.error("Please log in to post requests.");
       return;
    }
    
    let supplies = "";
    if (pred.resource_allocation && pred.resource_allocation.length > 0) {
       supplies = pred.resource_allocation.map(a => `${a.quantity}x ${a.item}`).join(", ");
    }
    
    const req_payload = {
        owner_id: user.id,
        title: `Need volunteers/supplies for: ${pred.title}`,
        description: `AI Prediction Request: ${pred.description}\n\nResolution: ${pred.resolution || 'N/A'}\n\nSupplies needed: ${supplies || 'None specified'}`,
        category: pred.sector || "General",
        urgency: pred.urgency === "critical" ? "critical" : (pred.urgency === "high" ? "high" : "medium"),
        location: "AI Identified Need Area", 
        volunteers_needed: 1, 
        funding_amount: 0,
        skills_needed: [pred.sector || "General"],
        contact_method: "Platform Messaging"
    };
    
    try {
        const { error } = await supabase.from("ngo_requests").insert(req_payload);
        if (error) throw error;
        toast.success("Community request posted successfully for this prediction!");
    } catch (err: any) {
        toast.error(`Failed to post request: ${err.message}`);
    }
  };

  const sectors = [...new Set(issues.map((i) => i.sector).filter(Boolean))] as string[];

  const filtered = issues
    .filter((i) => sectorFilter === "all" || i.sector === sectorFilter)
    .filter((i) => statusFilter === "all" || i.status === statusFilter)
    .sort((a, b) => {
      if (sortBy === "priority") return (b.priority_score || 0) - (a.priority_score || 0);
      return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
    });

  const getVolunteerName = (id: string | null) =>
    id ? volunteers.find((v) => v.id === id)?.name || "Unknown" : null;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold">{t("issues.title")}</h1>
        <p className="text-muted-foreground text-sm mt-1">{t("issues.found", { count: filtered.length })}</p>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <Select value={sectorFilter} onValueChange={setSectorFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder={t("issues.sector")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("issues.allSectors")}</SelectItem>
            {sectors.map((s) => (
              <SelectItem key={s} value={s}>{translateSector(language, s)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder={t("issues.status")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("issues.allStatuses")}</SelectItem>
            <SelectItem value="unassigned">{translateStatus(language, "unassigned")}</SelectItem>
            <SelectItem value="assigned">{translateStatus(language, "assigned")}</SelectItem>
            <SelectItem value="resolved">{translateStatus(language, "resolved")}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder={t("issues.sortBy")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="priority">{t("issues.priorityScoreDesc")}</SelectItem>
            <SelectItem value="newest">{t("issues.newestFirst")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* AI Predictive Intelligence Alerts */}
      {predictions.length > 0 && (
        <div className="mb-6 space-y-3">
          <div 
            className="flex items-center justify-between cursor-pointer group"
            onClick={() => setShowPredictions(!showPredictions)}
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
              <h2 className="text-lg font-bold text-foreground group-hover:text-amber-700 transition-colors">AI Predictive Intelligence</h2>
              <Badge variant="outline" className="border-amber-200 text-amber-700 bg-amber-50">Early Warnings</Badge>
            </div>
            <button className="p-1 hover:bg-muted rounded-md transition-colors">
              {showPredictions ? <ChevronUp className="w-5 h-5 text-muted-foreground" /> : <ChevronDown className="w-5 h-5 text-muted-foreground" />}
            </button>
          </div>
          
          {showPredictions && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {predictions.map((pred, i) => (
                <div key={i} className="bg-amber-50/50 border border-amber-200 rounded-xl p-4 shadow-sm relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-1 h-full bg-amber-500 rounded-l-xl"></div>
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-semibold text-amber-950 text-sm leading-snug pr-4">{pred.title}</h3>
                    <Badge variant="secondary" className="bg-amber-100 text-amber-800 border-none shrink-0 capitalize">{pred.urgency}</Badge>
                  </div>
                  <p className="text-sm text-amber-900/80 mb-3 leading-relaxed">{pred.description}</p>
                  
                  {pred.resolution && (
                    <div className="bg-amber-100/50 rounded-lg p-3 border border-amber-200/50">
                      <h4 className="flex items-center gap-1.5 text-xs font-bold text-amber-800 mb-1">
                        <Lightbulb className="w-3.5 h-3.5" /> Mitigation Resolution
                      </h4>
                      <p className="text-xs text-amber-900 leading-relaxed font-medium">{pred.resolution}</p>
                    </div>
                  )}
                  
                  {pred.overall_risk_assessment && (
                    <div className="bg-rose-50 rounded-lg p-3 border border-rose-200 mt-3">
                      <h4 className="flex items-center gap-1.5 text-xs font-bold text-rose-800 mb-1">
                        <AlertTriangle className="w-3.5 h-3.5" /> Risk Assessment
                      </h4>
                      <p className="text-xs text-rose-900 leading-relaxed font-medium">{pred.overall_risk_assessment}</p>
                    </div>
                  )}
                  
                  {pred.resource_allocation && pred.resource_allocation.length > 0 && (
                    <div className="mt-3">
                      <h4 className="text-xs font-bold text-foreground mb-1">Suggested Resource Allocation:</h4>
                      <ul className="space-y-1">
                        {pred.resource_allocation.map((alloc, idx) => (
                          <li key={idx} className="text-xs text-muted-foreground bg-muted/30 p-1.5 rounded-md flex justify-between">
                            <span className="font-semibold">{alloc.item}</span>
                            <span className="opacity-80">Qty: {alloc.quantity}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  
                  <div className="mt-3 pt-3 border-t border-amber-200/50">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="w-full gap-2 border-amber-300 hover:bg-amber-100/50 text-amber-800 bg-amber-50"
                      onClick={() => postCommunityRequest(pred)}
                    >
                      <PlusCircle className="w-4 h-4" /> Request Volunteers / Supplies for Setup
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Grid */}
      {loading ? (
        <div className="text-center text-muted-foreground py-16">{t("issues.loading")}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 space-y-2">
          <p className="text-muted-foreground text-sm">{t("issues.noIssuesYet")}</p>
          <p className="text-muted-foreground/60 text-xs">{t("issues.runAgentsHint")}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {filtered.map((issue) => {
            const volunteerName = getVolunteerName(issue.assigned_volunteer_id);
            return (
              <div key={issue.id} className="bg-card border rounded-lg p-4 space-y-3 hover:shadow-sm transition-shadow">
                <div className="flex items-start justify-between gap-2">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${SECTOR_COLORS[issue.sector || ""] || "bg-muted text-muted-foreground border-border"}`}>
                    {translateSector(language, issue.sector || "other")}
                  </span>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[issue.status || "unassigned"] || STATUS_COLORS.unassigned}`}>
                    {translateStatus(language, issue.status || "unassigned")}
                  </span>
                </div>

                <p className="text-sm font-semibold text-foreground leading-snug">{issue.issue_summary}</p>

                <PriorityBar score={issue.priority_score || 0} />

                <div className="space-y-1">
                  {(issue.location || issue.affected_count) && (
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      {issue.location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" /> {issue.location}
                        </span>
                      )}
                      {issue.affected_count && (
                        <span className="flex items-center gap-1">
                          <Users className="w-3 h-3" /> {t("issues.affected", { count: issue.affected_count.toLocaleString() })}
                        </span>
                      )}
                    </div>
                  )}
                  {volunteerName && (
                    <div className="flex items-center gap-1">
                      <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
                        👤 {volunteerName}
                      </span>
                    </div>
                  )}
                  {issue.assignment_reason && (
                    <p className="text-xs text-muted-foreground italic">{issue.assignment_reason}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
