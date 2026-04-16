import { FormEvent, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useAuthProfile } from "@/hooks/useAuthProfile";
import {
  getProfileByUserId,
  updateIndividualProfile,
  updateNgoProfile,
} from "@/services/impactService";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { Check, X, AlertCircle } from "lucide-react";

export default function Profile() {
  const { userId: routeUserId } = useParams();
  const { userId: authUserId } = useAuthProfile();

  const activeUserId = routeUserId || authUserId;
  const isOwnProfile = !routeUserId || routeUserId === authUserId;

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [assignments, setAssignments] = useState<any[]>([]);
  const [declineReason, setDeclineReason] = useState("");
  const [declineDialogId, setDeclineDialogId] = useState<string | null>(null);

  const refresh = async () => {
    if (!activeUserId) return;

    setLoading(true);
    try {
      const payload = await getProfileByUserId(activeUserId);
      setData(payload);
      setForm({
        display_name: payload.profile?.display_name || "",
        location: payload.profile?.location || "",
        contact_info: payload.profile?.contact_info || "",
        ngo_name: payload.ngoProfile?.ngo_name || "",
        description: payload.ngoProfile?.description || "",
        sector: payload.ngoProfile?.sector || "",
        address: payload.ngoProfile?.address || "",
        email: payload.ngoProfile?.email || "",
        bank_details: payload.ngoProfile?.bank_details || "",
        image_url: payload.ngoProfile?.image_url || "",
        work_area: payload.ngoProfile?.work_area || "",
        past_works: payload.ngoProfile?.past_works || "",
        full_name: payload.individualProfile?.full_name || "",
        skills: (payload.individualProfile?.skills || []).join(", "),
        interests: (payload.individualProfile?.interests || []).join(", "),
        availability: payload.individualProfile?.availability || "",
      });

      // Fetch assignments for individual volunteers
      if (payload.profile.role === "individual" && isOwnProfile) {
        const { data: volData } = await supabase
          .from("volunteers")
          .select("id")
          .eq("ngo_user_id", activeUserId)
          .single();

        if (volData?.id) {
          const { data: issuesData } = await supabase
            .from("issues")
            .select("*")
            .eq("assigned_volunteer_id", volData.id)
            .order("priority_score", { ascending: false });
          setAssignments(issuesData || []);
        }
      }
    } catch (error: any) {
      toast.error(error.message || "Could not load profile.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, [activeUserId]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!data?.profile || !activeUserId) return;

    try {
      if (data.profile.role === "ngo") {
        await updateNgoProfile(activeUserId, {
          ngo_name: form.ngo_name,
          description: form.description,
          sector: form.sector,
          location: form.location,
          contact_info: form.contact_info,
          address: form.address,
          email: form.email,
          bank_details: form.bank_details,
          image_url: form.image_url,
          work_area: form.work_area,
          past_works: form.past_works,
        });
      } else {
        await updateIndividualProfile(activeUserId, {
          full_name: form.full_name,
          skills: form.skills,
          interests: form.interests,
          location: form.location,
          availability: form.availability,
          contact_info: form.contact_info,
        });
      }

      setEditing(false);
      toast.success("Profile updated.");
      refresh();
    } catch (error: any) {
      toast.error(error.message || "Could not update profile.");
    }
  };

  const handleNgoImageChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      setForm((prev) => ({ ...prev, image_url: result }));
    };
    reader.readAsDataURL(file);
  };

  const handleAcceptAssignment = async (issueId: string) => {
    try {
      const { error } = await supabase
        .from("issues")
        .update({ status: "accepted" })
        .eq("id", issueId);

      if (error) throw error;
      toast.success("Assignment accepted!");
      refresh();
    } catch (error: any) {
      toast.error("Failed to accept assignment: " + error.message);
    }
  };

  const handleDeclineAssignment = async (issueId: string) => {
    if (!declineReason.trim()) {
      toast.error("Please provide a reason for declining.");
      return;
    }

    try {
      const { error } = await supabase
        .from("issues")
        .update({ status: "declined", assignment_reason: `Declined: ${declineReason}` })
        .eq("id", issueId);

      if (error) throw error;
      toast.success("Assignment declined. Reason recorded.");
      setDeclineReason("");
      setDeclineDialogId(null);
      refresh();
    } catch (error: any) {
      toast.error("Failed to decline assignment: " + error.message);
    }
  };

  if (loading) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <Card><CardContent className="py-8 text-center text-muted-foreground">Loading profile...</CardContent></Card>
      </div>
    );
  }

  if (!data?.profile) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <Card><CardContent className="py-8 text-center text-muted-foreground">Profile not found.</CardContent></Card>
      </div>
    );
  }

  const role = data.profile.role;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="text-xl">{data.profile.display_name}</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">{data.profile.location || "Location not set"}</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge>{role === "ngo" ? "NGO" : "Volunteer"}</Badge>
              <Badge variant="outline">{data.profile.verification_status}</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isOwnProfile && (
            <Button variant="outline" size="sm" onClick={() => setEditing((prev) => !prev)}>
              {editing ? "Cancel" : "Edit profile"}
            </Button>
          )}
        </CardContent>
      </Card>

      {editing && isOwnProfile && (
        <Card>
          <CardHeader><CardTitle className="text-base">Edit profile</CardTitle></CardHeader>
          <CardContent>
            <form className="grid gap-3 md:grid-cols-2" onSubmit={submit}>
              {role === "ngo" ? (
                <>
                  <Input value={form.ngo_name || ""} onChange={(e) => setForm((prev) => ({ ...prev, ngo_name: e.target.value }))} placeholder="NGO name" />
                  <Input value={form.sector || ""} onChange={(e) => setForm((prev) => ({ ...prev, sector: e.target.value }))} placeholder="Sector" />
                  <Input value={form.address || ""} onChange={(e) => setForm((prev) => ({ ...prev, address: e.target.value }))} placeholder="Address" />
                  <Input value={form.email || ""} onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))} placeholder="Email" />
                  <Input value={form.contact_info || ""} onChange={(e) => setForm((prev) => ({ ...prev, contact_info: e.target.value }))} placeholder="Contact number" />
                  <Input value={form.work_area || ""} onChange={(e) => setForm((prev) => ({ ...prev, work_area: e.target.value }))} placeholder="Work area" />
                  <Textarea className="md:col-span-2" value={form.description || ""} onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))} placeholder="Description" />
                  <Textarea className="md:col-span-2" value={form.bank_details || ""} onChange={(e) => setForm((prev) => ({ ...prev, bank_details: e.target.value }))} placeholder="Bank details" />
                  <Textarea className="md:col-span-2" value={form.past_works || ""} onChange={(e) => setForm((prev) => ({ ...prev, past_works: e.target.value }))} placeholder="Past works" />
                  <div className="md:col-span-2 space-y-2">
                    <Input type="file" accept="image/*" onChange={handleNgoImageChange} />
                    {form.image_url ? (
                      <img src={form.image_url} alt="NGO preview" className="h-24 w-24 rounded-lg object-cover border" />
                    ) : null}
                  </div>
                </>
              ) : (
                <>
                  <Input value={form.full_name || ""} onChange={(e) => setForm((prev) => ({ ...prev, full_name: e.target.value }))} placeholder="Full name" />
                  <Input value={form.availability || ""} onChange={(e) => setForm((prev) => ({ ...prev, availability: e.target.value }))} placeholder="Availability" />
                  <Input className="md:col-span-2" value={form.skills || ""} onChange={(e) => setForm((prev) => ({ ...prev, skills: e.target.value }))} placeholder="Skills (comma separated)" />
                  <Input className="md:col-span-2" value={form.interests || ""} onChange={(e) => setForm((prev) => ({ ...prev, interests: e.target.value }))} placeholder="Interests (comma separated)" />
                </>
              )}

              <Input value={form.location || ""} onChange={(e) => setForm((prev) => ({ ...prev, location: e.target.value }))} placeholder="Location" />
              <Input value={form.contact_info || ""} onChange={(e) => setForm((prev) => ({ ...prev, contact_info: e.target.value }))} placeholder="Contact info" />
              <div className="md:col-span-2">
                <Button type="submit">Save profile</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Active NGO Requests</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {data.requests.length === 0 ? (
              <p className="text-sm text-muted-foreground">No requests yet.</p>
            ) : (
              data.requests.map((request: any) => (
                <div key={request.id} className="border rounded-md p-3">
                  <p className="font-medium text-sm">{request.title}</p>
                  <p className="text-xs text-muted-foreground">{request.status} · {request.category}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Active Volunteer Offers</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {data.offers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No offers yet.</p>
            ) : (
              data.offers.map((offer: any) => (
                <div key={offer.id} className="border rounded-md p-3">
                  <p className="font-medium text-sm">{offer.title}</p>
                  <p className="text-xs text-muted-foreground">{offer.status} · {offer.mode}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {role === "individual" && isOwnProfile && assignments.length > 0 && (
        <Card className="border-blue-200 bg-blue-50/50">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-blue-600" />
              My Assignments
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">You have {assignments.length} issue(s) assigned to you</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {assignments.map((issue: any) => (
              <div key={issue.id} className="border rounded-lg p-4 bg-white space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm">{issue.issue_summary}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Location: {issue.location} • Sector: {issue.sector}
                    </p>
                  </div>
                  <Badge variant={issue.priority_score > 7 ? "destructive" : issue.priority_score > 4 ? "secondary" : "outline"}>
                    Priority: {issue.priority_score?.toFixed(1) || "—"}
                  </Badge>
                </div>

                {issue.status !== "accepted" && issue.status !== "declined" && (
                  <div className="flex gap-2 pt-2 border-t">
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1 text-green-600 hover:text-green-700 hover:bg-green-50"
                      onClick={() => handleAcceptAssignment(issue.id)}
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
                          className="gap-1 text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() => setDeclineDialogId(issue.id)}
                        >
                          <X className="w-3 h-3" /> Decline
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Decline Assignment</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                          <p className="text-sm text-muted-foreground">Please tell us why you're declining this assignment:</p>
                          <Textarea
                            value={declineReason}
                            onChange={(e) => setDeclineReason(e.target.value)}
                            placeholder="e.g., Not available, Lack of expertise, Personal reasons..."
                            className="min-h-24"
                          />
                          <div className="flex gap-2">
                            <Button
                              variant="destructive"
                              onClick={() => handleDeclineAssignment(issue.id)}
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
                  </div>
                )}

                {issue.status === "accepted" && (
                  <div className="pt-2 border-t">
                    <Badge variant="default" className="bg-green-600">✓ Accepted</Badge>
                  </div>
                )}

                {issue.status === "declined" && (
                  <div className="pt-2 border-t">
                    <Badge variant="destructive">Declined</Badge>
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
