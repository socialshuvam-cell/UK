import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { apiErrorMessage } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const user = await login(email, password);
      const isStudent = (user.role || "") === "student";
      const target = location.state?.from?.pathname || (isStudent ? "/portal" : "/admin");
      navigate(isStudent && !target.startsWith("/portal") ? "/portal" : target, { replace: true });
      toast.success(`Welcome back, ${user.first_name}`);
    } catch (err) {
      setError(apiErrorMessage(err, "Invalid email or password"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen">
      <div className="relative hidden w-1/2 flex-col justify-between bg-navy-deep p-12 lg:flex">
        <div className="flex items-center gap-3">
          <img src="/assets/kingswell-logo.png" alt="Kingswell Institute crest" className="h-11 w-11" />
          <div className="leading-tight">
            <div className="font-serif text-lg font-semibold text-white">Kingswell</div>
            <div className="text-[11px] uppercase tracking-[0.2em] text-gold/70">Institute</div>
          </div>
        </div>
        <div className="max-w-md">
          <span className="mb-4 block h-[3px] w-10 bg-gold" />
          <h1 className="font-serif text-3xl font-semibold leading-tight text-white">
            Student, Admissions &amp; Examination Management
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-white/60">
            A single institutional record for admissions, academics, examinations and verified
            documentation — administered with rigour, presented with clarity.
          </p>
        </div>
        <p className="text-xs text-white/35">&copy; {new Date().getFullYear()} Kingswell Institute. All rights reserved.</p>
      </div>

      <div className="flex w-full items-center justify-center bg-background p-6 lg:w-1/2">
        <div className="w-full max-w-sm" data-testid="login-card">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <img src="/assets/kingswell-logo.png" alt="Kingswell Institute crest" className="h-11 w-11" />
            <div className="leading-tight">
              <div className="font-serif text-lg font-semibold text-foreground">Kingswell</div>
              <div className="text-[11px] uppercase tracking-[0.2em] text-gold">Institute</div>
            </div>
          </div>

          <span className="mb-2 block h-[3px] w-9 bg-gold" />
          <h2 className="font-serif text-2xl font-semibold text-foreground">Sign in</h2>
          <p className="mt-1 text-sm text-muted-foreground">Staff dashboard and student portal access.</p>

          <form onSubmit={handleSubmit} className="mt-7 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                data-testid="login-email-input"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                data-testid="login-password-input"
              />
            </div>
            {error && (
              <p className="text-sm text-destructive" data-testid="login-error">
                {error}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={submitting} data-testid="login-submit-button">
              {submitting ? "Signing in..." : "Sign in"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
