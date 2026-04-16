import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLanguage } from "@/contexts/LanguageContext";

export interface OfferFormValues {
  title: string;
  description: string;
  skills: string;
  availability: string;
  preferredCauses: string;
  location: string;
  mode: "remote" | "on_ground" | "hybrid";
  contactMethod: string;
}

const INITIAL_STATE: OfferFormValues = {
  title: "Community Outreach Support Offer",
  description: "We can support local NGOs with outreach, beneficiary registration, and simple campaign coordination for short-term community programs.",
  skills: "community outreach, event coordination, documentation",
  availability: "Weekends and weekday evenings",
  preferredCauses: "Healthcare Outreach, Education Support",
  location: "Delhi",
  mode: "remote",
  contactMethod: "Email: hello@demo-volunteer.org",
};

interface OfferFormDialogProps {
  onSubmit: (values: OfferFormValues) => Promise<void>;
  triggerLabel?: string;
  title?: string;
}

export function OfferFormDialog({
  onSubmit,
  triggerLabel = "New Offer",
  title = "Create Volunteer Offer",
}: OfferFormDialogProps) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [values, setValues] = useState<OfferFormValues>(INITIAL_STATE);

  const update = <K extends keyof OfferFormValues>(key: K, value: OfferFormValues[K]) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  const submit = async () => {
    setSaving(true);
    try {
      await onSubmit(values);
      setValues(INITIAL_STATE);
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-black text-white hover:bg-zinc-800 hover:text-white">
          {triggerLabel || t("offerForm.triggerLabel")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title || t("offerForm.title")}</DialogTitle>
          <DialogDescription>{t("offerForm.description")}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 md:grid-cols-2">
          <Input placeholder={t("offerForm.titleField")} value={values.title} onChange={(e) => update("title", e.target.value)} />
          <Input placeholder={t("offerForm.locationField")} value={values.location} onChange={(e) => update("location", e.target.value)} />
          <Textarea className="md:col-span-2" placeholder={t("offerForm.descriptionField")} value={values.description} onChange={(e) => update("description", e.target.value)} />
          <Input placeholder={t("offerForm.skillsField")} value={values.skills} onChange={(e) => update("skills", e.target.value)} />
          <Input placeholder={t("offerForm.availabilityField")} value={values.availability} onChange={(e) => update("availability", e.target.value)} />
          <Input className="md:col-span-2" placeholder={t("offerForm.preferredCausesField")} value={values.preferredCauses} onChange={(e) => update("preferredCauses", e.target.value)} />

          <Select value={values.mode} onValueChange={(value: OfferFormValues["mode"]) => update("mode", value)}>
            <SelectTrigger>
              <SelectValue placeholder={t("offerForm.modeField")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="remote">{t("offerForm.remote")}</SelectItem>
              <SelectItem value="on_ground">{t("offerForm.onGround")}</SelectItem>
              <SelectItem value="hybrid">{t("offerForm.hybrid")}</SelectItem>
            </SelectContent>
          </Select>

          <Input placeholder={t("offerForm.contactMethodField")} value={values.contactMethod} onChange={(e) => update("contactMethod", e.target.value)} />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>{t("offerForm.cancel")}</Button>
          <Button onClick={submit} disabled={saving || !values.title || !values.description}>
            {saving ? t("offerForm.saving") : t("offerForm.publish")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
