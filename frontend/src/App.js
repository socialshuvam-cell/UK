import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/layout/AppLayout";
import { ADMIN_NAV, PORTAL_NAV } from "@/constants/nav";
import LoginPage from "@/pages/LoginPage";
import NotFoundPage from "@/pages/NotFoundPage";
import AdminDashboardPage from "@/pages/admin/DashboardPage";
import PortalDashboardPage from "@/pages/portal/DashboardPage";
import "@/App.css";

function RootRedirect() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={user.role === "student" ? "/portal" : "/admin"} replace />;
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/login" element={<LoginPage />} />

          <Route
            path="/admin"
            element={
              <ProtectedRoute allow="staff">
                <AppLayout navItems={ADMIN_NAV} title="Admin Dashboard" />
              </ProtectedRoute>
            }
          >
            <Route index element={<AdminDashboardPage />} />
          </Route>

          <Route
            path="/portal"
            element={
              <ProtectedRoute allow="student">
                <AppLayout navItems={PORTAL_NAV} title="Student Portal" />
              </ProtectedRoute>
            }
          >
            <Route index element={<PortalDashboardPage />} />
          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
