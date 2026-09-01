const DEFAULT_DEV_ORIGIN = "http://localhost:5173";

/**
 * Resolves the list of origins allowed to call this API from `CORS_ORIGIN`
 * (comma-separated, e.g. "https://app.example.com,https://staging.example.com").
 * Falls back to the local Vite dev server origin when unset, so local
 * development works out of the box without allowing every origin.
 *
 * There is no hard-coded production URL here on purpose — it doesn't exist
 * yet. Phase 6 (Render deployment) sets CORS_ORIGIN to the deployed web
 * app's real origin; nothing in this file needs to change for that.
 */
export function resolveCorsOrigins(rawOrigins: string | undefined): string[] {
  if (!rawOrigins || !rawOrigins.trim()) {
    return [DEFAULT_DEV_ORIGIN];
  }
  return rawOrigins
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}
