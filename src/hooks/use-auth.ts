import { api } from "@/convex/_generated/api";
import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth, useQuery } from "convex/react";
import { BACKEND } from "@/lib/backend";
import { useWolfAuth } from "@/hooks/use-wolf-auth";

/**
 * Legacy auth seam used by LogoDropdown.
 *
 * The REST (self-hosted) build has no Convex runtime at all — calling
 * useConvexAuth there throws "could not find Convex client" and crashes any
 * page that renders the dropdown. Build-time constant branch: each deployment
 * runs exactly one of these two implementations, so hook order is stable.
 */
export function useAuth() {
  // eslint-disable-next-line react-hooks/rules-of-hooks -- BACKEND is a build-time constant
  return BACKEND === "rest" ? useRestAuth() : useConvexImpl();
}

function useRestAuth() {
  const wolf = useWolfAuth();
  return {
    isLoading: false,
    isAuthenticated: wolf.isAuthenticated,
    user: wolf.user as any,
    signIn: async () => window.location.assign("/auth"),
    signOut: () => void wolf.logout(),
  };
}

function useConvexImpl() {
  const { isLoading: isAuthLoading, isAuthenticated } = useConvexAuth();
  const user = useQuery(api.users.currentUser);
  const { signIn, signOut } = useAuthActions();

  const isLoading = isAuthLoading || user === undefined;

  return {
    isLoading,
    isAuthenticated,
    user,
    signIn,
    signOut,
  };
}
