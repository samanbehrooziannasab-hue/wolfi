import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { useWolfAuth } from "@/hooks/use-wolf-auth";
import { LangToggle, useI18n } from "@/lib/i18n";
import logo from "@/assets/logo.svg";
import { ArrowRight, Loader2, LockKeyhole, Moon, Send, Sun, User } from "lucide-react";
import { Suspense, useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";

interface AuthProps {
  redirectAfterAuth?: string;
}

function resolveRedirectAfterAuth(returnTo: string | null, fallback = "/dashboard") {
  if (returnTo?.startsWith("/") && !returnTo.startsWith("//")) {
    return returnTo;
  }
  return fallback;
}

function telegramInitData(): string | null {
  if (typeof window === "undefined") return null;
  const tg = (window as unknown as {
    Telegram?: { WebApp?: { initData?: string } };
  }).Telegram?.WebApp;
  return typeof tg?.initData === "string" && tg.initData ? tg.initData : null;
}

function Auth({ redirectAfterAuth }: AuthProps = {}) {
  const { t } = useI18n();
  const { isLoading: authLoading, isAuthenticated, login, loginTelegram } = useWolfAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = resolveRedirectAfterAuth(searchParams.get("returnTo"), redirectAfterAuth);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      window.location.replace(redirect);
    }
  }, [authLoading, isAuthenticated, redirect]);

  const errorKey = (err: unknown, kind: "password" | "telegram") => {
    const msg = String((err as { message?: string } | undefined)?.message ?? "").trim();
    if (kind === "telegram") return "auth.error.telegram";
    if (msg.includes("غیرفعال") || msg.toLowerCase().includes("disabled")) {
      return "auth.error.disabled";
    }
    // Both backends already return Persian error messages (wrong credentials,
    // brute-force lockout, disabled account…). Show them verbatim instead of
    // hiding the real reason behind a generic translation — the lockout in
    // particular looked exactly like "wrong password" to users.
    if (/[\u0600-\u06FF]/.test(msg) && msg.length <= 200) return msg;
    return "auth.error.credentials";
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!username.trim() || !password) return;
    setIsLoading(true);
    setError(null);
    try {
      // A broken reverse proxy must produce an error, never an endless button
      // spinner. The REST client has its own timeout; this second guard also
      // protects other backend implementations and stale deployed bundles.
      await Promise.race([
        login(username.trim(), password),
        new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error("زمان پاسخ سرور تمام شد. سلامت API و پراکسی را بررسی کنید.")), 15_000)),
      ]);
      setIsLoading(false);
      // Full navigation guarantees the freshly-built REST dashboard shell is
      // loaded. React Router navigation can be swallowed when the previous
      // /dashboard document is still pending in the browser.
      window.location.replace(redirect);
    } catch (err) {
      console.error("Login error:", err);
      setError(t(errorKey(err, "password")));
      setIsLoading(false);
    }
  };

  const handleTelegram = async () => {
    const initData = telegramInitData();
    if (!initData) {
      setError(t("auth.error.telegram"));
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      await Promise.race([
        loginTelegram(initData),
        new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error("زمان پاسخ سرور تمام شد.")), 15_000)),
      ]);
      setIsLoading(false);
      // Full navigation guarantees the freshly-built REST dashboard shell is
      // loaded. React Router navigation can be swallowed when the previous
      // /dashboard document is still pending in the browser.
      window.location.replace(redirect);
    } catch (err) {
      console.error("Telegram login error:", err);
      setError(t(errorKey(err, "telegram")));
      setIsLoading(false);
    }
  };

  const hasTelegram = Boolean(telegramInitData());

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/[0.04] via-transparent to-accent/[0.03]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-background to-transparent" />

      <header className="relative z-10 flex h-16 items-center justify-between px-4 sm:px-8">
        <Link to="/" className="flex items-center gap-2.5">
          <img src={logo} alt="Trading Wolf AI" className="size-8 rounded-md" />
          <span className="text-[15px] font-semibold tracking-tight">Trading Wolf AI</span>
        </Link>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <LangToggle />
        </div>
      </header>

      <div className="relative z-10 flex flex-1 items-center justify-center px-4 pb-16">
        <Card className="w-full max-w-md border-border shadow-xl">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-xl border border-emerald-400/20 bg-emerald-400/10">
              <img src={logo} alt="" className="size-12 rounded-lg" />
            </div>
            <CardTitle className="text-xl tracking-tight">{t("auth.title")}</CardTitle>
            <CardDescription>{t("auth.subtitle")}</CardDescription>
          </CardHeader>

          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4 pb-2">
              <div className="space-y-2">
                <Label htmlFor="username" className="text-xs text-muted-foreground">
                  {t("auth.username")}
                </Label>
                <div className="relative">
                  <User className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="username"
                    name="username"
                    autoComplete="username"
                    placeholder={t("auth.username.ph")}
                    className="ps-9"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    disabled={isLoading}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-xs text-muted-foreground">
                  {t("auth.password")}
                </Label>
                <div className="relative">
                  <LockKeyhole className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    placeholder={t("auth.password.ph")}
                    className="ps-9"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isLoading}
                    required
                  />
                </div>
              </div>

              {error && (
                <p className="text-sm text-[oklch(0.72_0.17_25)]">{error}</p>
              )}

              <Button
                type="submit"
                className="w-full"
                disabled={isLoading || !username.trim() || !password}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="me-2 h-4 w-4 animate-spin" />
                    …
                  </>
                ) : (
                  <>
                    {t("auth.submit")}
                    <ArrowRight className="ms-2 h-4 w-4" />
                  </>
                )}
              </Button>

              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setUsername("wolfadmin");
                    setPassword("Wolf3010!");
                  }}
                  className="text-xs text-muted-foreground transition-colors hover:text-emerald-400"
                >
                  {t("auth.demo.hint") || "استفاده از حساب مدیر: wolfadmin / Wolf3010!"}
                </button>
              </div>
            </CardContent>
          </form>

          <CardContent className="pb-4 pt-1">
            <div className="relative py-2">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border/60" />
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={handleTelegram}
              disabled={isLoading}
            >
              <Send className="me-2 h-4 w-4" />
              {t("auth.telegram")}
            </Button>
            {!hasTelegram && (
              <p className="mt-2 text-center text-[11px] text-muted-foreground">
                {t("auth.telegram.hint")}
              </p>
            )}
          </CardContent>

          <CardFooter className="border-t border-border/60 bg-background/60 py-3.5">
            <p className="flex w-full items-center justify-center gap-1.5 text-xs text-muted-foreground">
              <LockKeyhole className="inline size-3" />
              {t("auth.footer")}
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}

function ThemeToggle() {
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    if (typeof window !== "undefined") {
      return (window.localStorage.getItem("wolf.theme") as "dark" | "light") || "dark";
    }
    return "dark";
  });

  useEffect(() => {
    document.documentElement.classList.toggle("light", theme === "light");
    window.localStorage.setItem("wolf.theme", theme);
  }, [theme]);

  return (
    <button
      type="button"
      onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
      className="inline-flex size-8 items-center justify-center rounded-md border border-border/70 bg-background/40 text-muted-foreground transition-colors hover:border-emerald-400/40 hover:text-emerald-300"
      aria-label="Toggle theme"
    >
      {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}

export default function AuthPage(props: AuthProps) {
  return (
    <Suspense>
      <Auth {...props} />
    </Suspense>
  );
}
