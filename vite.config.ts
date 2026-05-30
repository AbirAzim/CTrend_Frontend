import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const gqlUrl = env.VITE_GRAPHQL_HTTP;

  const proxy =
    gqlUrl != null && gqlUrl !== ""
      ? (() => {
          try {
            const u = new URL(gqlUrl);
            return {
              "/graphql": {
                target: `${u.protocol}//${u.host}`,
                changeOrigin: true,
              },
            };
          } catch {
            return undefined;
          }
        })()
      : undefined;

  return {
    base: "./",
    plugins: [react()],
    server: {
      port: 5173,
      ...(proxy != null ? { proxy } : {}),
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            "vendor-react": ["react", "react-dom", "react-router-dom"],
            "vendor-apollo": ["@apollo/client", "graphql", "graphql-ws"],
          },
        },
      },
    },
  };
});
