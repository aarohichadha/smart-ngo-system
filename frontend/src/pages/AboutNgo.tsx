import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { getProfileByUserId, updateNgoProfile } from "@/services/impactService";
import type { NgoProfile } from "@/types/impact";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import {
  BriefcaseBusiness,
  Building2,
  ChevronDown,
  Mail,
  MapPin,
  PencilLine,
  Phone,
} from "lucide-react";

const WORK_AREA_OPTIONS = [
  "Healthcare",
  "Women Safety",
  "Education",
  "Water",
  "Child Welfare",
  "Food Support",
  "Rural Development",
  "Environment",
  "Disaster Relief",
  "Senior Care",
  "Mental Health",
  "Livelihood",
];

const splitWorkAreas = (value: string) =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

function EditHint() {
  return (
    <div className="flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs text-muted-foreground">
      <PencilLine className="h-3.5 w-3.5" />
      <span>Edit</span>
    </div>
  );
}

export default function AboutNgo() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [ngoProfile, setNgoProfile] = useState<NgoProfile | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const selectedWorkAreas = splitWorkAreas(form.work_area || "");

  useEffect(() => {
    let active = true;

    if (!user || user.userType !== "ngo") {
      setNgoProfile(null);
      setLoading(false);
      return;
    }

    void getProfileByUserId(user.id)
      .then((payload) => {
        if (!active) return;

        setNgoProfile(payload.ngoProfile);
        setForm({
          ngo_name: payload.ngoProfile?.ngo_name || user.name || "",
          description: payload.ngoProfile?.description || "",
          address: payload.ngoProfile?.address || payload.ngoProfile?.location || "",
          email: payload.ngoProfile?.email || user.email || "",
          contact_info: payload.ngoProfile?.contact_info || "",
          bank_details: payload.ngoProfile?.bank_details || "",
          image_url: payload.ngoProfile?.image_url || "",
          work_area: payload.ngoProfile?.work_area || payload.ngoProfile?.sector || "",
          past_works: payload.ngoProfile?.past_works || "",
        });
      })
      .catch((error) => {
        console.error("Failed to load NGO about page:", error);
        if (active) {
          setNgoProfile(null);
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [user]);

  const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      setForm((prev) => ({ ...prev, image_url: result }));
    };
    reader.readAsDataURL(file);
  };

  const toggleWorkArea = (area: string) => {
    const current = splitWorkAreas(form.work_area || "");
    const next = current.includes(area)
      ? current.filter((item) => item !== area)
      : [...current, area];

    setForm((prev) => ({ ...prev, work_area: next.join(", ") }));
  };

  const handleSave = async () => {
    if (!user) return;

    try {
      setSaving(true);
      await updateNgoProfile(user.id, {
        ngo_name: form.ngo_name,
        description: form.description,
        address: form.address,
        location: form.address,
        email: form.email,
        contact_info: form.contact_info,
        bank_details: form.bank_details,
        image_url: form.image_url,
        work_area: form.work_area,
        sector: form.work_area,
        past_works: form.past_works,
      });

      const payload = await getProfileByUserId(user.id);
      setNgoProfile(payload.ngoProfile);
      toast.success("About details saved.");
    } catch (error) {
      console.error("Failed to save NGO about details:", error);
      toast.error("Could not save NGO details.");
    } finally {
      setSaving(false);
    }
  };

  if (!user || user.userType !== "ngo") {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            About page is available for NGO accounts only.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">About</h1>
          <p className="text-muted-foreground mt-2">Fill details directly beside each section.</p>
        </div>
        <Button onClick={handleSave} disabled={saving || loading}>
          {saving ? "Saving..." : "Save About Details"}
        </Button>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>NGO Image</CardTitle>
          <EditHint />
        </CardHeader>
        <CardContent className="space-y-4">
          {form.image_url ? (
            <img
              src={form.image_url}
              alt={form.ngo_name || "NGO"}
              className="h-64 w-full rounded-xl object-cover"
            />
          ) : (
            <div className="flex h-64 items-center justify-center rounded-xl bg-muted">
              <Building2 className="h-16 w-16 text-muted-foreground/50" />
            </div>
          )}
          <div className="space-y-2">
            <Input type="file" accept="image/*" onChange={handleImageChange} />
            <p className="text-xs text-muted-foreground">Upload an NGO image here.</p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Organization Details</CardTitle>
            <EditHint />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">NGO Name</p>
              <Input
                value={form.ngo_name || ""}
                onChange={(event) => setForm((prev) => ({ ...prev, ngo_name: event.target.value }))}
                placeholder="NGO name"
              />
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Description</p>
              <Textarea
                value={form.description || ""}
                onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                placeholder="Description"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border p-4">
                <div className="mb-2 flex items-center gap-2">
                  <BriefcaseBusiness className="h-4 w-4 text-primary" />
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Work Area</p>
                </div>
                <div className="space-y-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" className="w-full justify-between font-normal">
                        <span className="truncate">
                          {selectedWorkAreas.length > 0 ? selectedWorkAreas.join(", ") : "Select work areas"}
                        </span>
                        <ChevronDown className="h-4 w-4 opacity-60" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-64">
                      <DropdownMenuLabel>Choose work areas</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {WORK_AREA_OPTIONS.map((area) => (
                        <DropdownMenuCheckboxItem
                          key={area}
                          checked={selectedWorkAreas.includes(area)}
                          onCheckedChange={() => toggleWorkArea(area)}
                        >
                          {area}
                        </DropdownMenuCheckboxItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <p className="text-xs text-muted-foreground">You can select multiple work areas.</p>
                </div>
              </div>

              <div className="rounded-lg border p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Past Works</p>
                <Textarea
                  className="mt-2 min-h-28"
                  value={form.past_works || ""}
                  onChange={(event) => setForm((prev) => ({ ...prev, past_works: event.target.value }))}
                  placeholder="Past works"
                />
              </div>

              <div className="rounded-lg border p-4 md:col-span-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Bank Details</p>
                <Textarea
                  className="mt-2"
                  value={form.bank_details || ""}
                  onChange={(event) => setForm((prev) => ({ ...prev, bank_details: event.target.value }))}
                  placeholder="Bank details"
                />
              </div>
            </div>

            {loading ? (
              <p className="text-xs text-muted-foreground">Loading current NGO details...</p>
            ) : ngoProfile ? null : (
              <p className="text-xs text-muted-foreground">No existing NGO details found yet. You can add them now.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Contact Details</CardTitle>
            <EditHint />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-3 rounded-lg border p-4">
              <MapPin className="mt-0.5 h-4 w-4 text-primary" />
              <div className="w-full space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Address</p>
                <Input
                  value={form.address || ""}
                  onChange={(event) => setForm((prev) => ({ ...prev, address: event.target.value }))}
                  placeholder="Address"
                />
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-lg border p-4">
              <Mail className="mt-0.5 h-4 w-4 text-primary" />
              <div className="w-full space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Email</p>
                <Input
                  value={form.email || ""}
                  onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                  placeholder="Email"
                />
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-lg border p-4">
              <Phone className="mt-0.5 h-4 w-4 text-primary" />
              <div className="w-full space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Contact Number</p>
                <Input
                  value={form.contact_info || ""}
                  onChange={(event) => setForm((prev) => ({ ...prev, contact_info: event.target.value }))}
                  placeholder="Contact number"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
