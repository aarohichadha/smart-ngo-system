import { useLanguage } from "@/contexts/LanguageContext";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function LanguageSwitcher() {
  const { language, setLanguage, t } = useLanguage();

  return (
    <Select value={language} onValueChange={(value) => setLanguage(value as "en" | "hi")}>
      <SelectTrigger className="w-[120px]">
        <SelectValue placeholder={t("common.english")} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="en">{t("common.english")}</SelectItem>
        <SelectItem value="hi">{t("common.hindi")}</SelectItem>
      </SelectContent>
    </Select>
  );
}
