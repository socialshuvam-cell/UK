import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { api, apiErrorMessage } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useCourseSessions, nameById } from "@/hooks/useLookups";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const STATUSES = ["active", "completed", "withdrawn", "suspended"];

export default function EnrollmentDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { hasPermission } = useAuth();
  const canManage = hasPermission("enrollments.manage");

  const { data: enrollment, isLoading } = useQuery({
    queryKey: ["enrollment", id],
    queryFn: async () => (await api.get(`/enrollments/${id}`)).data.enrollment,
  });
  const { data: sessions } = useCourseSessions(enrollment?.course_id);

  const [statusOpen, setStatusOpen] = useState(false);
  const [newStatus, setNewStatus] = useState("");

  const updateMutation = useMutation({
    mutationFn: async () => (await api.put(`/enrollments/${id}`, { status: newStatus })).data,
    onSuccess: () => {
      toast.success("Enrollment status updated");
      queryClient.invalidateQueries({ queryKey: ["enrollment", id] });
      queryClient.invalidateQueries({ queryKey: ["enrollments"] });
      setStatusOpen(false);
    },
    onError: (err) => toast.error(apiErrorMessage(err, "Could not update enrollment")),
  });

  if (isLoading || !enrollment) return <Skeleton className="h-64 w-full" />;

  return (
    <div data-testid="enrollment-detail-page">
      <PageHeader
        title={`Enrollment #${enrollment.id}`}
        description={`Roll No. ${enrollment.roll_number}`}
        action={
          canManage && (
            <Button onClick={() => { setNewStatus(enrollment.status); setStatusOpen(true); }} data-testid="enrollment-change-status-button">
              Change Status
            </Button>
          )
        }
      />

      <Card>
        <CardHeader><CardTitle className="text-base">Details</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Row label="Status"><StatusBadge status={enrollment.status} testId="enrollment-status-badge" /></Row>
          <Row label="Session">{nameById(sessions, enrollment.session_id, "session_name")}</Row>
          <Row label="Institution / Centre">{enrollment.institution_id ? `#${enrollment.institution_id}` : "Not specified"}</Row>
          <Row label="Enrolled On">{enrollment.created_at ? new Date(enrollment.created_at).toLocaleString() : "-"}</Row>
          <Row label="Student">
            <Button variant="link" className="h-auto p-0" onClick={() => navigate(`/admin/students/${enrollment.student_id}`)} data-testid="enrollment-view-student-link">
              View student record
            </Button>
          </Row>
        </CardContent>
      </Card>

      <Dialog open={statusOpen} onOpenChange={setStatusOpen}>
        <DialogContent data-testid="enrollment-status-dialog">
          <DialogHeader><DialogTitle>Change Enrollment Status</DialogTitle></DialogHeader>
          <Select value={newStatus} onValueChange={setNewStatus}>
            <SelectTrigger data-testid="enrollment-status-select"><SelectValue /></SelectTrigger>
            <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}</SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStatusOpen(false)}>Cancel</Button>
            <Button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending} data-testid="enrollment-status-submit">
              {updateMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ label, children }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}
