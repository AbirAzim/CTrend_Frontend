import { gql, useQuery } from "@apollo/client";

const ROOT_HEALTH = gql`
  query RootHealth {
    __typename
  }
`;

const graphqlUri =
  import.meta.env.VITE_GRAPHQL_HTTP ?? "http://localhost:4000/graphql";

export default function App() {
  const { loading, error, data } = useQuery(ROOT_HEALTH);

  return (
    <main className="app">
      <h1>CTrend</h1>
      <p className="muted">
        GraphQL endpoint: <code>{graphqlUri}</code>
      </p>
      {loading && <p>Connecting…</p>}
      {error && (
        <p className="error" role="alert">
          {error.message}
        </p>
      )}
      {data != null && (
        <pre className="panel">{JSON.stringify(data, null, 2)}</pre>
      )}
    </main>
  );
}
