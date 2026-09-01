import { Badge } from "@/components/ui/badge";

const VARIANT_MAP = {
  active: "default",
  valid: "default",
  approved: "default",
  completed: "default",
  enrolled: "default",
  submitted: "secondary",
  under_review: "secondary",
  upcoming: "secondary",
  prospective: "secondary",
  pending: "secondary",
  inactive: "outline",
  archived: "outline",
  graduated: "outline",
  rejected: "destructive",
  cancelled: "destructive",
  withdrawn: "destructive",
  suspended: "destructive",
  revoked: "destructive",
  superseded: "outline",
};

export function StatusBadge({ status, testId }) {
  if (!status) return null;
  return (
    <Badge variant={VARIANT_MAP[status] || "secondary"} className="capitalize" data-testid={testId}>
      {status.replace(/_/g, " ")}
    </Badge>
  );
}
