import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

export function ProtectedRoute({ children, allow }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-muted-foreground" data-testid="auth-loading">
        Loading...
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  const isStudent = user.role === "student";
  if (allow === "staff" && isStudent) {
    return <Navigate to="/portal" replace />;
  }
  if (allow === "student" && !isStudent) {
    return <Navigate to="/admin" replace />;
  }

  return children;
}
