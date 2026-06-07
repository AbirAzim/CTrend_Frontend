import { ApolloClient, HttpLink, InMemoryCache, split } from "@apollo/client";
import { setContext } from "@apollo/client/link/context";
import { GraphQLWsLink } from "@apollo/client/link/subscriptions";
import { getMainDefinition } from "@apollo/client/utilities";
import { persistCache, LocalStorageWrapper } from "apollo3-cache-persist";
import { createClient } from "graphql-ws";
import { readStoredToken } from "./authStorage";

const uri = import.meta.env.VITE_GRAPHQL_HTTP;
if (!uri) {
  throw new Error(
    "Missing VITE_GRAPHQL_HTTP. Copy .env.example to .env and set your GraphQL URL.",
  );
}

const authLink = setContext((_, { headers }) => {
  const token = readStoredToken();
  return {
    headers: {
      ...headers,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  };
});

const httpLink = new HttpLink({ uri, credentials: "include" });
const wsUri = import.meta.env.VITE_GRAPHQL_WS;

let _wsClient: ReturnType<typeof createClient> | null = null;

const wsLink =
  typeof window !== "undefined" && wsUri
    ? new GraphQLWsLink(
        (() => {
          _wsClient = createClient({
            url: wsUri,
            retryAttempts: Infinity,
            shouldRetry: () => true,
            keepAlive: 10_000, // ping every 10 s — prevents Safari from killing idle WS connections
            connectionParams: () => {
              const token = readStoredToken();
              return token ? { Authorization: `Bearer ${token}` } : {};
            },
          });
          return _wsClient;
        })(),
      )
    : null;

/**
 * Terminates the current WebSocket connection so it reconnects fresh on the
 * next subscription — picking up any new auth token from connectionParams.
 * Call this after login and logout.
 */
export function reconnectWs(): void {
  _wsClient?.terminate();
}

/**
 * Registers a callback that fires every time the WebSocket connection is
 * (re)established. Returns an unsubscribe function.
 */
export function onWsConnected(cb: () => void): () => void {
  if (!_wsClient) return () => {};
  return _wsClient.on("connected", cb);
}

const link = wsLink
  ? split(
      ({ query }) => {
        const def = getMainDefinition(query);
        return (
          def.kind === "OperationDefinition" &&
          def.operation === "subscription"
        );
      },
      wsLink,
      authLink.concat(httpLink),
    )
  : authLink.concat(httpLink);

export const cache = new InMemoryCache({
  typePolicies: {
    Query: {
      fields: {
        // Infinite-scroll feed: one cached list per filter, with pages merged by
        // their `skip` offset. This lets `fetchMore` append the next page and the
        // 20s poll refresh the head in place, instead of each (skip/take) combo
        // becoming a separate list or the poll overwriting the appended pages.
        feedPosts: {
          keyArgs: ["campaignId", "scope", "sort"],
          merge(
            existing: readonly unknown[] = [],
            incoming: readonly unknown[],
            { args }: { args: Record<string, unknown> | null },
          ) {
            const merged = existing.slice();
            const start = typeof args?.skip === "number" ? args.skip : 0;
            for (let i = 0; i < incoming.length; i++) {
              merged[start + i] = incoming[i];
            }
            return merged;
          },
        },
      },
    },
  },
});

export const apolloClient = new ApolloClient({
  link,
  cache,
});

export async function initApolloCache(): Promise<void> {
  await persistCache({
    cache,
    storage: new LocalStorageWrapper(window.localStorage),
    maxSize: 5_242_880, // 5 MB cap — bumped from 1 MB so drops/saved posts don't get evicted
  });
}
