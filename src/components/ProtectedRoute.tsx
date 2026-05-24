import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useQuery } from "@apollo/client";
import { useAuth } from "../context/AuthContext";
import { ME } from "../graphql/profile";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return children;
}

export function AdminRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, user } = useAuth();
  const location = useLocation();
  const { data: meData, loading } = useQuery(ME, {
    skip: !isAuthenticated,
    fetchPolicy: "network-only",
    errorPolicy: "all",
  });

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  // Wait for ME to load before deciding — fall back to stored role
  const role = (meData?.me?.role ?? user?.role)?.toLowerCase();
  if (!loading && role !== "admin") {
    return <Navigate to="/" replace />;
  }

  // While loading, render nothing (avoids flash redirect)
  if (loading && !role) return null;

  return children;
}
