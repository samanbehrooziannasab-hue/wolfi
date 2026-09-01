import { Component, type ReactNode, type ErrorInfo } from "react";
import { AlertTriangle, RefreshCw, RotateCcw, ChevronDown, Terminal } from "lucide-react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  componentStack: string | null;
  showDetails: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = {
    hasError: false,
    error: null,
    componentStack: null,
    showDetails: false,
  };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const stackTrace = info?.componentStack ?? error.stack ?? "";
    console.error("[ErrorBoundary] Unhandled UI Error Caught:", error);
    console.error("[ErrorBoundary] Component Stack Trace:\n", stackTrace);

    this.setState({
      error,
      componentStack: stackTrace,
    });
  }

  handleResetApp = () => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch (e) {
      console.error("[ErrorBoundary] Failed to clear storage:", e);
    }
    window.location.href = "/";
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      const errorMessage = this.state.error?.message || "خطای نامشخص در اجرای برنامه";
      const stack = this.state.componentStack || this.state.error?.stack || "";

      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-background p-6 text-center">
          <div className="mx-auto flex max-w-lg flex-col items-center rounded-xl border border-border/70 bg-card p-6 shadow-xl">
            <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-amber-500/10 text-amber-400">
              <AlertTriangle className="size-7" />
            </div>

            <h2 className="mb-2 text-xl font-bold tracking-tight text-foreground">
              برنامه با خطا مواجه شد
            </h2>

            <p className="mb-4 text-xs text-muted-foreground">
              یک خطای غیرمنتظره در رابط کاربری رخ داد. جزئیات خطا و Component Stack Trace در کنسول مرورگر ثبت شد.
            </p>

            <div className="mb-4 w-full rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-start text-xs font-mono text-red-300 break-words" dir="ltr">
              {errorMessage}
            </div>

            {stack && (
              <div className="mb-5 w-full text-start">
                <button
                  type="button"
                  onClick={() => this.setState((prev) => ({ showDetails: !prev.showDetails }))}
                  className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Terminal className="size-3.5" />
                  <span>{this.state.showDetails ? "پنهان‌سازی ردپای کامپوننت" : "مشاهده ردپای کامپوننت (Component Stack)"}</span>
                  <ChevronDown className={`size-3.5 transform transition-transform ${this.state.showDetails ? "rotate-180" : ""}`} />
                </button>

                {this.state.showDetails && (
                  <pre className="mt-2 max-h-48 overflow-y-auto rounded border border-border/50 bg-neutral-950 p-2.5 text-[10px] font-mono text-neutral-300 leading-relaxed whitespace-pre-wrap" dir="ltr">
                    {stack}
                  </pre>
                )}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-center gap-3 w-full">
              <button
                type="button"
                onClick={this.handleReload}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-muted px-4 py-2 text-xs font-semibold text-foreground hover:bg-muted/80 transition-colors flex-1"
              >
                <RefreshCw className="size-3.5" />
                تلاش مجدد
              </button>

              <button
                type="button"
                onClick={this.handleResetApp}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/15 px-4 py-2 text-xs font-semibold text-amber-300 hover:bg-amber-500/25 transition-colors flex-1"
                title="پاکسازی تمام حافظه محلی و بازراه‌اندازی برنامه"
              >
                <RotateCcw className="size-3.5" />
                Reset Application
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

