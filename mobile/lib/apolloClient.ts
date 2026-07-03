import { ApolloClient, InMemoryCache, split } from "@apollo/client";
import { onError } from "@apollo/client/link/error";
import { HttpLink } from "@apollo/client/link/http";
import { setContext } from "@apollo/client/link/context";
import { GraphQLWsLink } from "@apollo/client/link/subscriptions";
import { getMainDefinition } from "@apollo/client/utilities";
import { createClient } from "graphql-ws";
import { getAndroidClientHeaders } from "./androidVersion";
import {
  applyForceUpdateFromApolloNetworkError,
  applyForceUpdateFromGraphqlErrors,
} from "./forceUpdateState";
import { signalAuthExpired } from "./authExpiredState";
import { readStoredToken } from "./authStorage";

const HTTP_URL = process.env.EXPO_PUBLIC_GRAPHQL_HTTP;
if (!HTTP_URL) {
  throw new Error(
    "Missing EXPO_PUBLIC_GRAPHQL_HTTP — add it to mobile/.env",
  );
}
const WS_URL = process.env.EXPO_PUBLIC_GRAPHQL_WS;

const forceUpdateErrorLink = onError(({ graphQLErrors, networkError }) => {
  applyForceUpdateFromGraphqlErrors(graphQLErrors);
  applyForceUpdateFromApolloNetworkError(networkError);

  const isUnauthenticated =
    graphQLErrors?.some((e) => e.extensions?.code === "UNAUTHENTICATED") ||
    (networkError as { statusCode?: number } | null)?.statusCode === 401;

  if (isUnauthenticated) signalAuthExpired();
});

const authLink = setContext(async (_, { headers }) => {
  const token = await readStoredToken();
  return {
    headers: {
      ...headers,
      ...getAndroidClientHeaders(),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  };
});

const httpLink = new HttpLink({ uri: HTTP_URL });

let _wsClient: ReturnType<typeof createClient> | null = null;

const wsLink = WS_URL
  ? new GraphQLWsLink(
      (() => {
        _wsClient = createClient({
          url: WS_URL,
          retryAttempts: Infinity,
          shouldRetry: () => true,
          keepAlive: 30_000,
          connectionParams: async () => {
            const token = await readStoredToken();
            return {
              ...getAndroidClientHeaders(),
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            };
          },
        });
        return _wsClient;
      })(),
    )
  : null;

export function reconnectWs(): void {
  _wsClient?.terminate();
}

export function onWsConnected(cb: () => void): () => void {
  if (!_wsClient) return () => {};
  return _wsClient.on("connected", () => cb());
}

const httpChain = authLink.concat(forceUpdateErrorLink).concat(httpLink);

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

export const apolloClient = new ApolloClient({
  link,
  cache: new InMemoryCache({
    typePolicies: {
      // Several screens poll `worldCupFixtures` (list — floating widget,
      // banner, results list) and `worldCupFixture` (single, on the match
      // detail page) concurrently at different intervals — since both return
      // the same `FixtureGql` type, Apollo's default normalization shares
      // ONE cache entity per fixture id across both queries. Out-of-order
      // network responses (a slower background widget's poll landing after a
      // fresher one) then silently overwrite the match detail page's
      // just-polled score/minute with stale data. Turning off normalization
      // here makes each query's fixture data live independently under its
      // own query result, so a stale list-widget poll can no longer clobber
      // the actively-open detail page.
      FixtureGql: { keyFields: false },
      Query: {
        fields: {
          feedPosts: {
            keyArgs: ["campaignId", "postFilter", "scope", "sort"],
            merge: mergePaginatedList,
          },
          // Profile "My Activity" tabs — same offset-pagination merge pattern.
          // `keyArgs: ["take"]` (not `false`) keeps the paginated take:20
          // sequence in its own bucket, separate from the standalone Keeps
          // tab (take:100) and the legacy Scheduled screen (default take) —
          // otherwise those one-shot/polling fetches overwrite the same
          // shared array mid-pagination and corrupt `hasMore` tracking.
          getPostsByUser: { keyArgs: ["userId"], merge: mergePaginatedList },
          mySavedPosts: { keyArgs: ["take"], merge: mergePaginatedList },
          myScheduledPosts: { keyArgs: ["take"], merge: mergePaginatedList },
          myVotedPosts: { keyArgs: ["anonymousOnly"], merge: mergePaginatedList },
        },
      },
    },
  }),
});
