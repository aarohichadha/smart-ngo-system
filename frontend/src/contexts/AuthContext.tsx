import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase.js";

export type UserType = "individual" | "ngo" | "sponsor";

interface User {
  id: string;
  email: string;
  userType: UserType;
  name?: string;
}

export interface RegisterInput {
  email: string;
  password: string;
  userType: UserType;
  name?: string;
  location?: string;
  contactNumber?: string;
  ngoType?: string;
  sponsorshipDomains?: string[];
}

interface AuthResult {
  error?: string;
  needsEmailVerification?: boolean;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string, userType: UserType, sponsorshipDomains?: string[]) => Promise<AuthResult>;
  loginWithGoogle: (userType: UserType, sponsorshipDomains?: string[]) => Promise<AuthResult>;
  logout: () => Promise<void>;
  register: (input: RegisterInput) => Promise<AuthResult>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const isSupportedUserType = (value: unknown): value is UserType =>
  value === "individual" || value === "ngo" || value === "sponsor";

const mapToAppUser = (
  authUser: SupabaseUser,
  profile?: { user_type?: UserType | null; role?: UserType | null; full_name?: string | null },
): User => {
  const metadataUserType = authUser.user_metadata?.user_type as UserType | undefined;
  const profileUserType = profile?.user_type ?? profile?.role ?? null;
  const normalizedUserType = isSupportedUserType(profileUserType)
    ? profileUserType
    : isSupportedUserType(metadataUserType)
      ? metadataUserType
      : "individual";

  return {
    id: authUser.id,
    email: authUser.email ?? "",
    userType: normalizedUserType,
    name: profile?.full_name ?? undefined,
  };
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const AUTH_INIT_TIMEOUT_MS = 12000;
  const AUTH_REQUEST_TIMEOUT_MS = 20000;

  const withTimeout = async <T,>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> => {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs),
      ),
    ]);
  };

  const upsertProfile = async (
    authUser: SupabaseUser,
    userType: UserType,
    details: {
      full_name?: string;
      location?: string;
      contact_number?: string;
      ngo_type?: string;
      sponsorship_domains?: string[];
    } = {},
  ) => {
    const payload = {
      id: authUser.id,
      email: authUser.email ?? "",
      user_type: userType,
      role: userType,
      full_name: details.full_name ?? null,
      location: details.location ?? null,
      contact_number: details.contact_number ?? null,
      ngo_type: details.ngo_type ?? null,
      sponsorship_domains: details.sponsorship_domains ?? [],
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase.from("profiles").upsert(payload, { onConflict: "id" });
    if (error) {
      throw new Error(`Failed to save profile: ${error.message}`);
    }
  };

  const upsertRoleSpecificProfile = async (
    authUser: SupabaseUser,
    userType: UserType,
    details: {
      full_name?: string;
      location?: string;
      contact_number?: string;
      ngo_type?: string;
    } = {},
  ) => {
    if (userType === "ngo") {
      const { error } = await supabase.from("ngo_profiles").upsert(
        {
          user_id: authUser.id,
          ngo_name: details.full_name ?? null,
          sector: details.ngo_type ?? null,
          location: details.location ?? null,
          contact_info: details.contact_number ?? authUser.email ?? null,
          email: authUser.email ?? null,
        },
        { onConflict: "user_id" },
      );
      if (error) {
        throw new Error(`Failed to save NGO profile: ${error.message}`);
      }
      return;
    }

    if (userType === "individual") {
      const { error } = await supabase.from("individual_profiles").upsert(
        {
          user_id: authUser.id,
          full_name: details.full_name ?? null,
          location: details.location ?? null,
          contact_info: authUser.email ?? null,
        },
        { onConflict: "user_id" },
      );
      if (error) {
        throw new Error(`Failed to save individual profile: ${error.message}`);
      }
    }
  };

  const getProfile = async (userId: string) => {
    const { data } = await supabase
      .from("profiles")
      .select("user_type, role, full_name")
      .eq("id", userId)
      .maybeSingle();
    return data;
  };

  const trackAuthEvent = async (eventType: "login" | "signup", userId: string, email: string) => {
    await supabase.from("auth_events").insert({
      user_id: userId,
      event_type: eventType,
      email,
      logged_at: new Date().toISOString(),
    });
  };

  useEffect(() => {
    const initialize = async () => {
      try {
        if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY) {
          console.error("Supabase env vars are missing. Check VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.");
          setUser(null);
          return;
        }

        const { data } = await withTimeout(supabase.auth.getSession(), AUTH_INIT_TIMEOUT_MS, "getSession");
        const sessionUser = data.session?.user;

        if (sessionUser) {
          // Set session user immediately so a slow profile query does not block auth initialization.
          setUser(mapToAppUser(sessionUser, { user_type: sessionUser.user_metadata?.user_type }));

          try {
            const profile = await withTimeout(getProfile(sessionUser.id), AUTH_INIT_TIMEOUT_MS, "getProfile");
            setUser(mapToAppUser(sessionUser, profile));
          } catch (profileError) {
            console.warn("Profile fetch timed out during init. Using session metadata.", profileError);
          }
        }
      } catch (error) {
        console.error("Auth initialization failed:", error);
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };

    initialize();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const sessionUser = session?.user;
      if (!sessionUser) {
        setUser(null);
        return;
      }

      setUser(mapToAppUser(sessionUser, { user_type: sessionUser.user_metadata?.user_type }));

      void getProfile(sessionUser.id)
        .then((profile) => {
          // Use fetched profile if available, otherwise use metadata
          const finalProfile = profile || { user_type: sessionUser.user_metadata?.user_type as UserType | null, full_name: null };
          setUser(mapToAppUser(sessionUser, finalProfile));
        })
        .catch((error) => console.error("Auth state sync failed:", error));
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const login = async (email: string, password: string, userType: UserType, sponsorshipDomains?: string[]): Promise<AuthResult> => {
    try {
      const { data, error } = await withTimeout(
        supabase.auth.signInWithPassword({ email, password }),
        AUTH_REQUEST_TIMEOUT_MS,
        "signInWithPassword",
      );
      if (error) return { error: error.message };

      const authUser = data.user;
      if (!authUser) return { error: "Unable to load account session." };

      setUser(mapToAppUser(authUser, { user_type: userType }));

      void Promise.allSettled([
        upsertProfile(authUser, userType, {
          sponsorship_domains: userType === "sponsor" ? (sponsorshipDomains ?? []) : undefined,
        }),
        trackAuthEvent("login", authUser.id, authUser.email ?? email),
        withTimeout(getProfile(authUser.id), AUTH_INIT_TIMEOUT_MS, "getProfile")
          .then((profile) => {
            // Use fetched profile if available, otherwise use the userType parameter
            const finalProfile = profile || { user_type: userType, full_name: null };
            setUser(mapToAppUser(authUser, finalProfile));
          })
          .catch((error) => {
            console.error("Profile sync after login failed:", error);
            // Fallback: use the userType parameter if profile fetch fails
            setUser(mapToAppUser(authUser, { user_type: userType, full_name: null }));
          }),
      ]);

      return {};
    } catch (error) {
      const message = error instanceof Error && error.message.includes("timed out")
        ? "Sign in is taking too long. Please check your connection and Supabase settings."
        : error instanceof Error
          ? error.message
          : "Sign in failed. Please try again.";
      return { error: message };
    }
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  const loginWithGoogle = async (userType: UserType, sponsorshipDomains?: string[]): Promise<AuthResult> => {
    try {
      const auth = getFirebaseAuth();
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });

      const googleResult = await signInWithPopup(auth, provider);
      const googleCredential = GoogleAuthProvider.credentialFromResult(googleResult);
      const idToken = googleCredential?.idToken;

      if (!idToken) {
        return { error: "Google sign-in did not return an ID token. Check Firebase Google provider setup." };
      }

      const { data, error } = await withTimeout(
        supabase.auth.signInWithIdToken({
          provider: "google",
          token: idToken,
        }),
        AUTH_REQUEST_TIMEOUT_MS,
        "signInWithIdToken",
      );

      if (error) return { error: error.message };

      const authUser = data.user;
      if (!authUser) return { error: "Unable to load account session." };

      setUser(mapToAppUser(authUser, { user_type: userType }));

      const fallbackName = googleResult.user.displayName || authUser.user_metadata?.full_name || null;

      void Promise.allSettled([
        upsertProfile(authUser, userType, {
          full_name: fallbackName || undefined,
          sponsorship_domains: userType === "sponsor" ? (sponsorshipDomains ?? []) : undefined,
        }),
        upsertRoleSpecificProfile(authUser, userType, {
          full_name: fallbackName || undefined,
        }),
        trackAuthEvent("login", authUser.id, authUser.email ?? googleResult.user.email ?? ""),
        withTimeout(getProfile(authUser.id), AUTH_INIT_TIMEOUT_MS, "getProfile")
          .then((profile) => {
            const finalProfile = profile || { user_type: userType, full_name: fallbackName };
            setUser(mapToAppUser(authUser, finalProfile));
          })
          .catch(() => {
            setUser(mapToAppUser(authUser, { user_type: userType, full_name: fallbackName }));
          }),
      ]);

      return {};
    } catch (error) {
      const message = error instanceof Error ? error.message : "Google sign in failed. Please try again.";
      return { error: message };
    }
  };

  const register = async (input: RegisterInput): Promise<AuthResult> => {
    const { email, password, userType, name, location, contactNumber, ngoType, sponsorshipDomains } = input;
    try {
      const { data, error } = await withTimeout(
        supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              user_type: userType,
              role: userType,
              full_name: name ?? null,
              display_name: name ?? null,
              displayName: name ?? null,
            },
          },
        }),
        AUTH_REQUEST_TIMEOUT_MS,
        "signUp",
      );

      if (error) return { error: error.message };
      if (!data.user) return { error: "Account created, but user details are unavailable." };

      await upsertProfile(data.user, userType, {
        full_name: name,
        location,
        contact_number: contactNumber,
        ngo_type: ngoType,
        sponsorship_domains: userType === "sponsor" ? (sponsorshipDomains ?? []) : undefined,
      });

      await upsertRoleSpecificProfile(data.user, userType, {
        full_name: name,
        location,
        contact_number: contactNumber,
        ngo_type: ngoType,
      });

      if (data.session) {
        const profile = await getProfile(data.user.id);
        setUser(mapToAppUser(data.user, profile));
        await trackAuthEvent("signup", data.user.id, data.user.email ?? email);
        return {};
      }

      return { needsEmailVerification: true };
    } catch (error) {
      const message = error instanceof Error && error.message.includes("timed out")
        ? "Sign up is taking too long. Please check your connection and Supabase settings."
        : error instanceof Error
          ? error.message
          : "Sign up failed. Please try again.";
      return { error: message };
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        loginWithGoogle,
        logout,
        register,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
