import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ShieldCheck, ShieldAlert, ShieldX, ShieldQuestion, Search } from "lucide-react";

const STATUS_META = {
  valid: { label: "Valid & Authentic", tone: "border-emerald-500 bg-emerald-50 text-emerald-900", icon: ShieldCheck, iconTone: "text-emerald-600" },
  revoked: { label: "Revoked", tone: "border-rose-500 bg-rose-50 text-rose-900", icon: ShieldX, iconTone: "text-rose-600" },
  cancelled: { label: "Cancelled", tone: "border-rose-500 bg-rose-50 text-rose-900", icon: ShieldX, iconTone: "text-rose-600" },
  superseded: { label: "Superseded by a Reissued Document", tone: "border-amber-500 bg-amber-50 text-amber-900", icon: ShieldAlert, iconTone: "text-amber-600" },
  not_found: { label: "Not Found", tone: "border-border bg-secondary text-muted-foreground", icon: ShieldQuestion, iconTone: "text-muted-foreground" },
};

function labelType(type) { return (type || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()); }

function Row({ label, value }) {
  if (!value) return null;
  return (
    <div className="border-b border-border/70 py-2.5 last:border-0 sm:flex sm:justify-between">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-medium text-foreground sm:mt-0 sm:text-right">{value}</dd>
    </div>
  );
}

export default function VerifyPage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [inputToken, setInputToken] = useState("");

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["verify", token],
    queryFn: async () => (await api.get(`/verify/${token}`)).data,
    enabled: !!token,
    retry: false,
  });

  const handleSearch = (e) => {
    e.preventDefault();
    const trimmed = inputToken.trim();
    if (trimmed) navigate(`/verify/${trimmed}`);
  };

  const rateLimited = isError && error?.response?.status === 429;
  const meta = data ? (STATUS_META[data.status] || STATUS_META.not_found) : null;
  const Icon = meta?.icon;

  return (
    <div className="min-h-screen bg-background" data-testid="verify-page">
      <header className="flex items-center gap-3 bg-navy-deep px-6 py-5">
        <img src="/assets/kingswell-logo.png" alt="Kingswell Institute crest" className="h-10 w-10" />
        <div className="leading-tight">
          <div className="font-serif text-base font-semibold text-white">Kingswell Institute</div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-gold/70">Document Verification</div>
        </div>
      </header>

      <main className="mx-auto max-w-xl px-4 py-10 sm:py-14">
        <div className="mb-8 text-center">
          <span className="mx-auto mb-3 block h-[3px] w-9 bg-gold" />
          <h1 className="font-serif text-2xl font-semibold text-foreground sm:text-3xl">Verify a Kingswell Document</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Scan the QR code on a Kingswell Institute document, or enter its verification token below, to confirm its authenticity and current status.
          </p>
        </div>

        <form onSubmit={handleSearch} className="mb-8 flex gap-2">
          <Input
            placeholder="Enter verification token..."
            value={inputToken}
            onChange={(e) => setInputToken(e.target.value)}
            data-testid="verify-token-input"
          />
          <Button type="submit" data-testid="verify-token-submit">
            <Search className="mr-2 h-4 w-4" /> Verify
          </Button>
        </form>

        {!token && (
          <p className="text-center text-sm text-muted-foreground" data-testid="verify-empty-state">
            Enter a verification token above to check a document's status.
          </p>
        )}

        {token && isLoading && (
          <div className="rounded-md border border-border bg-card p-8 text-center text-sm text-muted-foreground" data-testid="verify-loading">
            Checking document...
          </div>
        )}

        {token && rateLimited && (
          <div className="rounded-md border border-amber-500 bg-amber-50 p-6 text-center text-sm text-amber-900" data-testid="verify-rate-limited">
            Too many verification attempts from this location. Please try again in a few minutes.
          </div>
        )}

        {token && !isLoading && !rateLimited && data && (
          <div className={`rounded-md border-2 ${meta.tone} p-6`} data-testid="verify-result-card">
            <div className="mb-4 flex items-center gap-3">
              {Icon && <Icon className={`h-8 w-8 shrink-0 ${meta.iconTone}`} />}
              <div>
                <div className="text-lg font-semibold" data-testid="verify-status-label">{meta.label}</div>
                {data.found && <div className="text-sm opacity-80">{data.document_number} — {labelType(data.doc_type)}</div>}
              </div>
            </div>

            {!data.found ? (
              <p className="text-sm opacity-90" data-testid="verify-not-found-message">
                No document was found for this verification token. Please check the token and try again, or contact Kingswell Institute directly if you believe this is an error.
              </p>
            ) : (
              <dl className="rounded-sm bg-white/60 p-4">
                <Row label="Candidate" value={data.student_name} />
                <Row label="Registration Number" value={data.registration_number} />
                <Row label="Institution" value={data.institution} />
                <Row label="Course" value={data.course} />
                <Row label="Session" value={data.session} />
                <Row label="Issue Date" value={data.issue_date} />
                <Row label="Result" value={data.grade ? `${data.grade}${data.result_status ? ` (${data.result_status})` : ""}` : data.result_status} />
                {data.status_reason && <Row label="Reason" value={data.status_reason} />}
                {data.status_at && <Row label="Status Date" value={new Date(data.status_at).toLocaleDateString()} />}
                {data.superseded_by_document_number && <Row label="Current Version" value={data.superseded_by_document_number} />}
              </dl>
            )}
          </div>
        )}

        {token && isError && !rateLimited && (
          <div className="rounded-md border border-border bg-card p-6 text-center text-sm text-muted-foreground" data-testid="verify-error">
            Could not check this document right now. Please try again shortly.
          </div>
        )}
      </main>

      <footer className="py-6 text-center text-xs text-muted-foreground">
        &copy; {new Date().getFullYear()} Kingswell Institute. All rights reserved.
      </footer>
    </div>
  );
}
