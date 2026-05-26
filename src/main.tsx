import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { ApolloProvider } from "@apollo/client";
import { BrowserRouter } from "react-router-dom";
import { apolloClient, initApolloCache } from "./lib/apolloClient";
import { AuthProvider } from "./context/AuthContext";
import App from "./App";
import "./index.css";

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "";

const shell = (
  <BrowserRouter>
    <ApolloProvider client={apolloClient}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ApolloProvider>
  </BrowserRouter>
);

async function bootstrap() {
  await initApolloCache();
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      {googleClientId ? (
        <GoogleOAuthProvider clientId={googleClientId}>
          {shell}
        </GoogleOAuthProvider>
      ) : (
        shell
      )}
    </StrictMode>,
  );
}

void bootstrap();
