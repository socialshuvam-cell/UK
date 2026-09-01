const STYLE_MAP = {
  active: "bg-emerald-50 text-emerald-800 border-emerald-200",
  valid: "bg-emerald-50 text-emerald-800 border-emerald-200",
  approved: "bg-emerald-50 text-emerald-800 border-emerald-200",
  completed: "bg-emerald-50 text-emerald-800 border-emerald-200",
  enrolled: "bg-emerald-50 text-emerald-800 border-emerald-200",
  pass: "bg-emerald-50 text-emerald-800 border-emerald-200",
  admitted: "bg-emerald-50 text-emerald-800 border-emerald-200",
  appeared: "bg-emerald-50 text-emerald-800 border-emerald-200",

  submitted: "bg-amber-50 text-amber-900 border-amber-200",
  under_review: "bg-amber-50 text-amber-900 border-amber-200",
  upcoming: "bg-amber-50 text-amber-900 border-amber-200",
  prospective: "bg-amber-50 text-amber-900 border-amber-200",
  pending: "bg-amber-50 text-amber-900 border-amber-200",
  scheduled: "bg-amber-50 text-amber-900 border-amber-200",
  ongoing: "bg-amber-50 text-amber-900 border-amber-200",
  registered: "bg-amber-50 text-amber-900 border-amber-200",

  inactive: "bg-secondary text-muted-foreground border-border",
  archived: "bg-secondary text-muted-foreground border-border",
  graduated: "bg-secondary text-muted-foreground border-border",
  superseded: "bg-secondary text-muted-foreground border-border",

  rejected: "bg-rose-50 text-rose-800 border-rose-200",
  cancelled: "bg-rose-50 text-rose-800 border-rose-200",
  withdrawn: "bg-rose-50 text-rose-800 border-rose-200",
  suspended: "bg-rose-50 text-rose-800 border-rose-200",
  revoked: "bg-rose-50 text-rose-800 border-rose-200",
  fail: "bg-rose-50 text-rose-800 border-rose-200",
  absent: "bg-rose-50 text-rose-800 border-rose-200",
  debarred: "bg-rose-50 text-rose-800 border-rose-200",
};

export function StatusBadge({ status, testId }) {
  if (!status) return null;
  return (
    <span
      data-testid={testId}
      className={`inline-flex items-center rounded-sm border px-2 py-0.5 text-[11px] font-semibold capitalize tracking-wide ${STYLE_MAP[status] || "bg-secondary text-muted-foreground border-border"}`}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}
