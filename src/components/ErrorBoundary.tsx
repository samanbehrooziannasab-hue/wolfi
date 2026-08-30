import { Component, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-background p-6 text-center">
          <AlertTriangle className="mb-4 size-12 text-amber-400" />
          <h2 className="mb-2 text-xl font-bold">مشکلی پیش آمد</h2>
          <p className="mb-4 max-w-md text-sm text-muted-foreground">
            {this.state.error?.message ?? "خطای ناشناخته"}
          </p>
          <p className="mb-6 max-w-lg whitespace-pre-wrap text-xs text-muted-foreground/60">
            {this.state.error?.stack?.slice(0, 500)}
          </p>
          <button
            onClick={() => {
              localStorage.removeItem("wolf.token");
              localStorage.removeItem("wolf.expiresAt");
              window.location.href = "/auth";
            }}
            className="inline-flex items-center gap-2 rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-4 py-2 text-sm font-semibold text-emerald-300 hover:bg-emerald-400/20"
          >
            <RefreshCw className="size-4" />
            ورود مجدد
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
