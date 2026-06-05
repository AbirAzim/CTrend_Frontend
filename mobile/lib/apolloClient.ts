import { ApolloClient, InMemoryCache, split } from "@apollo/client";
import { HttpLink } from "@apollo/client/link/http";
import { setContext } from "@apollo/client/link/context";
import { GraphQLWsLink } from "@apollo/client/link/subscriptions";
import { getMainDefinition } from "@apollo/client/utilities";
import { createClient } from "graphql-ws";
import { readStoredToken } from "./authStorage";

const HTTP_URL = process.env.EXPO_PUBLIC_GRAPHQL_HTTP;
if (!HTTP_URL) {
  throw new Error(
    "Missing EXPO_PUBLIC_GRAPHQL_HTTP — add it to mobile/.env",
  );
}
const WS_URL = process.env.EXPO_PUBLIC_GRAPHQL_WS;

// AsyncStorage reads are async — setContext supports async functions
const authLink = setContext(async (_, { headers }) => {
  const token = await readStoredToken();
  return {
    headers: {
      ...headers,
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
            return token ? { Authorization: `Bearer ${token}` } : {};
          },
        });
        return _wsClient;
      })(),
    )
  : null;

export function reconnectWs(): void {
  _wsClient?.terminate();
}

/**
 * Subscribe to graphql-ws (re)connection. Fires every time the socket becomes
 * connected — used to recover notifications missed while the socket was down
 * (the in-process PubSub has no replay). Returns an unsubscribe function.
 */
export function onWsConnected(cb: () => void): () => void {
  if (!_wsClient) return () => {};
  return _wsClient.on("connected", () => cb());
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

export const apolloClient = new ApolloClient({
  link,
  cache: new InMemoryCache(),
});
