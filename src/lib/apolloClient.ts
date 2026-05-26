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

const wsLink =
  typeof window !== "undefined" && wsUri
    ? new GraphQLWsLink(
        createClient({
          url: wsUri,
          connectionParams: () => {
            const token = readStoredToken();
            return token ? { Authorization: `Bearer ${token}` } : {};
          },
        }),
      )
    : null;

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

export const cache = new InMemoryCache();

export const apolloClient = new ApolloClient({
  link,
  cache,
});

export async function initApolloCache(): Promise<void> {
  await persistCache({
    cache,
    storage: new LocalStorageWrapper(window.localStorage),
    maxSize: 1_048_576, // 1 MB cap
  });
}
