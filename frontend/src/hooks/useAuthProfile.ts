import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getMyProfile } from "@/services/impactService";
import type { BaseProfile } from "@/types/impact";
import { getMockSession, isMockAuthEnabled } from "@/lib/mockAuth";

export function useAuthProfile() {
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<BaseProfile | null>(null);

  const toBaseProfile = (value: Partial<BaseProfile> & { id: string }): BaseProfile => ({
    id: value.id,
    email: value.email ?? "",
    full_name: value.full_name ?? null,
    display_name: value.display_name ?? null,
    user_type: value.user_type ?? (value.role as BaseProfile["user_type"]) ?? "individual",
    role: value.role ?? (value.user_type as BaseProfile["role"]) ?? "individual",
    location: value.location ?? null,
    contact_info: value.contact_info ?? null,
    contact_number: value.contact_number ?? null,
    ngo_type: value.ngo_type ?? null,
    verification_status: value.verification_status ?? "unverified",
    created_at: value.created_at ?? new Date().toISOString(),
    updated_at: value.updated_at ?? new Date().toISOString(),
  });

  const refresh = async () => {
    setLoading(true);

    if (isMockAuthEnabled()) {
      const session = getMockSession();
      if (!session) {
        setUserId(null);
        setProfile(null);
        setLoading(false);
        return;
      }

      setUserId(session.id);
      setProfile(toBaseProfile({
        id: session.id,
        email: session.email,
        full_name: session.displayName,
        user_type: session.role,
        role: session.role,
        display_name: session.displayName,
        location: null,
        contact_info: session.email,
        contact_number: null,
        ngo_type: null,
        verification_status: "unverified",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));
      setLoading(false);
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    setUserId(user?.id || null);

    if (!user) {
      setProfile(null);
      setLoading(false);
      return;
    }

    try {
      const myProfile = await getMyProfile();
      setProfile(toBaseProfile(myProfile));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();

    if (isMockAuthEnabled()) {
      const handler = () => refresh();
      window.addEventListener("storage", handler);
      return () => window.removeEventListener("storage", handler);
    }

    const { data } = supabase.auth.onAuthStateChange(() => {
      refresh();
    });

    return () => {
      data.subscription.unsubscribe();
    };
  }, []);

  return {
    loading,
    userId,
    profile,
    refresh,
    isAuthenticated: Boolean(userId),
  };
}
