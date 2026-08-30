import "@vly-ai/integrations";
import { Toaster } from "@/components/ui/sonner";
import { RequireAuth } from "@/components/RequireAuth";
import { VlyToolbar } from "../vly-toolbar-readonly.tsx";
import { InstrumentationProvider } from "@/instrumentation.tsx";
import { LanguageProvider } from "@/lib/i18n";
import { WolfAuthProvider } from "@/hooks/use-wolf-auth";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import { BACKEND } from "@/lib/backend";
import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes, useLocation } from "react-router";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import Landing from "./pages/Landing";
import AuthPage from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import NotFound from "./pages/NotFound";
import "./index.css";
import "./types/global.d.ts";

function resolveConvexUrl(): string {
  const envUrl = (import.meta.env.VITE_CONVEX_URL as string | undefined)?.trim();
  // Real (remote) deployment URLs are used as-is.
  if (envUrl && !/^https?:\/\/(127\.0\.0\.1|localhost)/.test(envUrl)) {
    return envUrl;
  }
  // Freebuff preview: `convex dev` writes VITE_CONVEX_URL as
  // http://127.0.0.1:3210, which the browser cannot reach directly.
  if (typeof window !== "undefined") {
    const previewHost = window.location.hostname.match(/^\d+-(.+)$/);
    if (previewHost) {
      return `https://3210-${previewHost[1]}`;
    }
    // In cloud / sandbox environments, route via Vite reverse proxy on port 3000
    if (window.location.origin) {
      return window.location.origin;
    }
  }
  return envUrl ?? "http://127.0.0.1:3000";
}

// Only instantiated/used when VITE_BACKEND=convex (the default). In
// VITE_BACKEND=rest builds this client stays unused — no Convex at all.
const convex = BACKEND === "convex" ? new ConvexReactClient(resolveConvexUrl()) : null;

function RouteSyncer() {
  const location = useLocation();
  useEffect(() => {
    window.parent.postMessage(
      { type: "iframe-route-change", path: location.pathname },
      "*",
    );
  }, [location.pathname]);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.data?.type === "navigate") {
        if (event.data.direction === "back") window.history.back();
        if (event.data.direction === "forward") window.history.forward();
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  return null;
}

function AppRoutes() {
  return (
    <BrowserRouter>
      <RouteSyncer />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route
          path="/auth"
          element={<AuthPage redirectAfterAuth="/dashboard" />}
        />
        {/* The SAME full preview dashboard runs on both backends; in REST
            builds its data calls resolve through src/lib/restApi.ts. */}
        <Route
          path="/dashboard"
          element={
            <RequireAuth>
              <Dashboard />
            </RequireAuth>
          }
        />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}

// The Vly inspector is intentionally disabled for the application runtime.
// It installs a full-screen pointer-events overlay and is not part of the product.
const isVlyDevelopment = false;

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
  <StrictMode>
    {isVlyDevelopment && <VlyToolbar />}
    <InstrumentationProvider>
      <LanguageProvider>
        {convex ? (
          <ConvexAuthProvider client={convex}>
            <WolfAuthProvider>
              <AppRoutes />
              <Toaster />
            </WolfAuthProvider>
          </ConvexAuthProvider>
        ) : (
          <WolfAuthProvider>
            <AppRoutes />
            <Toaster />
          </WolfAuthProvider>
        )}
      </LanguageProvider>
    </InstrumentationProvider>
  </StrictMode>
  </ErrorBoundary>,
);
