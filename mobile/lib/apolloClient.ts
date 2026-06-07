import { ApolloClient, InMemoryCache, split } from "@apollo/client";
import { onError } from "@apollo/client/link/error";
import { HttpLink } from "@apollo/client/link/http";
import { setContext } from "@apollo/client/link/context";
import { GraphQLWsLink } from "@apollo/client/link/subscriptions";
import { getMainDefinition } from "@apollo/client/utilities";
import { createClient } from "graphql-ws";
import { getAndroidClientHeaders } from "./androidVersion";
import { setForceUpdateFromGraphqlError } from "./forceUpdateState";
import { readStoredToken } from "./authStorage";

const HTTP_URL = process.env.EXPO_PUBLIC_GRAPHQL_HTTP;
if (!HTTP_URL) {
  throw new Error(
    "Missing EXPO_PUBLIC_GRAPHQL_HTTP — add it to mobile/.env",
  );
}
const WS_URL = process.env.EXPO_PUBLIC_GRAPHQL_WS;

const forceUpdateErrorLink = onError(({ graphQLErrors }) => {
  for (const err of graphQLErrors ?? []) {
    const ext = err.extensions as Record<string, unknown> | undefined;
    if (ext?.code === "ANDROID_UPDATE_REQUIRED") {
      setForceUpdateFromGraphqlError({
        minRequiredVersionCode: parseVersionExt(ext.minAndroidVersionCode),
        title: String(ext.title ?? "Update required"),
        body: String(
          ext.body ??
            "A newer version of Ke Jitbe is available. Please update from Google Play.",
        ),
      });
    }
  }
});

function parseVersionExt(value: unknown): number {
  const n = typeof value === "number" ? value : parseInt(String(value ?? ""), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

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

export const apolloClient = new ApolloClient({
  link,
  cache: new InMemoryCache({
    typePolicies: {
      Query: {
        fields: {
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
  }),
});
