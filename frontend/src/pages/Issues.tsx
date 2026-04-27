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
import { MapPin, Users, Brain, TrendingUp, Sparkles, ChevronRight, AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { formatDateTime, translateSector, translateStatus } from "@/lib/i18n";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { createNgoRequest } from "@/services/impactService";

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

interface ReadyVolunteer {
  name: string;
  skills: string[];
  zone: string;
  current_load?: number;
  availability_hours?: number;
}

interface Prediction {
  id: string;
  title: string;
  description: string;
  sector: string;
  urgency: "high" | "medium" | "low";
  confidence: "high" | "medium" | "low";
  timeframe: string;
  resolution?: string;
  needed_skills?: string[];
  capacity_gap?: boolean;
  missing_resources?: string[];
  ready_volunteers?: ReadyVolunteer[];
  created_at: string;
}

interface Volunteer {
  id: string;
  name: string;
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
  const [isFetchingPredictions, setIsFetchingPredictions] = useState(true);
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

      const [issuesRes, volRes] = await Promise.all([
        supabase
          .from("issues")
          .select("*")
          .eq("ngo_user_id", user.id)
          .neq("status", "resolved"),
        supabase.from("volunteers").select("*").eq("ngo_user_id", user.id),
      ]);

      const dbIssues = (issuesRes.data || []) as Issue[];
      setIssues(dbIssues.length > 0 ? dbIssues : []);
      setVolunteers((volRes.data || []) as Volunteer[]);
      
      setLoading(false);

      // Fetch AI Predictions
      setIsFetchingPredictions(true);
      const { data: predData } = await supabase
        .from("smart_predictions")
        .select("*")
        .eq("ngo_user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(3);
      setPredictions((predData || []) as Prediction[]);
      setIsFetchingPredictions(false);
    };
    fetchData();
  }, []);

  const refreshData = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const [issuesRes, volRes] = await Promise.all([
      supabase.from("issues").select("*").eq("ngo_user_id", user.id).neq("status", "resolved"),
      supabase.from("volunteers").select("*").eq("ngo_user_id", user.id),
    ]);
    setIssues((issuesRes.data || []) as Issue[]);
    setVolunteers((volRes.data || []) as Volunteer[]);
    
    setIsFetchingPredictions(false);
  };

  const handlePostToCommunity = async (prediction: Prediction) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Please sign in first.");

      await createNgoRequest({
        title: `Urgent: ${prediction.title}`,
        description: `Based on AI Forecast: ${prediction.description}\n\nMissing Requirements: ${prediction.missing_resources?.join(", ") || "Skills needed for prevention."}`,
        category: prediction.sector,
        urgency: prediction.urgency === "high" ? "critical" : prediction.urgency === "medium" ? "high" : "medium",
        location: "Field / Multiple Locations",
        volunteersNeeded: 5,
        fundingAmount: 0,
        skillsNeeded: prediction.needed_skills?.join(", ") || prediction.sector,
        contactMethod: "Platform Messaging",
      });

      toast.success("Community request posted successfully!");
    } catch (error: any) {
      toast.error("Failed to post request: " + error.message);
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

      {/* AI Predictive Insights Section */}
      {(predictions.length > 0 || isFetchingPredictions) && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/30">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Brain size={18} />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-foreground">AI Strategic Forecast</h2>
                <p className="text-xs text-muted-foreground">Predictive analysis based on current field reports and history</p>
              </div>
            </div>
            <Link to="/insights">
              <Button variant="ghost" size="sm" className="text-xs text-muted-foreground hover:text-foreground gap-1">
                Full Analysis <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </Link>
          </div>

          {/* Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-border">
            <AnimatePresence mode="popLayout">
              {isFetchingPredictions ? (
                Array(3).fill(0).map((_, i) => (
                  <motion.div
                    key={`skeleton-${i}`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="p-5 space-y-3"
                  >
                    <div className="h-4 w-20 bg-muted animate-pulse rounded" />
                    <div className="h-5 w-4/5 bg-muted animate-pulse rounded" />
                    <div className="h-3 w-full bg-muted animate-pulse rounded" />
                    <div className="h-3 w-3/4 bg-muted animate-pulse rounded" />
                  </motion.div>
                ))
              ) : (
                predictions.map((pred, idx) => {
                  const urgencyConfig = {
                    high:   { label: "High Risk",   badge: "bg-destructive/10 text-destructive border-destructive/20",     dot: "bg-destructive"  },
                    medium: { label: "Medium Risk",  badge: "bg-amber-500/10 text-amber-700 border-amber-300 dark:text-amber-400 dark:border-amber-600", dot: "bg-amber-500"   },
                    low:    { label: "Low Risk",     badge: "bg-emerald-500/10 text-emerald-700 border-emerald-300 dark:text-emerald-400 dark:border-emerald-600", dot: "bg-emerald-500" },
                  }[pred.urgency] ?? { label: pred.urgency, badge: "bg-muted text-muted-foreground border-border", dot: "bg-muted-foreground" };

                  return (
                    <motion.div
                      key={pred.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: idx * 0.08 }}
                      className="group flex flex-col justify-between p-5 hover:bg-muted/20 transition-colors"
                    >
                      <div className="space-y-3">
                        {/* Top row: urgency + sector */}
                        <div className="flex items-center justify-between gap-2">
                          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold border ${urgencyConfig.badge}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${urgencyConfig.dot}`} />
                            {urgencyConfig.label}
                          </span>
                          <span className="text-[11px] font-medium text-muted-foreground capitalize">{pred.sector}</span>
                        </div>

                        {/* Title */}
                        <h4 className="text-sm font-semibold text-foreground leading-snug">{pred.title}</h4>

                        {/* Description */}
                        {pred.description && (
                          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">{pred.description}</p>
                        )}

                        {/* Capacity Gap Alert */}
                        {pred.capacity_gap && (
                          <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-500/8 border border-amber-500/20">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                            <div>
                              <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">Resource Gap Detected</p>
                              <p className="text-[11px] text-muted-foreground mt-0.5 leading-tight">
                                {pred.missing_resources?.[0] ?? "Insufficient volunteers for this risk."}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Footer: gap OR ready volunteers */}
                      <div className="mt-4 pt-3 border-t border-border space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <TrendingUp className="w-3.5 h-3.5" />
                            <span className="text-[11px] font-medium">{pred.timeframe || "Next 48–72h"}</span>
                          </div>

                          {pred.capacity_gap ? (
                            <Button
                              onClick={() => handlePostToCommunity(pred)}
                              size="sm"
                              variant="outline"
                              className="h-7 text-[11px] font-semibold border-amber-500/40 text-amber-700 hover:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/30"
                            >
                              Post for Help
                            </Button>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                              Covered
                            </span>
                          )}
                        </div>

                        {/* Ready volunteers list */}
                        {!pred.capacity_gap && pred.ready_volunteers && pred.ready_volunteers.length > 0 && (
                          <div className="space-y-1">
                            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Available to Deploy</p>
                            {pred.ready_volunteers.slice(0, 3).map((vol, vi) => (
                              <div key={vi} className="flex items-center justify-between rounded-md bg-emerald-500/5 border border-emerald-500/15 px-2.5 py-1.5">
                                <div className="flex items-center gap-2">
                                  <Users className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                                  <span className="text-[11px] font-semibold text-foreground">{vol.name}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] text-muted-foreground">{vol.zone}</span>
                                  {vol.current_load !== undefined && (
                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                      vol.current_load === 0 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400" :
                                      "bg-muted text-muted-foreground"
                                    }`}>
                                      {vol.current_load === 0 ? "Free" : `${vol.current_load} active`}
                                    </span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Gap details */}
                        {pred.capacity_gap && pred.missing_resources && pred.missing_resources.length > 0 && (
                          <div className="space-y-1">
                            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Gaps to Fill</p>
                            {pred.missing_resources.map((gap, gi) => (
                              <p key={gi} className="text-[11px] text-muted-foreground leading-tight flex items-start gap-1.5">
                                <span className="w-1 h-1 rounded-full bg-amber-500 mt-1.5 shrink-0" />
                                {gap}
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  );
                })
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      )}

      {/* Analysis Call to Action if empty */}
      {!isFetchingPredictions && predictions.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-background">
              <Brain className="w-4 h-4 text-muted-foreground" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">No predictive insights yet</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Run Smart Analysis to generate AI-driven forecasts for your current issues.</p>
            </div>
          </div>
          <Link to="/insights">
            <Button size="sm" variant="outline" className="gap-1.5 text-xs shrink-0">
              <Sparkles className="w-3.5 h-3.5" /> Run Analysis
            </Button>
          </Link>
        </div>
      )}

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
