import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { api, apiErrorMessage } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useCourses, useCourseSessions, useInstitutions, nameById } from "@/hooks/useLookups";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

const ACTIONS_BY_STATUS = {
  submitted: [
    { action: "start_review", label: "Start Review" },
    { action: "approve", label: "Approve" },
    { action: "reject", label: "Reject", destructive: true },
    { action: "cancel", label: "Cancel", destructive: true },
  ],
  under_review: [
    { action: "approve", label: "Approve" },
    { action: "reject", label: "Reject", destructive: true },
    { action: "cancel", label: "Cancel", destructive: true },
  ],
  approved: [{ action: "cancel", label: "Cancel", destructive: true }],
};

export default function AdmissionDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { hasPermission } = useAuth();
  const canReview = hasPermission("admissions.review");

  const [reviewDialog, setReviewDialog] = useState(null);
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [enrollSessionId, setEnrollSessionId] = useState("");
  const [credentialsResult, setCredentialsResult] = useState(null);

  const { data: admission, isLoading } = useQuery({
    queryKey: ["admission", id],
    queryFn: async () => (await api.get(`/admissions/${id}`)).data.admission,
  });
  const { data: courses } = useCourses();
  const { data: institutions } = useInstitutions();
  const { data: sessions } = useCourseSessions(admission?.course_id);

  const reviewMutation = useMutation({
    mutationFn: async ({ action, review_notes }) => (await api.post(`/admissions/${id}/review`, { action, review_notes })).data,
    onSuccess: () => {
      toast.success("Admission updated");
      queryClient.invalidateQueries({ queryKey: ["admission", id] });
      queryClient.invalidateQueries({ queryKey: ["admissions"] });
      setReviewDialog(null);
    },
    onError: (err) => toast.error(apiErrorMessage(err, "Could not update admission")),
  });

  const enrollMutation = useMutation({
    mutationFn: async () =>
      (await api.post(`/admissions/${id}/enroll`, enrollSessionId ? { session_id: Number(enrollSessionId) } : {})).data,
    onSuccess: (data) => {
      toast.success("Student enrolled successfully");
      queryClient.invalidateQueries({ queryKey: ["admission", id] });
      queryClient.invalidateQueries({ queryKey: ["admissions"] });
      setEnrollOpen(false);
      if (data.credentials) setCredentialsResult(data.credentials);
    },
    onError: (err) => toast.error(apiErrorMessage(err, "Could not complete enrollment")),
  });

  if (isLoading || !admission) return <Skeleton className="h-64 w-full" />;

  const availableActions = canReview ? ACTIONS_BY_STATUS[admission.status] || [] : [];

  return (
    <div data-testid="admission-detail-page">
      <PageHeader
        title={`Admission ${admission.admission_number}`}
        description={`${admission.applicant_first_name} ${admission.applicant_last_name}`}
        action={
          <div className="flex flex-wrap gap-2">
            {availableActions.map((a) => (
              <Button
                key={a.action}
                variant={a.destructive ? "destructive" : "default"}
                onClick={() => setReviewDialog(a)}
                data-testid={`admission-action-${a.action}`}
              >
                {a.label}
              </Button>
            ))}
            {canReview && admission.status === "approved" && (
              <Button onClick={() => setEnrollOpen(true)} data-testid="admission-action-enroll">
                Enroll Student
              </Button>
            )}
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-2">
        <Card data-testid="admission-info-card">
          <CardHeader><CardTitle className="text-base">Application Details</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Status"><StatusBadge status={admission.status} testId="admission-status-badge" /></Row>
            <Row label="Email">{admission.applicant_email || "-"}</Row>
            <Row label="Phone">{admission.applicant_phone || "-"}</Row>
            <Row label="Course">{nameById(courses, admission.course_id)}</Row>
            <Row label="Institution/Centre">{admission.institution_id ? nameById(institutions, admission.institution_id) : "Not specified"}</Row>
            <Row label="Session">{admission.session_id ? nameById(sessions, admission.session_id, "session_name") : "Not specified"}</Row>
            <Row label="Submitted">{admission.submitted_at ? new Date(admission.submitted_at).toLocaleString() : "-"}</Row>
            <Row label="Reviewed">{admission.reviewed_at ? new Date(admission.reviewed_at).toLocaleString() : "-"}</Row>
            <Row label="Review Notes">{admission.review_notes || "-"}</Row>
            {admission.student_id && (
              <Row label="Student">
                <Button variant="link" className="h-auto p-0" onClick={() => navigate(`/admin/students/${admission.student_id}`)} data-testid="admission-view-student-link">
                  View student record
                </Button>
              </Row>
            )}
          </CardContent>
        </Card>

        {admission.application_data && (
          <Card data-testid="admission-application-data-card">
            <CardHeader><CardTitle className="text-base">Additional Application Data</CardTitle></CardHeader>
            <CardContent>
              <pre className="whitespace-pre-wrap break-words text-xs text-muted-foreground">
                {JSON.stringify(admission.application_data, null, 2)}
              </pre>
            </CardContent>
          </Card>
        )}
      </div>

      <ConfirmDialog
        open={!!reviewDialog}
        onOpenChange={(o) => !o && setReviewDialog(null)}
        title={reviewDialog ? `${reviewDialog.label} admission` : ""}
        description="Optionally add review notes for the record."
        requireReason={false}
        confirmLabel={reviewDialog?.label}
        destructive={reviewDialog?.destructive}
        submitting={reviewMutation.isPending}
        testId="admission-review-dialog"
        onConfirm={(reason) => reviewMutation.mutate({ action: reviewDialog.action, review_notes: reason || null })}
      />

      <Dialog open={enrollOpen} onOpenChange={setEnrollOpen}>
        <DialogContent data-testid="admission-enroll-dialog">
          <DialogHeader>
            <DialogTitle>Enroll Student</DialogTitle>
            <DialogDescription>This creates the student master record (if needed) and an active enrollment.</DialogDescription>
          </DialogHeader>
          {!admission.session_id && (
            <div className="space-y-2">
              <Label>Session</Label>
              <Select value={enrollSessionId} onValueChange={setEnrollSessionId}>
                <SelectTrigger data-testid="admission-enroll-session-select"><SelectValue placeholder="Select a session" /></SelectTrigger>
                <SelectContent>
                  {(sessions || []).map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>{s.session_name} ({s.academic_year})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEnrollOpen(false)}>Cancel</Button>
            <Button
              onClick={() => enrollMutation.mutate()}
              disabled={enrollMutation.isPending || (!admission.session_id && !enrollSessionId)}
              data-testid="admission-enroll-submit"
            >
              {enrollMutation.isPending ? "Enrolling..." : "Confirm Enrollment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!credentialsResult} onOpenChange={() => setCredentialsResult(null)}>
        <DialogContent data-testid="admission-credentials-dialog">
          <DialogHeader>
            <DialogTitle>Student Account Created</DialogTitle>
            <DialogDescription>Share these one-time login credentials with the student. They will not be shown again.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1 rounded-md bg-muted p-3 text-sm">
            <div><span className="text-muted-foreground">Email: </span><span className="font-mono" data-testid="admission-credentials-email">{credentialsResult?.email}</span></div>
            <div><span className="text-muted-foreground">Temporary Password: </span><span className="font-mono" data-testid="admission-credentials-password">{credentialsResult?.temporary_password}</span></div>
          </div>
          <DialogFooter>
            <Button onClick={() => setCredentialsResult(null)}>Done</Button>
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
