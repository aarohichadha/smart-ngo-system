import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { AlertTriangle, Users, ListChecks, Unlink } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { translateSector } from "@/lib/i18n";

interface Stats {
  totalIssues: number;
  criticalIssues: number;
  activeVolunteers: number;
  unassignedIssues: number;
}

interface SectorData {
  sector: string;
  count: number;
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats>({ totalIssues: 0, criticalIssues: 0, activeVolunteers: 0, unassignedIssues: 0 });
  const [sectorData, setSectorData] = useState<SectorData[]>([]);
  const [loading, setLoading] = useState(true);
  const { language, t } = useLanguage();
  const { user } = useAuth();

  const fetchStats = async () => {
    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setStats({ totalIssues: 0, criticalIssues: 0, activeVolunteers: 0, unassignedIssues: 0 });
      setSectorData([]);
      setLoading(false);
      return;
    }

    const [issuesRes, volunteersRes] = await Promise.all([
      supabase
        .from("issues")
        .select("priority_score, status, sector")
        .eq("ngo_user_id", user.id)
        .neq("status", "resolved"),
      supabase.from("volunteers").select("is_active").eq("ngo_user_id", user.id),
    ]);

    const dbIssues = issuesRes.data || [];
    const dbVolunteers = volunteersRes.data || [];

    // Add dummy issues for demonstration
    const dummyIssues = [
      { priority_score: 9, status: "unassigned", sector: "education" },
      { priority_score: 7, status: "assigned", sector: "healthcare" },
      { priority_score: 8, status: "in_progress", sector: "environment" },
      { priority_score: 6, status: "assigned", sector: "education" },
      { priority_score: 5, status: "unassigned", sector: "rural_development" },
      { priority_score: 9, status: "in_progress", sector: "healthcare" },
      { priority_score: 4, status: "assigned", sector: "environment" },
      { priority_score: 8, status: "unassigned", sector: "education" },
    ];

    const issues = [...dbIssues, ...dummyIssues];
    const volunteers = dbVolunteers;

    const sectorMap: Record<string, number> = {};
    issues.forEach((i) => {
      const s = i.sector || "other";
      sectorMap[s] = (sectorMap[s] || 0) + 1;
    });

    setStats({
      totalIssues: issues.length,
      criticalIssues: issues.filter((i) => (i.priority_score || 0) > 7).length,
      activeVolunteers: volunteers.filter((v) => v.is_active).length,
      unassignedIssues: issues.filter((i) => i.status === "unassigned").length,
    });

    setSectorData(Object.entries(sectorMap).map(([sector, count]) => ({ sector, count })));

    setLoading(false);
  };

  useEffect(() => { fetchStats(); }, []);
  const statCards = [
    { label: t("dashboard.totalIssues"), value: stats.totalIssues, icon: ListChecks, color: "text-primary" },
    { label: t("dashboard.criticalIssues"), value: stats.criticalIssues, icon: AlertTriangle, color: "text-destructive" },
    { label: t("dashboard.activeVolunteers"), value: stats.activeVolunteers, icon: Users, color: "text-blue-600" },
    { label: t("dashboard.unassignedIssues"), value: stats.unassignedIssues, icon: Unlink, color: "text-amber-500" },
  ];

  const localizedSectorData = sectorData.map(({ sector, count }) => ({
    sector: translateSector(language, sector),
    count,
  }));

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("dashboard.title")}</h1>
          <p className="text-muted-foreground text-sm mt-1">{t("dashboard.subtitle")}</p>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-4">
            {statCards.map(({ label, value, icon: Icon, color }) => (
              <Card key={label}>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">{label}</p>
                      <p className={`text-3xl font-bold mt-1 ${color}`}>
                        {loading ? "—" : value}
                      </p>
                    </div>
                    <Icon className={`w-8 h-8 ${color} opacity-20`} />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Sector bar chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("dashboard.issuesBySector")}</CardTitle>
            </CardHeader>
            <CardContent>
              {localizedSectorData.length === 0 ? (
                <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
                  {t("dashboard.noIssuesYet")}
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={localizedSectorData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis
                      dataKey="sector"
                      tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "6px",
                        fontSize: 12,
                      }}
                    />
                    <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
    </div>
  );
}
