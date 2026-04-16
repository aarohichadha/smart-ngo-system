import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Plus, UserPlus, Pencil, Trash2 } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { translateSkill } from "@/lib/i18n";

interface Volunteer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  skills: string[] | null;
  zone: string | null;
  availability_hours_per_week: number | null;
  is_active: boolean | null;
}

const ALL_SKILLS = ["healthcare", "water", "electricity", "sanitation", "food", "education", "shelter", "safety", "logistics", "counseling"];

const SKILL_COLORS: Record<string, string> = {
  healthcare: "bg-red-100 text-red-700",
  water: "bg-teal-100 text-teal-700",
  electricity: "bg-amber-100 text-amber-700",
  food: "bg-green-100 text-green-700",
  education: "bg-blue-100 text-blue-700",
  shelter: "bg-purple-100 text-purple-700",
  sanitation: "bg-orange-100 text-orange-700",
  safety: "bg-rose-100 text-rose-700",
  logistics: "bg-slate-100 text-slate-700",
  counseling: "bg-pink-100 text-pink-700",
};

const DIRECTORY_VOLUNTEER_FALLBACK: Volunteer[] = [
  {
    id: "fallback-vol-1",
    name: "Anita Sharma",
    email: "anita@example.org",
    phone: "+91 98765 12345",
    skills: ["counseling", "healthcare"],
    zone: "Delhi",
    availability_hours_per_week: 8,
    is_active: true,
  },
  {
    id: "fallback-vol-2",
    name: "Rohan Mehta",
    email: "rohan@example.org",
    phone: "+91 91234 56789",
    skills: ["education", "logistics"],
    zone: "Mumbai",
    availability_hours_per_week: 12,
    is_active: true,
  },
  {
    id: "fallback-vol-3",
    name: "Meera Iyer",
    email: "meera@example.org",
    phone: "+91 90011 22334",
    skills: ["community outreach", "content creation"],
    zone: "Bengaluru",
    availability_hours_per_week: 10,
    is_active: true,
  },
];

const defaultForm = { name: "", email: "", phone: "", zone: "", availability_hours_per_week: 10, skills: [] as string[], is_active: true };

export default function Volunteers() {
  const [volunteers, setVolunteers] = useState<Volunteer[]>([]);
  const [assignedCounts, setAssignedCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingVolunteerId, setEditingVolunteerId] = useState<string | null>(null);
  const [deletingVolunteerId, setDeletingVolunteerId] = useState<string | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [editForm, setEditForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);
  const { language, t } = useLanguage();

  const fetchData = async () => {
    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setVolunteers(DIRECTORY_VOLUNTEER_FALLBACK);
      setAssignedCounts({});
      setLoading(false);
      return;
    }

    const [volRes, issuesRes] = await Promise.all([
      supabase
        .from("volunteers")
        .select("*")
        .eq("ngo_user_id", user.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("issues")
        .select("assigned_volunteer_id")
        .eq("ngo_user_id", user.id)
        .neq("status", "resolved")
        .not("assigned_volunteer_id", "is", null),
    ]);
    const fetched = (volRes.data || []) as Volunteer[];
    setVolunteers(fetched.length > 0 ? fetched : DIRECTORY_VOLUNTEER_FALLBACK);
    const counts: Record<string, number> = {};
    (issuesRes.data || []).forEach((i) => {
      if (i.assigned_volunteer_id) counts[i.assigned_volunteer_id] = (counts[i.assigned_volunteer_id] || 0) + 1;
    });
    setAssignedCounts(counts);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleSave = async () => {
    if (!form.name.trim() || !form.zone.trim()) {
      toast.error(t("volunteers.nameRequired"));
      return;
    }
    setSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      toast.error("Please sign in first.");
      setSaving(false);
      return;
    }

    const { error } = await supabase.from("volunteers").insert({
      ngo_user_id: user.id,
      name: form.name,
      email: form.email || null,
      phone: form.phone || null,
      zone: form.zone,
      availability_hours_per_week: form.availability_hours_per_week,
      skills: form.skills,
      is_active: form.is_active,
    });
    if (error) {
      toast.error(t("volunteers.saveFailed", { message: error.message }));
    } else {
      toast.success(t("volunteers.added"));
      setForm(defaultForm);
      setOpen(false);
      await fetchData();
    }
    setSaving(false);
  };

  const toggleSkill = (skill: string) => {
    setForm((f) => ({
      ...f,
      skills: f.skills.includes(skill) ? f.skills.filter((s) => s !== skill) : [...f.skills, skill],
    }));
  };

  const toggleEditSkill = (skill: string) => {
    setEditForm((f) => ({
      ...f,
      skills: f.skills.includes(skill) ? f.skills.filter((s) => s !== skill) : [...f.skills, skill],
    }));
  };

  const openEditDialog = (volunteer: Volunteer) => {
    setEditingVolunteerId(volunteer.id);
    setEditForm({
      name: volunteer.name || "",
      email: volunteer.email || "",
      phone: volunteer.phone || "",
      zone: volunteer.zone || "",
      availability_hours_per_week: volunteer.availability_hours_per_week || 10,
      skills: volunteer.skills || [],
      is_active: Boolean(volunteer.is_active),
    });
    setEditOpen(true);
  };

  const handleUpdateVolunteer = async () => {
    if (!editingVolunteerId) return;
    if (!editForm.name.trim() || !editForm.zone.trim()) {
      toast.error(t("volunteers.nameRequired"));
      return;
    }

    setSaving(true);
    const { error } = await supabase
      .from("volunteers")
      .update({
        name: editForm.name,
        email: editForm.email || null,
        phone: editForm.phone || null,
        zone: editForm.zone,
        availability_hours_per_week: editForm.availability_hours_per_week,
        skills: editForm.skills,
        is_active: editForm.is_active,
      })
      .eq("id", editingVolunteerId);

    if (error) {
      toast.error(t("volunteers.saveFailed", { message: error.message }));
    } else {
      toast.success("Volunteer updated.");
      setEditOpen(false);
      setEditingVolunteerId(null);
      await fetchData();
    }
    setSaving(false);
  };

  const handleDeleteVolunteer = async (volunteerId: string, volunteerName: string) => {
    const confirmed = window.confirm(`Delete ${volunteerName}? This action cannot be undone.`);
    if (!confirmed) return;

    setDeletingVolunteerId(volunteerId);
    const { error } = await supabase.from("volunteers").delete().eq("id", volunteerId);

    if (error) {
      toast.error(`Failed to delete volunteer: ${error.message}`);
    } else {
      toast.success("Volunteer deleted.");
      await fetchData();
    }
    setDeletingVolunteerId(null);
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("volunteers.title")}</h1>
          <p className="text-muted-foreground text-sm mt-1">{t("volunteers.registered", { count: volunteers.length })}</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2">
                <Plus className="w-4 h-4" /> {t("volunteers.addVolunteer")}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <UserPlus className="w-4 h-4" /> {t("volunteers.addVolunteer")}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>{t("volunteers.nameRequired")}</Label>
                    <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder={t("auth.fullName")} />
                  </div>
                  <div className="space-y-1">
                    <Label>{t("volunteers.zone")}</Label>
                    <Input value={form.zone} onChange={(e) => setForm((f) => ({ ...f, zone: e.target.value }))} placeholder="e.g. North" />
                  </div>
                  <div className="space-y-1">
                    <Label>{t("volunteers.email")}</Label>
                    <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="email@org.com" />
                  </div>
                  <div className="space-y-1">
                    <Label>{t("volunteers.phone")}</Label>
                    <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="+1 234 567 890" />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>{t("volunteers.availability")}</Label>
                  <Input type="number" min={1} max={80} value={form.availability_hours_per_week} onChange={(e) => setForm((f) => ({ ...f, availability_hours_per_week: +e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>{t("volunteers.skillLabel")}</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {ALL_SKILLS.map((skill) => (
                      <label key={skill} className="flex items-center gap-2 text-sm cursor-pointer">
                        <Checkbox checked={form.skills.includes(skill)} onCheckedChange={() => toggleSkill(skill)} />
                        <span className="capitalize">{translateSkill(language, skill)}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Switch checked={form.is_active} onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))} />
                  <Label>{t("volunteers.activeToggle")}</Label>
                </div>
                <Button className="w-full" onClick={handleSave} disabled={saving}>
                  {saving ? t("common.loading") : t("volunteers.saveVolunteer")}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={editOpen} onOpenChange={setEditOpen}>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Pencil className="w-4 h-4" /> Edit Volunteer
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>{t("volunteers.nameRequired")}</Label>
                    <Input value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} placeholder={t("auth.fullName")} />
                  </div>
                  <div className="space-y-1">
                    <Label>{t("volunteers.zone")}</Label>
                    <Input value={editForm.zone} onChange={(e) => setEditForm((f) => ({ ...f, zone: e.target.value }))} placeholder="e.g. North" />
                  </div>
                  <div className="space-y-1">
                    <Label>{t("volunteers.email")}</Label>
                    <Input type="email" value={editForm.email} onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))} placeholder="email@org.com" />
                  </div>
                  <div className="space-y-1">
                    <Label>{t("volunteers.phone")}</Label>
                    <Input value={editForm.phone} onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))} placeholder="+1 234 567 890" />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>{t("volunteers.availability")}</Label>
                  <Input type="number" min={1} max={80} value={editForm.availability_hours_per_week} onChange={(e) => setEditForm((f) => ({ ...f, availability_hours_per_week: +e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>{t("volunteers.skillLabel")}</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {ALL_SKILLS.map((skill) => (
                      <label key={skill} className="flex items-center gap-2 text-sm cursor-pointer">
                        <Checkbox checked={editForm.skills.includes(skill)} onCheckedChange={() => toggleEditSkill(skill)} />
                        <span className="capitalize">{translateSkill(language, skill)}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Switch checked={editForm.is_active} onCheckedChange={(v) => setEditForm((f) => ({ ...f, is_active: v }))} />
                  <Label>{t("volunteers.activeToggle")}</Label>
                </div>
                <Button className="w-full" onClick={handleUpdateVolunteer} disabled={saving}>
                  {saving ? t("common.loading") : "Save Changes"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {loading ? (
        <div className="text-center text-muted-foreground py-16">{t("volunteers.loading")}</div>
      ) : volunteers.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground text-sm">
          {t("volunteers.noVolunteersYet")}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {volunteers.map((v) => (
            <div key={v.id} className="bg-card border rounded-lg p-4 space-y-3">
              {(() => {
                const totalHours = v.availability_hours_per_week || 10;
                const assignedTasks = assignedCounts[v.id] || 0;
                const remainingHours = Math.max(0, totalHours - assignedTasks);
                const isAvailable = Boolean(v.is_active) && remainingHours > 0;

                return (
                  <>
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-sm text-foreground">{v.name}</p>
                  <p className="text-xs text-muted-foreground">{v.zone || "—"}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${isAvailable ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"}`}>
                  {isAvailable ? t("volunteers.active") : "Not Available"}
                </span>
              </div>
              <div className="flex flex-wrap gap-1">
                {(v.skills || []).map((skill) => (
                  <span key={skill} className={`text-xs px-1.5 py-0.5 rounded font-medium capitalize ${SKILL_COLORS[skill] || "bg-muted text-muted-foreground"}`}>
                    {translateSkill(language, skill)}
                  </span>
                ))}
                {(!v.skills || v.skills.length === 0) && <span className="text-xs text-muted-foreground">{t("volunteers.noSkillsListed")}</span>}
              </div>
              <div className="space-y-2 text-xs border-t pt-2">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t("volunteers.hoursPerWeek", { hours: totalHours })}</span>
                  <span className="text-muted-foreground">{t("volunteers.assignedIssues", { count: assignedTasks })}</span>
                </div>
                <div className="flex items-center justify-between font-semibold bg-muted/50 p-2 rounded">
                  <span>Remaining Capacity:</span>
                  <span className={`${remainingHours > 0 ? "text-green-600" : "text-red-600"}`}>
                    {remainingHours > 0 ? `${remainingHours} hrs` : "Not Available"}
                  </span>
                </div>
                <div className="flex gap-2 pt-1">
                  <Button size="sm" variant="outline" className="flex-1 gap-1" onClick={() => openEditDialog(v)}>
                    <Pencil className="w-3 h-3" /> Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="flex-1 gap-1"
                    onClick={() => handleDeleteVolunteer(v.id, v.name)}
                    disabled={deletingVolunteerId === v.id}
                  >
                    <Trash2 className="w-3 h-3" /> {deletingVolunteerId === v.id ? "Deleting..." : "Delete"}
                  </Button>
                </div>
              </div>
                  </>
                );
              })()}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
