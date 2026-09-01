import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { api, apiErrorMessage } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Download } from "lucide-react";

function label(type) { return (type || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()); }

function Field({ label: l, children }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{l}</div>
      <div className="font-medium">{children ?? "-"}</div>
    </div>
  );
}

function ExtraDetails({ doc }) {
  const s = doc.data_snapshot;
  if (!s) return null;
  const extra = s.extra || {};

  if (doc.doc_type === "hall_ticket") {
    return (
      <>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Examination">{extra.examination?.name} ({extra.examination?.exam_code})</Field>
          <Field label="Exam Centre">{extra.exam_center}</Field>
          <Field label="Seat Number">{extra.seat_number}</Field>
        </div>
        <Table className="mt-4">
          <TableHeader><TableRow><TableHead>Subject</TableHead><TableHead>Date</TableHead><TableHead>Time</TableHead></TableRow></TableHeader>
          <TableBody>{(extra.subjects || []).map((sub, i) => (
            <TableRow key={i}><TableCell>{sub.subject_code} - {sub.subject_name}</TableCell><TableCell>{sub.exam_date}</TableCell><TableCell>{sub.start_time}</TableCell></TableRow>
          ))}</TableBody>
        </Table>
      </>
    );
  }
  if (doc.doc_type === "marksheet") {
    return (
      <>
        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Examination">{extra.examination?.name}</Field>
          <Field label="Total Marks">{extra.total_obtained_marks} / {extra.total_max_marks}</Field>
          <Field label="Percentage">{extra.percentage}%</Field>
          <Field label="Grade"><StatusBadge status={extra.result_status} />&nbsp;{extra.grade}</Field>
        </div>
        <Table className="mt-4">
          <TableHeader><TableRow><TableHead>Subject</TableHead><TableHead>Max</TableHead><TableHead>Pass</TableHead><TableHead>Obtained</TableHead></TableRow></TableHeader>
          <TableBody>{(extra.subjects || []).map((sub, i) => (
            <TableRow key={i}><TableCell>{sub.subject_code} - {sub.subject_name}</TableCell><TableCell>{sub.max_marks}</TableCell><TableCell>{sub.pass_marks}</TableCell><TableCell>{sub.is_absent ? "Absent" : sub.marks_obtained}</TableCell></TableRow>
          ))}</TableBody>
        </Table>
      </>
    );
  }
  if (doc.doc_type === "transcript") {
    return (
      <>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Overall Percentage">{extra.overall_percentage}%</Field>
          <Field label="Overall Grade">{extra.overall_grade}</Field>
        </div>
        <Table className="mt-4">
          <TableHeader><TableRow><TableHead>Examination</TableHead><TableHead>Percentage</TableHead><TableHead>Grade</TableHead><TableHead>Result</TableHead></TableRow></TableHeader>
          <TableBody>{(extra.exams || []).map((e, i) => (
            <TableRow key={i}><TableCell>{e.exam_name} ({e.exam_code})</TableCell><TableCell>{e.percentage}%</TableCell><TableCell>{e.grade}</TableCell><TableCell><StatusBadge status={e.result_status} /></TableCell></TableRow>
          ))}</TableBody>
        </Table>
      </>
    );
  }
  if (["certificate", "diploma", "degree", "completion_letter"].includes(doc.doc_type)) {
    return (
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Roll Number">{extra.roll_number}</Field>
        <Field label="Enrollment Status"><StatusBadge status={extra.enrollment_status} /></Field>
        {extra.result && <Field label="Result">{extra.result.percentage}% ({extra.result.grade})</Field>}
      </div>
    );
  }
  if (doc.doc_type === "admission_letter") {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Admission Number">{extra.admission_number}</Field>
        <Field label="Applicant">{extra.applicant_name}</Field>
      </div>
    );
  }
  return null;
}

export default function DocumentDetailPage() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const { hasPermission } = useAuth();
  const canIssue = hasPermission("documents.issue");
  const canRevoke = hasPermission("documents.revoke");

  const { data, isLoading } = useQuery({
    queryKey: ["document", id],
    queryFn: async () => (await api.get(`/documents/${id}`)).data,
  });

  const [statusDialog, setStatusDialog] = useState(null);
  const [reason, setReason] = useState("");
  const [reissueOpen, setReissueOpen] = useState(false);
  const [signatoryOpen, setSignatoryOpen] = useState(false);
  const [signatoryForm, setSignatoryForm] = useState({ name: "", designation: "" });

  const statusMutation = useMutation({
    mutationFn: async () => (await api.post(`/documents/${id}/${statusDialog}`, { reason })).data,
    onSuccess: () => {
      toast.success(`Document ${statusDialog === "revoke" ? "revoked" : "cancelled"}`);
      queryClient.invalidateQueries({ queryKey: ["document", id] });
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      setStatusDialog(null);
      setReason("");
    },
    onError: (err) => toast.error(apiErrorMessage(err, "Could not update document status")),
  });

  const reissueMutation = useMutation({
    mutationFn: async () => (await api.post(`/documents/${id}/reissue`, {})).data.document,
    onSuccess: (doc) => {
      toast.success(`Reissued as ${doc.document_number}`);
      queryClient.invalidateQueries({ queryKey: ["document", id] });
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      setReissueOpen(false);
    },
    onError: (err) => toast.error(apiErrorMessage(err, "Could not reissue document")),
  });

  const signatoryMutation = useMutation({
    mutationFn: async () => (await api.post(`/documents/${id}/signatories`, signatoryForm)).data,
    onSuccess: () => {
      toast.success("Signatory added");
      queryClient.invalidateQueries({ queryKey: ["document", id] });
      setSignatoryOpen(false);
      setSignatoryForm({ name: "", designation: "" });
    },
    onError: (err) => toast.error(apiErrorMessage(err, "Could not add signatory")),
  });

  if (isLoading || !data?.document) return <Skeleton className="h-64 w-full" />;
  const doc = data.document;
  const snapshot = doc.data_snapshot || {};
  const verifyUrl = `${window.location.origin}/verify/${doc.verification_token}`;

  return (
    <div data-testid="document-detail-page">
      <PageHeader
        title={doc.document_number}
        description={`${label(doc.doc_type)} — issued ${doc.issue_date}`}
        action={
          <div className="flex flex-wrap gap-2">
            <a href={`/api/documents/${doc.id}/download`} target="_blank" rel="noreferrer" data-testid="document-download-link">
              <Button variant="outline"><Download className="mr-2 h-4 w-4" /> Download PDF</Button>
            </a>
            {canIssue && doc.status === "valid" && doc.doc_type !== "hall_ticket" && (
              <Button variant="outline" onClick={() => setReissueOpen(true)} data-testid="document-reissue-button">Reissue</Button>
            )}
            {canRevoke && doc.status === "valid" && (
              <>
                <Button variant="outline" onClick={() => setStatusDialog("cancel")} data-testid="document-cancel-button">Cancel</Button>
                <Button variant="destructive" onClick={() => setStatusDialog("revoke")} data-testid="document-revoke-button">Revoke</Button>
              </>
            )}
          </div>
        }
      />

      <div className="mb-6 flex items-center gap-3">
        <StatusBadge status={doc.status} testId="document-status-badge" />
        {doc.status_reason && <span className="text-sm text-muted-foreground">Reason: {doc.status_reason}</span>}
        {doc.replaces_document_id && (
          <Link to={`/admin/documents/${doc.replaces_document_id}`} className="text-sm text-primary hover:underline" data-testid="document-replaces-link">
            View previous version
          </Link>
        )}
        {doc.superseded_by && (
          <Link to={`/admin/documents/${doc.superseded_by}`} className="text-sm text-primary hover:underline" data-testid="document-superseded-by-link">
            View reissued version
          </Link>
        )}
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Candidate & Record</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <Field label="Student">{snapshot.student?.first_name} {snapshot.student?.last_name}</Field>
            <Field label="Registration Number">{snapshot.student?.registration_number}</Field>
            <Field label="Institution">{snapshot.institution?.name || "Not specified"}</Field>
            {snapshot.course && <Field label="Course">{snapshot.course.name}</Field>}
            {snapshot.session && <Field label="Session">{snapshot.session.name}</Field>}
            <Field label="Revision">{doc.revision}</Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Document Details</CardTitle></CardHeader>
          <CardContent><ExtraDetails doc={doc} /></CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Verification</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Verification Token">{doc.verification_token}</Field>
            <Field label="Public Verification Link">
              <a href={verifyUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline" data-testid="document-verify-link">{verifyUrl}</a>
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Signatories</CardTitle>
            {canIssue && <Button size="sm" variant="outline" onClick={() => setSignatoryOpen(true)} data-testid="add-signatory-button">Add Signatory</Button>}
          </CardHeader>
          <CardContent>
            <Table data-testid="signatories-table">
              <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Designation</TableHead></TableRow></TableHeader>
              <TableBody>
                {(data.signatories || []).length === 0 && <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground">No signatories recorded.</TableCell></TableRow>}
                {(data.signatories || []).map((s) => (
                  <TableRow key={s.id}><TableCell>{s.name}</TableCell><TableCell>{s.designation || "-"}</TableCell></TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!statusDialog} onOpenChange={(o) => !o && setStatusDialog(null)}>
        <DialogContent data-testid="document-status-dialog">
          <DialogHeader>
            <DialogTitle>{statusDialog === "revoke" ? "Revoke" : "Cancel"} Document</DialogTitle>
            <DialogDescription>This action is recorded in the audit trail and cannot be undone.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Reason</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={255} data-testid="document-status-reason-input" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStatusDialog(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => statusMutation.mutate()} disabled={!reason || statusMutation.isPending} data-testid="document-status-submit">
              {statusMutation.isPending ? "Saving..." : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={reissueOpen} onOpenChange={setReissueOpen}>
        <DialogContent data-testid="document-reissue-dialog">
          <DialogHeader>
            <DialogTitle>Reissue Document</DialogTitle>
            <DialogDescription>
              This will supersede {doc.document_number} with a new document number and revision {doc.revision + 1}, using the same underlying record data.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReissueOpen(false)}>Cancel</Button>
            <Button onClick={() => reissueMutation.mutate()} disabled={reissueMutation.isPending} data-testid="document-reissue-submit">
              {reissueMutation.isPending ? "Reissuing..." : "Reissue"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={signatoryOpen} onOpenChange={setSignatoryOpen}>
        <DialogContent data-testid="add-signatory-dialog">
          <DialogHeader>
            <DialogTitle>Add Signatory</DialogTitle>
            <DialogDescription>Appears on the printed document in the order added.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="space-y-2"><Label>Name</Label><Input value={signatoryForm.name} onChange={(e) => setSignatoryForm({ ...signatoryForm, name: e.target.value })} data-testid="signatory-name-input" /></div>
            <div className="space-y-2"><Label>Designation</Label><Input value={signatoryForm.designation} onChange={(e) => setSignatoryForm({ ...signatoryForm, designation: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSignatoryOpen(false)}>Cancel</Button>
            <Button onClick={() => signatoryMutation.mutate()} disabled={!signatoryForm.name || signatoryMutation.isPending} data-testid="signatory-submit">
              {signatoryMutation.isPending ? "Adding..." : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
