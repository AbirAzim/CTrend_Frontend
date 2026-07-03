import { ApolloClient, HttpLink, InMemoryCache, split } from "@apollo/client";
import { onError } from "@apollo/client/link/error";
import { setContext } from "@apollo/client/link/context";
import { GraphQLWsLink } from "@apollo/client/link/subscriptions";
import { getMainDefinition } from "@apollo/client/utilities";
import { persistCache, LocalStorageWrapper } from "apollo3-cache-persist";
import { createClient } from "graphql-ws";
import { readStoredToken } from "./authStorage";
import { signalAuthExpired } from "./authExpiredState";

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

const authErrorLink = onError(({ graphQLErrors, networkError }) => {
  const isUnauthenticated =
    graphQLErrors?.some((e) => e.extensions?.code === "UNAUTHENTICATED") ||
    (networkError as { statusCode?: number } | null)?.statusCode === 401;
  if (isUnauthenticated) signalAuthExpired();
});

const httpChain = authErrorLink.concat(authLink).concat(httpLink);

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
      httpChain,
    )
  : httpChain;

/** Shared by every offset-paginated (`skip`/`take`) list field below — appends
 * the incoming page at its `skip` offset instead of replacing the whole list. */
function mergePaginatedList(
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
}

export const cache = new InMemoryCache({
  typePolicies: {
    // Several screens poll `worldCupFixtures` (list) and `worldCupFixture`
    // (single, on the match detail page) concurrently at different
    // intervals — since both return the same `FixtureGql` type, Apollo's
    // default normalization shares ONE cache entity per fixture id across
    // both queries. Out-of-order network responses (a slower background
    // widget's poll landing after a fresher one) then silently overwrite the
    // match detail page's just-polled score/minute with stale data. Turning
    // off normalization here makes each query's fixture data live
    // independently under its own query result, so a stale list-widget poll
    // can no longer clobber the actively-open detail page.
    FixtureGql: { keyFields: false },
    Query: {
      fields: {
        // Infinite-scroll feed: one cached list per filter, with pages merged by
        // their `skip` offset. This lets `fetchMore` append the next page and the
        // 20s poll refresh the head in place, instead of each (skip/take) combo
        // becoming a separate list or the poll overwriting the appended pages.
        feedPosts: {
          keyArgs: ["campaignId", "postFilter", "scope", "sort"],
          merge: mergePaginatedList,
        },
        // Profile "My Activity" tabs — same offset-pagination merge pattern.
        // `keyArgs: ["take"]` (not `false`) keeps the paginated take:20
        // sequence in its own bucket, separate from the legacy standalone
        // /profile/scheduled page (its own default-take, polling fetch) —
        // otherwise that fetch overwrites the same shared array mid-
        // pagination and corrupts `hasMore` tracking.
        getPostsByUser: { keyArgs: ["userId"], merge: mergePaginatedList },
        mySavedPosts: { keyArgs: ["take"], merge: mergePaginatedList },
        myScheduledPosts: { keyArgs: ["take"], merge: mergePaginatedList },
        myVotedPosts: { keyArgs: ["anonymousOnly"], merge: mergePaginatedList },
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

  // The infinite-scroll `feedPosts` list grows unbounded as pages are appended.
  // When the persisted cache nears `maxSize`, apollo3-cache-persist evicts
  // individual normalized `PostGql` objects while the `feedPosts` field keeps its
  // (now dangling) references. Apollo silently drops dangling refs on read, so a
  // long persisted list reads back as only a handful of posts — and pagination
  // stalls because the stored offset no longer matches the visible count.
  //
  // The feed is live data and is always re-fetched on mount (cache-and-network),
  // so there's nothing to gain from restoring its accumulated pages. Evict the
  // field on startup so every session begins from a clean page 1.
  cache.evict({ id: "ROOT_QUERY", fieldName: "feedPosts" });
  cache.gc();
}
