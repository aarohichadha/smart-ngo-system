import type { UserRole } from "@/types/impact";
import type { VolunteerDomain } from "@/lib/volunteerDomains";
import { VOLUNTEER_DOMAINS } from "@/lib/volunteerDomains";

const MOCK_AUTH_STORAGE_KEY = "sahayak.mock.session";

export interface MockSession {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  user_type: UserRole;
  volunteeringDomain: VolunteerDomain;
  availableForNgo: boolean;
}

export function isMockAuthEnabled() {
  return false;
}

export function getMockSession(): MockSession | null {
  const raw = localStorage.getItem(MOCK_AUTH_STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<MockSession>;
    if (!parsed.id || !parsed.email || !parsed.displayName || !parsed.role) return null;

    return {
      id: parsed.id,
      email: parsed.email,
      displayName: parsed.displayName,
      role: parsed.role,
      user_type: parsed.user_type || parsed.role,
      volunteeringDomain: parsed.volunteeringDomain || VOLUNTEER_DOMAINS[0],
      availableForNgo: parsed.availableForNgo ?? false,
    };
  } catch {
    return null;
  }
}

export function setMockSession(payload: {
  email: string;
  displayName?: string;
  role: UserRole;
  volunteeringDomain: VolunteerDomain;
  availableForNgo?: boolean;
}) {
  const existing = getMockSession();

  const session: MockSession = {
    id: existing?.id || crypto.randomUUID(),
    email: payload.email,
    displayName: payload.displayName || existing?.displayName || payload.email.split("@")[0] || "User",
    role: payload.role,
    user_type: payload.role,
    volunteeringDomain: payload.volunteeringDomain,
    availableForNgo: payload.availableForNgo ?? existing?.availableForNgo ?? false,
  };

  localStorage.setItem(MOCK_AUTH_STORAGE_KEY, JSON.stringify(session));
  return session;
}

export function clearMockSession() {
  localStorage.removeItem(MOCK_AUTH_STORAGE_KEY);
}

export function setMockAvailability(availableForNgo: boolean) {
  const session = getMockSession();
  if (!session) return null;

  const next: MockSession = {
    ...session,
    availableForNgo,
  };

  localStorage.setItem(MOCK_AUTH_STORAGE_KEY, JSON.stringify(next));
  return next;
}
