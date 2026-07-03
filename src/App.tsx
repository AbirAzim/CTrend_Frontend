import { useEffect } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import { onAuthExpired, clearAuthExpired } from "./lib/authExpiredState";
import { AdminRoute, ProtectedRoute } from "./components/ProtectedRoute";
import { AppShell } from "./layouts/AppShell";
import { AcceptInvitationPage } from "./pages/AcceptInvitationPage";
import { RejectPromotionPage } from "./pages/RejectPromotionPage";
import { AdminPage } from "./pages/AdminPage";
import { CreatePostPage } from "./pages/CreatePostPage";
import { FeedPage } from "./pages/FeedPage";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage";
import { LoginPage } from "./pages/LoginPage";
import { PostDetailPage } from "./pages/PostDetailPage";
import { ProfilePage } from "./pages/ProfilePage";
import { ProfileContentPage } from "./pages/ProfileContentPage";
import { ScheduledPostsPage } from "./pages/ScheduledPostsPage";
import { FriendsPage } from "./pages/FriendsPage";
import {
  WorldCupFixturesTab,
  WorldCupIndexRedirect,
  WorldCupLayout,
  WorldCupResultsTab,
  WorldCupRoadMapTab,
  WorldCupStandingsTab,
  WorldCupStatsTab,
} from "./pages/WorldCupPage";
import { CoinsPage } from "./pages/CoinsPage";
import { PointsPage } from "./pages/PointsPage";
import { MatchDetailPage } from "./pages/MatchDetailPage";
import { CampaignDetailPage } from "./pages/CampaignDetailPage";
import { UserProfilePage } from "./pages/UserProfilePage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";
import { SignupPage } from "./pages/SignupPage";
import { SoundPreferencesPage } from "./pages/SoundPreferencesPage";
import { VerifyEmailPage } from "./pages/VerifyEmailPage";
import { PrivacyPolicyPage } from "./pages/PrivacyPolicyPage";
import { TermsOfServicePage } from "./pages/TermsOfServicePage";
import { CreditsPage } from "./pages/CreditsPage";
import { ChildSafetyPage } from "./pages/ChildSafetyPage";
import { NotificationsPage } from "./pages/NotificationsPage";

function AuthExpiredWatcher() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    return onAuthExpired(() => {
      clearAuthExpired();
      logout();
      navigate("/login", { replace: true });
    });
  }, [logout, navigate]);
  return null;
}

export default function App() {
  return (
    <>
    <AuthExpiredWatcher />
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/accept-invitation" element={<AcceptInvitationPage />} />
      <Route path="/reject-promotion" element={<RejectPromotionPage />} />
      <Route path="/privacy" element={<PrivacyPolicyPage />} />
      <Route path="/terms" element={<TermsOfServicePage />} />
      <Route path="/credits" element={<CreditsPage />} />
      <Route path="/child-safety" element={<ChildSafetyPage />} />
      <Route element={<AppShell />}>
        <Route index element={<FeedPage />} />
        <Route path="post/:postId" element={<PostDetailPage />} />
        <Route path="friends" element={<FriendsPage />} />
        <Route path="profile/:userId" element={<UserProfilePage />} />
        <Route path="coins" element={<CoinsPage />} />
        <Route path="coins/:userId" element={<CoinsPage />} />
        <Route path="points" element={<PointsPage />} />
        <Route path="points/:userId" element={<PointsPage />} />
        <Route path="world-cup" element={<WorldCupLayout />}>
          <Route index element={<WorldCupIndexRedirect />} />
          <Route path="fixtures" element={<WorldCupFixturesTab />} />
          <Route path="results" element={<WorldCupResultsTab />} />
          <Route path="standings" element={<WorldCupStandingsTab />} />
          <Route path="stats" element={<WorldCupStatsTab />} />
          <Route path="road-map" element={<WorldCupRoadMapTab />} />
          <Route path="bracket" element={<Navigate to="/world-cup/road-map" replace />} />
        </Route>
        <Route path="world-cup/match/:id" element={<MatchDetailPage />} />
        <Route path="campaign/:slug" element={<CampaignDetailPage />} />
        <Route
          path="create"
          element={
            <ProtectedRoute>
              <CreatePostPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="profile"
          element={
            <ProtectedRoute>
              <ProfilePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="profile/content"
          element={
            <ProtectedRoute>
              <ProfileContentPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="profile/scheduled"
          element={
            <ProtectedRoute>
              <ScheduledPostsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="profile/sounds"
          element={
            <ProtectedRoute>
              <SoundPreferencesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="notifications"
          element={
            <ProtectedRoute>
              <NotificationsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="admin"
          element={
            <AdminRoute>
              <AdminPage />
            </AdminRoute>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </>
  );
}
