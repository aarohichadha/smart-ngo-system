import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CommunityFilter } from "@/types/impact";
import { useLanguage } from "@/contexts/LanguageContext";

interface PostFiltersProps {
  value: CommunityFilter;
  onChange: (next: CommunityFilter) => void;
}

export function PostFilters({ value, onChange }: PostFiltersProps) {
  const { t } = useLanguage();

  return (
    <div className="grid gap-3 md:grid-cols-5">
      <Input
        placeholder={t("community.searchPlaceholder")}
        value={value.query}
        onChange={(e) => onChange({ ...value, query: e.target.value })}
      />

      <Select value={value.feedType} onValueChange={(feedType: CommunityFilter["feedType"]) => onChange({ ...value, feedType })}>
        <SelectTrigger>
          <SelectValue placeholder={t("community.feedType")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t("community.allPosts")}</SelectItem>
          <SelectItem value="ngo_request">{t("community.ngoRequests")}</SelectItem>
          <SelectItem value="volunteer_offer">{t("community.volunteerOffers")}</SelectItem>
        </SelectContent>
      </Select>

      <Input
        placeholder={t("community.category")}
        value={value.category}
        onChange={(e) => onChange({ ...value, category: e.target.value })}
      />

      <Input
        placeholder={t("community.location")}
        value={value.location}
        onChange={(e) => onChange({ ...value, location: e.target.value })}
      />

      <Select value={value.urgency} onValueChange={(urgency) => onChange({ ...value, urgency })}>
        <SelectTrigger>
          <SelectValue placeholder={t("community.urgency")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t("community.allUrgency")}</SelectItem>
          <SelectItem value="low">{t("community.low")}</SelectItem>
          <SelectItem value="medium">{t("community.medium")}</SelectItem>
          <SelectItem value="high">{t("community.high")}</SelectItem>
          <SelectItem value="critical">{t("community.critical")}</SelectItem>
          <SelectItem value="normal">{t("community.normal")}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
