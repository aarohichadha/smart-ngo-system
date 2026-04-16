export const VOLUNTEER_DOMAINS = [
  "Old Age Support",
  "Children Welfare",
  "Disaster Management",
  "Healthcare Outreach",
  "Education Support",
] as const;

export type VolunteerDomain = (typeof VOLUNTEER_DOMAINS)[number];
