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

export interface RequestFormValues {
  title: string;
  description: string;
  category: string;
  urgency: "low" | "medium" | "high" | "critical";
  location: string;
  volunteersNeeded: number;
  fundingAmount: number;
  skillsNeeded: string;
  deadline: string;
  contactMethod: string;
}

const INITIAL_STATE: RequestFormValues = {
  title: "Rain Relief Coordination Needed",
  description: "We need help coordinating volunteers, distributing supplies, and managing a temporary relief desk for families affected by heavy rains.",
  category: "Disaster Relief",
  urgency: "medium",
  location: "Pune",
  volunteersNeeded: 8,
  fundingAmount: 25000,
  skillsNeeded: "crowd coordination, logistics, first aid",
  deadline: "2026-04-12",
  contactMethod: "Email: relief@demo-ngo.org",
};

interface RequestFormDialogProps {
  onSubmit: (values: RequestFormValues) => Promise<void>;
  triggerLabel?: string;
  title?: string;
}

export function RequestFormDialog({
  onSubmit,
  triggerLabel = "New Request",
  title = "Create NGO Request",
}: RequestFormDialogProps) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [values, setValues] = useState<RequestFormValues>(INITIAL_STATE);

  const update = <K extends keyof RequestFormValues>(key: K, value: RequestFormValues[K]) => {
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
        <Button>{triggerLabel || t("requestForm.triggerLabel")}</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title || t("requestForm.title")}</DialogTitle>
          <DialogDescription>{t("requestForm.description")}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 md:grid-cols-2">
          <Input placeholder={t("requestForm.titleField")} value={values.title} onChange={(e) => update("title", e.target.value)} />
          <Input placeholder={t("requestForm.categoryField")} value={values.category} onChange={(e) => update("category", e.target.value)} />
          <Textarea className="md:col-span-2" placeholder={t("requestForm.descriptionField")} value={values.description} onChange={(e) => update("description", e.target.value)} />

          <Select value={values.urgency} onValueChange={(value: RequestFormValues["urgency"]) => update("urgency", value)}>
            <SelectTrigger>
              <SelectValue placeholder={t("requestForm.urgencyField")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">{t("requestForm.low")}</SelectItem>
              <SelectItem value="medium">{t("requestForm.medium")}</SelectItem>
              <SelectItem value="high">{t("requestForm.high")}</SelectItem>
              <SelectItem value="critical">{t("requestForm.critical")}</SelectItem>
            </SelectContent>
          </Select>

          <Input placeholder={t("requestForm.locationField")} value={values.location} onChange={(e) => update("location", e.target.value)} />
          <Input
            type="number"
            min={1}
            placeholder={t("requestForm.volunteersNeededField")}
            value={values.volunteersNeeded}
            onChange={(e) => update("volunteersNeeded", Number(e.target.value || 1))}
          />
          <Input
            type="number"
            min={0}
            placeholder={t("requestForm.fundingAmountField")}
            value={values.fundingAmount}
            onChange={(e) => update("fundingAmount", Number(e.target.value || 0))}
          />
          <Input placeholder={t("requestForm.skillsNeededField")} value={values.skillsNeeded} onChange={(e) => update("skillsNeeded", e.target.value)} />
          <Input type="date" placeholder={t("requestForm.deadlineField")} value={values.deadline} onChange={(e) => update("deadline", e.target.value)} />
          <Input className="md:col-span-2" placeholder={t("requestForm.contactMethodField")} value={values.contactMethod} onChange={(e) => update("contactMethod", e.target.value)} />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>{t("requestForm.cancel")}</Button>
          <Button onClick={submit} disabled={saving || !values.title || !values.description}>
            {saving ? t("requestForm.saving") : t("requestForm.publish")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
