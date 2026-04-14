/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GRAPHQL_HTTP: string;
  /** Optional WS endpoint for GraphQL subscriptions (realtime updates). */
  readonly VITE_GRAPHQL_WS?: string;
  /** Google OAuth Web Client ID (Sign in with Google). Optional: Google button disabled if unset. */
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  /** "true" = browser-only demo feed/votes */
  readonly VITE_USE_MOCK_FEED?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
