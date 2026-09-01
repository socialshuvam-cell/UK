import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, setCsrfToken } from "@/lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(true);

  const applySession = useCallback((rawUser, perms, csrf) => {
    setCsrfToken(csrf || null);
    setUser(rawUser ? { ...rawUser, role: rawUser.role || rawUser.role_slug } : null);
    setPermissions(perms || []);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get("/auth/me");
      applySession(data.user, data.permissions, data.csrf_token);
    } catch {
      applySession(null, [], null);
    } finally {
      setLoading(false);
    }
  }, [applySession]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = useCallback(
    async (email, password) => {
      const { data } = await api.post("/auth/login", { email, password });
      applySession(data.user, [], data.csrf_token);
      await refresh();
      return data.user;
    },
    [applySession, refresh]
  );

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } finally {
      applySession(null, [], null);
    }
  }, [applySession]);

  const hasPermission = useCallback((slug) => permissions.includes(slug), [permissions]);
  const isStudent = user?.role === "student";
  const isStaff = !!user && !isStudent;

  return (
    <AuthContext.Provider
      value={{ user, permissions, loading, isStudent, isStaff, login, logout, hasPermission, refresh }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
