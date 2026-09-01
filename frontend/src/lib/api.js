import axios from "axios";

// Production-safe relative path: Hostinger serves the React build and the
// PHP API from the same origin (see docs/ARCHITECTURE.md). Locally, craco's
// devServer proxy forwards this to the PHP/Apache backend on port 8090.
export const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
});

let csrfToken = null;
export function setCsrfToken(token) {
  csrfToken = token;
}

api.interceptors.request.use((config) => {
  const method = (config.method || "get").toLowerCase();
  if (csrfToken && ["post", "put", "delete", "patch"].includes(method)) {
    config.headers["X-CSRF-Token"] = csrfToken;
  }
  return config;
});

export function apiErrorMessage(error, fallback = "Something went wrong") {
  const data = error?.response?.data;
  if (!data) return fallback;
  if (data.error) return data.error;
  if (data.errors) {
    const first = Object.values(data.errors)[0];
    return Array.isArray(first) ? first[0] : String(first);
  }
  return fallback;
}
