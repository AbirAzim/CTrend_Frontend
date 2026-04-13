import { gql, useQuery } from "@apollo/client";
import { useAuth } from "../context/AuthContext";

const ROOT_HEALTH = gql`
  query RootHealth {
    __typename
  }
`;

export function HomePage() {
  const { user, logout } = useAuth();
  const { loading, error, data } = useQuery(ROOT_HEALTH);
  const graphqlUri = import.meta.env.VITE_GRAPHQL_HTTP;

  return (
    <main className="app">
      <header className="app-header">
        <h1>CTrend</h1>
        <div className="app-header-actions">
          {user && (
            <span className="muted small">
              {user.displayName || user.email}
            </span>
          )}
          <button type="button" className="btn-ghost" onClick={() => logout()}>
            Log out
          </button>
        </div>
      </header>

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
