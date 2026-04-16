import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Check, CircleCheck, Users, HandHeart, Building2, X } from "lucide-react";
import { getCommunityFeed, getConnectionsForMe } from "@/services/impactService";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

type IssueItem = {
  id: string;
  issue_summary: string | null;
  sector: string | null;
  location: string | null;
  priority_score: number | null;
  status: string | null;
  assignment_reason: string | null;
  ngo_user_id: string | null;
};

type NgoItem = {
  id: string;
  display_name: string | null;
  location: string | null;
  contact_info: string | null;
};

type OpportunityItem = {
  id: string;
  title: string;
  category: string;
  urgency: string;
  location: string;
  status: string;
};

const ACTIVE_ASSIGNMENT_STATUSES = ["assigned", "accepted", "declined"];

export default function VolunteerPortal() {
  const [loading, setLoading] = useState(true);
  const [allAssignedIssues, setAllAssignedIssues] = useState<IssueItem[]>([]);
  const [issues, setIssues] = useState<IssueItem[]>([]);
  const [connectedNgos, setConnectedNgos] = useState<NgoItem[]>([]);
  const [opportunities, setOpportunities] = useState<OpportunityItem[]>([]);
  const [declineDialogId, setDeclineDialogId] = useState<string | null>(null);
  const [declineReason, setDeclineReason] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setIssues([]);
        setConnectedNgos([]);
        setOpportunities([]);
        setLoading(false);
        return;
      }

      const [profileRes, volunteerRes, connections, communityFeed] = await Promise.all([
        supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
        supabase.from("volunteers").select("id, name, email").eq("email", user.email || "").eq("is_active", true),
        getConnectionsForMe(),
        getCommunityFeed(),
      ]);

      let volunteerRows = volunteerRes.data || [];

      if (volunteerRows.length === 0 && profileRes.data?.display_name) {
        const byName = await supabase
          .from("volunteers")
          .select("id, name, email")
          .ilike("name", profileRes.data.display_name)
          .eq("is_active", true);
        volunteerRows = byName.data || [];
      }

      const volunteerIds = volunteerRows.map((volunteer) => volunteer.id);

      let assignedIssues: IssueItem[] = [];
      if (volunteerIds.length > 0) {
        const assignedIssuesRes = await supabase
          .from("issues")
          .select("id, issue_summary, sector, location, priority_score, status, assignment_reason, ngo_user_id")
          .in("assigned_volunteer_id", volunteerIds)
          .order("priority_score", { ascending: false });

        assignedIssues = (assignedIssuesRes.data || []) as IssueItem[];
      }

      setAllAssignedIssues(assignedIssues);
      setIssues(assignedIssues.filter((issue) => ACTIVE_ASSIGNMENT_STATUSES.includes(issue.status || "")));

      const connectedNgoIds = new Set<string>();

      assignedIssues.forEach((issue) => {
        if (issue.ngo_user_id) connectedNgoIds.add(issue.ngo_user_id);
      });

      connections.forEach((connection) => {
        const otherUserId = connection.sender_id === user.id ? connection.receiver_id : connection.sender_id;
        if (otherUserId && otherUserId !== user.id) connectedNgoIds.add(otherUserId);
      });

      const ngoIds = Array.from(connectedNgoIds);
      if (ngoIds.length > 0) {
        const ngosRes = await supabase
          .from("profiles")
          .select("id, display_name, location, contact_info, role")
          .in("id", ngoIds)
          .eq("role", "ngo");

        setConnectedNgos((ngosRes.data || []) as NgoItem[]);
      } else {
        setConnectedNgos([]);
      }

      const openNgoRequests = communityFeed
        .filter((post) => post.postType === "ngo_request")
        .filter((post) => !["fulfilled", "closed", "completed"].includes(post.status))
        .slice(0, 6)
        .map((post) => ({
          id: post.id,
          title: post.title,
          category: post.category,
          urgency: post.urgency,
          location: post.location,
          status: post.status,
        }));

      setOpportunities(openNgoRequests);
    } catch (error: any) {
      toast.error(error.message || "Could not load volunteer portal.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const handleStatusUpdate = async (issueId: string, status: string, reason?: string) => {
    setUpdatingId(issueId);
    try {
      const patch: Record<string, string> = { status };
      if (reason) {
        patch.assignment_reason = `Declined: ${reason}`;
      }

      const { error } = await supabase.from("issues").update(patch).eq("id", issueId);
      if (error) throw error;

      if (status === "accepted") toast.success("Issue accepted.");
      if (status === "declined") toast.success("Issue declined.");
      if (status === "resolved") toast.success("Issue marked as completed.");

      setDeclineDialogId(null);
      setDeclineReason("");
      await refresh();
    } catch (error: any) {
      toast.error(error.message || "Failed to update issue status.");
    } finally {
      setUpdatingId(null);
    }
  };

  const acceptedCount = useMemo(() => issues.filter((issue) => issue.status === "accepted").length, [issues]);
  const sectorChartData = useMemo(() => {
    const sectorCounts = allAssignedIssues.reduce<Record<string, number>>((acc, issue) => {
      const sector = issue.sector || "other";
      acc[sector] = (acc[sector] || 0) + 1;
      return acc;
    }, {});

    return Object.entries(sectorCounts)
      .map(([sector, count]) => ({ sector, count }))
      .sort((a, b) => b.count - a.count);
  }, [allAssignedIssues]);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Volunteer Portal</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your assigned issues, connected NGOs, and community opportunities.
          </p>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs uppercase text-muted-foreground">Assigned Issues</p>
            <p className="text-2xl font-bold mt-1">{allAssignedIssues.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs uppercase text-muted-foreground">Accepted</p>
            <p className="text-2xl font-bold mt-1 text-green-600">{acceptedCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs uppercase text-muted-foreground">Connected NGOs</p>
            <p className="text-2xl font-bold mt-1 text-blue-600">{connectedNgos.length}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Assigned Issues by Topic</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading issue topic chart...</p>
          ) : sectorChartData.length === 0 ? (
            <p className="text-sm text-muted-foreground">No assigned issues to visualize yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={sectorChartData} margin={{ top: 4, right: 12, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="sector" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CircleCheck className="w-4 h-4" />
            My Assigned Issues
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading assigned issues...</p>
          ) : issues.length === 0 ? (
            <p className="text-sm text-muted-foreground">No issues are currently assigned to you.</p>
          ) : (
            issues.map((issue) => (
              <div key={issue.id} className="border rounded-lg p-4 bg-card space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm">{issue.issue_summary || "Untitled issue"}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {issue.location || "Unknown location"} • {issue.sector || "other"}
                    </p>
                  </div>
                  <Badge variant={issue.status === "accepted" ? "default" : issue.status === "declined" ? "destructive" : "secondary"}>
                    {issue.status}
                  </Badge>
                </div>

                {issue.assignment_reason && (
                  <p className="text-xs text-muted-foreground">Note: {issue.assignment_reason}</p>
                )}

                <div className="flex gap-2 flex-wrap pt-1 border-t">
                  {issue.status === "assigned" && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1 text-green-600"
                        onClick={() => handleStatusUpdate(issue.id, "accepted")}
                        disabled={updatingId === issue.id}
                      >
                        <Check className="w-3 h-3" /> Accept
                      </Button>

                      <Dialog open={declineDialogId === issue.id} onOpenChange={(open) => {
                        if (!open) {
                          setDeclineDialogId(null);
                          setDeclineReason("");
                        }
                      }}>
                        <DialogTrigger asChild>
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1 text-red-600"
                            onClick={() => setDeclineDialogId(issue.id)}
                          >
                            <X className="w-3 h-3" /> Decline
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Decline Issue</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-3">
                            <p className="text-sm text-muted-foreground">Please share a short reason for declining.</p>
                            <Textarea
                              className="min-h-24"
                              value={declineReason}
                              onChange={(event) => setDeclineReason(event.target.value)}
                              placeholder="Reason for decline"
                            />
                            <div className="flex gap-2">
                              <Button
                                variant="destructive"
                                onClick={() => handleStatusUpdate(issue.id, "declined", declineReason)}
                                disabled={!declineReason.trim() || updatingId === issue.id}
                              >
                                Confirm Decline
                              </Button>
                              <Button
                                variant="outline"
                                onClick={() => {
                                  setDeclineDialogId(null);
                                  setDeclineReason("");
                                }}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </>
                  )}

                  {issue.status === "accepted" && (
                    <Button
                      size="sm"
                      className="gap-1"
                      onClick={() => handleStatusUpdate(issue.id, "resolved")}
                      disabled={updatingId === issue.id}
                    >
                      <Check className="w-3 h-3" /> Mark Completed
                    </Button>
                  )}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="w-4 h-4" />
              Connected NGOs
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {connectedNgos.length === 0 ? (
              <p className="text-sm text-muted-foreground">No NGO connections yet.</p>
            ) : (
              connectedNgos.map((ngo) => (
                <div key={ngo.id} className="border rounded-md p-3 text-sm">
                  <p className="font-medium">{ngo.display_name || "NGO"}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {ngo.location || "Location not set"}
                    {ngo.contact_info ? ` • ${ngo.contact_info}` : ""}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <HandHeart className="w-4 h-4" />
              Community Connections (Offer Help)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {opportunities.length === 0 ? (
              <p className="text-sm text-muted-foreground">No open community opportunities right now.</p>
            ) : (
              opportunities.map((opportunity) => (
                <div key={opportunity.id} className="border rounded-md p-3 text-sm space-y-1">
                  <p className="font-medium">{opportunity.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {opportunity.category} • {opportunity.urgency} • {opportunity.location}
                  </p>
                  <div className="pt-1">
                    <Button asChild size="sm" variant="outline">
                      <Link to={`/community/ngo_request/${opportunity.id}`}>Offer Help</Link>
                    </Button>
                  </div>
                </div>
              ))
            )}
            <div className="pt-2">
              <Button asChild variant="ghost" size="sm">
                <Link to="/community">View All Community Posts</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
