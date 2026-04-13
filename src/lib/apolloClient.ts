import { ApolloClient, HttpLink, InMemoryCache } from "@apollo/client";

const uri =
  import.meta.env.VITE_GRAPHQL_HTTP ?? "http://localhost:4000/graphql";

export const apolloClient = new ApolloClient({
  link: new HttpLink({ uri, credentials: "include" }),
  cache: new InMemoryCache(),
});
