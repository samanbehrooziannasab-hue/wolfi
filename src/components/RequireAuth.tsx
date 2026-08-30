import { useWolfAuth } from "@/hooks/use-wolf-auth";
import { BACKEND } from "@/lib/backend";
import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated, token } = useWolfAuth();
  const location = useLocation();

  // In REST mode login returns a complete authenticated user immediately.
  // Never block the route on a background /me refresh; API authorization still
  // validates the bearer token on every protected request.
  const restSessionReady = BACKEND === "rest" && Boolean(token);

  if (isLoading && !restSessionReady) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </main>
    );
  }

  if (!isAuthenticated && !restSessionReady) {
    const returnTo = `${location.pathname}${location.search}`;
    return (
      <Navigate to={`/auth?returnTo=${encodeURIComponent(returnTo)}`} replace />
    );
  }

  return children;
}
