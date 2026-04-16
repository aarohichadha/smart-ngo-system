import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";

// Individual Registration Schema
const individualRegisterSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  location: z.string().min(2, "Location is required"),
  contactNumber: z.string().regex(/^\d{10}$/, "Contact number must be 10 digits"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

// NGO Registration Schema
const ngoRegisterSchema = z.object({
  ngoName: z.string().min(3, "NGO name must be at least 3 characters"),
  location: z.string().min(2, "Location is required"),
  contactNumber: z.string().regex(/^\d{10}$/, "Contact number must be 10 digits"),
  ngoType: z.string().min(1, "Please select NGO type"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

// Sponsor Registration Schema
const sponsorRegisterSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  location: z.string().min(2, "Location is required"),
  contactNumber: z.string().regex(/^\d{10}$/, "Contact number must be 10 digits"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  sponsorshipDomains: z.array(z.string()).min(1, "Please select at least one sponsorship domain"),
});

type IndividualFormValues = z.infer<typeof individualRegisterSchema>;
type NGOFormValues = z.infer<typeof ngoRegisterSchema>;
type SponsorFormValues = z.infer<typeof sponsorRegisterSchema>;
type FormValues = IndividualFormValues | NGOFormValues | SponsorFormValues;

interface RegisterFormProps {
  userType: "individual" | "ngo" | "sponsor";
  onSuccess: () => void;
}

const NGO_TYPES = [
  { label: "Healthcare", value: "healthcare" },
  { label: "Education", value: "education" },
  { label: "Food & Nutrition", value: "food" },
  { label: "Water & Sanitation", value: "water" },
  { label: "Shelter & Housing", value: "shelter" },
  { label: "Disaster Relief", value: "disaster" },
  { label: "Community Development", value: "community" },
  { label: "Other", value: "other" },
];

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

export default function RegisterForm({ userType, onSuccess }: RegisterFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const { register } = useAuth();
  const { t } = useLanguage();

  const schema = userType === "ngo"
    ? ngoRegisterSchema
    : userType === "sponsor"
      ? sponsorRegisterSchema
      : individualRegisterSchema;
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: userType === "ngo"
      ? {
          ngoName: "",
          location: "",
          contactNumber: "",
          ngoType: "",
          email: "",
          password: "",
        }
      : userType === "sponsor"
        ? {
            name: "",
            location: "",
            contactNumber: "",
            email: "",
            password: "",
            sponsorshipDomains: [],
          }
        : {
            name: "",
            location: "",
            contactNumber: "",
            email: "",
            password: "",
          },
  });

  useEffect(() => {
    form.reset(
      userType === "ngo"
        ? {
            ngoName: "",
            location: "",
            contactNumber: "",
            ngoType: "",
            email: "",
            password: "",
          }
        : userType === "sponsor"
          ? {
              name: "",
              location: "",
              contactNumber: "",
              email: "",
              password: "",
              sponsorshipDomains: [],
            }
        : {
            name: "",
            location: "",
            contactNumber: "",
            email: "",
            password: "",
          },
    );
  }, [userType, form]);

  const onSubmit = async (values: FormValues) => {
    try {
      setIsLoading(true);

      const displayName = userType === "ngo"
        ? (values as NGOFormValues).ngoName
        : (values as IndividualFormValues | SponsorFormValues).name;

      const result = await register({
        email: values.email,
        password: values.password,
        userType,
        name: userType === "ngo"
          ? (values as NGOFormValues).ngoName
          : (values as IndividualFormValues | SponsorFormValues).name,
        location: values.location,
        contactNumber: userType === "ngo"
          ? (values as NGOFormValues).contactNumber
          : (values as IndividualFormValues | SponsorFormValues).contactNumber,
        ngoType: userType === "ngo" ? (values as NGOFormValues).ngoType : undefined,
        sponsorshipDomains: userType === "sponsor" ? (values as SponsorFormValues).sponsorshipDomains : undefined,
      });

      if (result.error) {
        toast.error(result.error);
        return;
      }

      if (result.needsEmailVerification) {
        toast.success(t("auth.accountCreatedNeedsVerification"));
        onSuccess();
        return;
      }

      toast.success(t("auth.welcomeUser", { name: displayName }) + ` ${t("auth.accountCreated")}`);
      onSuccess();
    } catch (error) {
      toast.error(t("auth.registrationFailed"));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
        {userType !== "ngo" ? (
          <>
            {/* Individual/Sponsor Form */}
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Full Name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="John Doe"
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
              name="location"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Location</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="City, State"
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
              name="contactNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Contact Number</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="9876543210"
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
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="john@example.com"
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
                  <FormLabel>Password</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      placeholder="••••••••"
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
                        const checked = field.value?.includes(domain);
                        return (
                          <label key={domain} className="flex items-center gap-2 text-sm cursor-pointer">
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(nextChecked) => {
                                const current = field.value || [];
                                if (nextChecked) {
                                  field.onChange([...current, domain]);
                                  return;
                                }
                                field.onChange(current.filter((value) => value !== domain));
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
          </>
        ) : (
          <>
            {/* NGO Form */}
            <FormField
              control={form.control}
              name="ngoName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>NGO Name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Organization Name"
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
              name="location"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Location</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="City, State"
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
              name="contactNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("auth.contactNumber")}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="9876543210"
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
              name="ngoType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Type of NGO</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value} disabled={isLoading}>
                    <FormControl>
                      <SelectTrigger className="bg-background">
                        <SelectValue placeholder="Select NGO type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {NGO_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="contact@ngo.com"
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
                  <FormLabel>Password</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      placeholder="••••••••"
                      {...field}
                      disabled={isLoading}
                      className="bg-background"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </>
        )}

        <Button type="submit" className="w-full pt-2" disabled={isLoading}>
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              {t("auth.createAccount")}
            </>
          ) : (
            t("auth.createAccount")
          )}
        </Button>
      </form>
    </Form>
  );
}
