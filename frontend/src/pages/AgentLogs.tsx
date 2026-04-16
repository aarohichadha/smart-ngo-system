import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronUp, Terminal } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { formatDateTime, formatTime } from "@/lib/i18n";

interface AgentRun {
  id: string;
  run_at: string | null;
  total_issues: number | null;
  total_assigned: number | null;
  alerts: any;
  agent_logs: any;
}

function RunCard({ run }: { run: AgentRun }) {
  const [expanded, setExpanded] = useState(false);
  const { language, t } = useLanguage();
  const logs: any[] = Array.isArray(run.agent_logs) ? run.agent_logs : [];
  const alerts: any[] = Array.isArray(run.alerts) ? run.alerts : [];

  return (
    <Card className="overflow-hidden">
      <CardHeader
        className="cursor-pointer hover:bg-muted/40 transition-colors py-4"
        onClick={() => setExpanded((e) => !e)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Terminal className="w-4 h-4 text-primary" />
            <div>
              <p className="text-sm font-semibold text-foreground">
                {t("agentLogs.runLabel", { time: run.run_at ? formatDateTime(language, run.run_at) : t("common.unknown") })}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t("agentLogs.issuesAssigned", { issues: run.total_issues || 0, assigned: run.total_assigned || 0, steps: logs.length })}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {alerts.length > 0 && (
              <Badge variant="outline" className="text-amber-600 border-amber-200 text-xs">
                {alerts.length} {t("agentLogs.alerts")}
              </Badge>
            )}
            {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </div>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="p-0">
          <div
            className="terminal-console p-4 text-xs leading-relaxed overflow-y-auto"
            style={{ maxHeight: 320, background: "#0f1117" }}
          >
            {logs.length === 0 ? (
              <span className="text-green-400/40">{t("agentLogs.noLogs")}</span>
            ) : (
              logs.map((log: any, i: number) => (
                <div key={i} className="mb-2">
                  <span className="text-green-400/60">[{formatTime(language, log.timestamp)}]</span>
                  {" "}
                  <span className="text-cyan-400">{log.agent}</span>
                  {" › "}
                  <span className="text-green-300">{log.decision}</span>
                  {log.reasoning && log.reasoning !== "Placeholder" && (
                    <div className="ml-[120px] text-green-400/50 mt-0.5">{log.reasoning}</div>
                  )}
                </div>
              ))
            )}
          </div>
          {alerts.length > 0 && (
            <div className="p-4 border-t space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("agentLogs.alerts")}</p>
              {alerts.map((alert: any, i: number) => (
                <div key={i} className={`text-xs p-2 rounded flex items-center gap-2 ${alert.severity === "critical" ? "bg-red-50 text-red-700" : alert.severity === "warning" ? "bg-amber-50 text-amber-700" : "bg-blue-50 text-blue-700"}`}>
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${alert.severity === "critical" ? "bg-destructive" : alert.severity === "warning" ? "bg-amber-500" : "bg-blue-500"}`} />
                  {alert.message}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

export default function AgentLogs() {
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [loading, setLoading] = useState(true);
  const { t } = useLanguage();

  useEffect(() => {
    const fetchRuns = async () => {
      setLoading(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setRuns([]);
        setLoading(false);
        return;
      }

      const withOwnerFilter = await supabase
        .from("agent_runs")
        .select("*")
        .eq("ngo_user_id", user.id)
        .order("run_at", { ascending: false });

      if (withOwnerFilter.error) {
        setRuns([]);
      } else {
        setRuns(withOwnerFilter.data || []);
      }
      setLoading(false);
    };
    fetchRuns();
  }, []);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold">{t("agentLogs.title")}</h1>
        <p className="text-muted-foreground text-sm mt-1">{t("agentLogs.subtitle", { count: runs.length })}</p>
      </div>

      {loading ? (
        <div className="text-center text-muted-foreground py-16">{t("agentLogs.loading")}</div>
      ) : runs.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground text-sm">
          {t("agentLogs.noRuns")}
        </div>
      ) : (
        <div className="space-y-3">
          {runs.map((run) => <RunCard key={run.id} run={run} />)}
        </div>
      )}
    </div>
  );
}
