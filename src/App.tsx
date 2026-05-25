import { Navigate, Route, Routes } from "react-router-dom";
import { AdminRoute, ProtectedRoute } from "./components/ProtectedRoute";
import { AppShell } from "./layouts/AppShell";
import { AcceptInvitationPage } from "./pages/AcceptInvitationPage";
import { AdminPage } from "./pages/AdminPage";
import { CreatePostPage } from "./pages/CreatePostPage";
import { FeedPage } from "./pages/FeedPage";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage";
import { LoginPage } from "./pages/LoginPage";
import { PostDetailPage } from "./pages/PostDetailPage";
import { ProfilePage } from "./pages/ProfilePage";
import { ScheduledPostsPage } from "./pages/ScheduledPostsPage";
import { FriendsPage } from "./pages/FriendsPage";
import { WorldCupPage } from "./pages/WorldCupPage";
import { CampaignDetailPage } from "./pages/CampaignDetailPage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";
import { SignupPage } from "./pages/SignupPage";
import { VerifyEmailPage } from "./pages/VerifyEmailPage";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/accept-invitation" element={<AcceptInvitationPage />} />
      <Route element={<AppShell />}>
        <Route index element={<FeedPage />} />
        <Route path="post/:postId" element={<PostDetailPage />} />
        <Route path="friends" element={<FriendsPage />} />
        <Route path="world-cup" element={<WorldCupPage />} />
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
          path="profile/scheduled"
          element={
            <ProtectedRoute>
              <ScheduledPostsPage />
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
  );
}
