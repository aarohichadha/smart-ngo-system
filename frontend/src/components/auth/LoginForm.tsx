import type { UserType } from "@/contexts/AuthContext";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";

type LoginFormValues = {
  email: string;
  password: string;
  sponsorshipDomains: string[];
};

interface LoginFormProps {
  userType: UserType;
  onSuccess: () => void;
}

export default function LoginForm({ userType, onSuccess }: LoginFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const { t } = useLanguage();

  const SPONSORSHIP_DOMAINS = [
    "Education",
    "Healthcare",
    "Food & Nutrition",
    "Water & Sanitation",
    "Women Empowerment",
    "Livelihood",
    "Disaster Relief",
    "Environment",
  ];

  const loginSchema = z.object({
    email: z.string().email(t("auth.loginFailed")),
    password: z.string().min(6, t("auth.loginFailed")),
    sponsorshipDomains: z.array(z.string()).default([]),
  }).superRefine((value, ctx) => {
    if (userType === "sponsor" && value.sponsorshipDomains.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Please select at least one sponsorship domain",
        path: ["sponsorshipDomains"],
      });
    }
  });

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
      sponsorshipDomains: [],
    },
  });

  const onSubmit = async (values: LoginFormValues) => {
    try {
      setIsLoading(true);

      const result = await login(values.email, values.password, userType, values.sponsorshipDomains);
      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success(t("auth.welcomeBack"));
      onSuccess();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("auth.loginFailed"));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("auth.email")}</FormLabel>
              <FormControl>
                <Input
                  type="email"
                  placeholder={t("auth.emailPlaceholder")}
                  {...field}
                  disabled={isLoading}
                  className="bg-background"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("auth.password")}</FormLabel>
              <FormControl>
                <Input
                  type="password"
                  placeholder={t("auth.passwordPlaceholder")}
                  {...field}
                  disabled={isLoading}
                  className="bg-background"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {userType === "sponsor" ? (
          <FormField
            control={form.control}
            name="sponsorshipDomains"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Domains of sponsorship</FormLabel>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 rounded-md border p-3">
                  {SPONSORSHIP_DOMAINS.map((domain) => {
                    const checked = field.value.includes(domain);
                    return (
                      <label key={domain} className="flex items-center gap-2 text-sm cursor-pointer">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(nextChecked) => {
                            if (nextChecked) {
                              field.onChange([...field.value, domain]);
                              return;
                            }
                            field.onChange(field.value.filter((value) => value !== domain));
                          }}
                          disabled={isLoading}
                        />
                        <span>{domain}</span>
                      </label>
                    );
                  })}
                </div>
                <FormMessage />
              </FormItem>
            )}
          />
        ) : null}

        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              {t("auth.signingIn")}
            </>
          ) : (
            t("auth.signIn")
          )}
        </Button>
      </form>
    </Form>
  );
}
