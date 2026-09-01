export interface ApiErrorDetails {
  endpoint: string;
  statusCode: number;
  responseData?: any;
  method?: string;
  error?: Error | string | null;
  timestamp?: string;
}

/**
 * Centralized logger for failed API requests across fetch wrappers.
 * Captures endpoint, HTTP status code, response payload, method, and timestamp.
 */
export function logApiError(details: ApiErrorDetails): void {
  const {
    endpoint,
    statusCode,
    responseData,
    method = "GET",
    error = null,
    timestamp = new Date().toISOString(),
  } = details;

  const statusText = statusCode === 0 ? "Network/Timeout Error (0)" : `HTTP ${statusCode}`;
  const logHeader = `[API Error] ${method} ${endpoint} | Status Code: ${statusCode} (${statusText})`;

  console.error(logHeader, {
    endpoint,
    method,
    statusCode,
    responseData,
    error: error instanceof Error ? error.message : error,
    timestamp,
  });

  // Persist last 50 error entries in sessionStorage for in-browser diagnostic panels
  try {
    if (typeof window !== "undefined") {
      const historyKey = "wolf.api_error_logs";
      const existing = JSON.parse(window.sessionStorage.getItem(historyKey) || "[]");
      const updated = [
        {
          endpoint,
          method,
          statusCode,
          responseData,
          error: error instanceof Error ? error.message : String(error ?? ""),
          timestamp,
        },
        ...existing.slice(0, 49),
      ];
      window.sessionStorage.setItem(historyKey, JSON.stringify(updated));
    }
  } catch {
    /* ignore session storage errors */
  }
}
