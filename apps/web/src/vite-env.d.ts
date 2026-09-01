/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL the API is served from (no trailing slash), e.g. "https://api.example.com". Empty = same-origin. */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
