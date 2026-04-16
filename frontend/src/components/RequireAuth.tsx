import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuthProfile } from "@/hooks/useAuthProfile";

interface RequireAuthProps {
  children: ReactNode;
}

export function RequireAuth({ children }: RequireAuthProps) {
  const { loading, isAuthenticated } = useAuthProfile();
  const location = useLocation();

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">Checking session...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/auth" state={{ from: location.pathname }} replace />;
  }

  return <>{children}</>;
}
