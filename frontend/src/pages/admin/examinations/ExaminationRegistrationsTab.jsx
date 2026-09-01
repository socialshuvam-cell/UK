import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, apiErrorMessage } from "@/lib/api";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { MarksEntryDialog } from "@/pages/admin/examinations/MarksEntryDialog";
import { HallTicketDialog } from "@/pages/admin/examinations/HallTicketDialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const STATUSES = ["registered", "admitted", "appeared", "absent", "debarred"];

export function ExaminationRegistrationsTab({ examId, courseId, sessionId, subjects, canManage, canEnterMarks, canVerifyMarks, canPublish }) {
  const queryClient = useQueryClient();
  const [registerOpen, setRegisterOpen] = useState(false);
  const [selectedEnrollmentId, setSelectedEnrollmentId] = useState("");
  const [examCenter, setExamCenter] = useState("");
  const [statusTarget, setStatusTarget] = useState(null);
  const [statusForm, setStatusForm] = useState({ status: "", exam_center: "", seat_number: "" });
  const [marksTarget, setMarksTarget] = useState(null);
  const [hallTicketTarget, setHallTicketTarget] = useState(null);

  const { data: registrations, isLoading } = useQuery({
    queryKey: ["exam-registrations", examId],
    queryFn: async () => (await api.get(`/examinations/${examId}/registrations`)).data.registrations || [],
  });

  const { data: eligibleEnrollments } = useQuery({
    queryKey: ["eligible-enrollments", examId, courseId, sessionId],
    queryFn: async () => (await api.get("/enrollments", { params: { course_id: courseId, session_id: sessionId, status: "active" } })).data.enrollments || [],
    enabled: registerOpen && !!courseId && !!sessionId,
  });

  const registeredStudentIds = new Set((registrations || []).map((r) => r.student_id));
  const eligibleOptions = (eligibleEnrollments || []).filter((e) => !registeredStudentIds.has(e.student_id));

  const registerMutation = useMutation({
    mutationFn: async () =>
      (await api.post(`/examinations/${examId}/registrations`, { enrollment_id: Number(selectedEnrollmentId), exam_center: examCenter || null })).data,
    onSuccess: () => {
      toast.success("Student registered for examination");
      queryClient.invalidateQueries({ queryKey: ["exam-registrations", examId] });
      setRegisterOpen(false);
      setSelectedEnrollmentId("");
      setExamCenter("");
    },
    onError: (err) => toast.error(apiErrorMessage(err, "Could not register student")),
  });

  const statusMutation = useMutation({
    mutationFn: async () => (await api.put(`/exam-registrations/${statusTarget.id}`, statusForm)).data,
    onSuccess: () => {
      toast.success("Registration updated");
      queryClient.invalidateQueries({ queryKey: ["exam-registrations", examId] });
      setStatusTarget(null);
    },
    onError: (err) => toast.error(apiErrorMessage(err, "Could not update registration")),
  });

  const computeMutation = useMutation({
    mutationFn: async (regId) => (await api.post(`/exam-registrations/${regId}/compute-result`)).data.result,
    onSuccess: (result) => {
      toast.success(`Result computed: ${result.percentage}% — Grade ${result.grade} (${result.result_status})`);
      queryClient.invalidateQueries({ queryKey: ["exam-results", examId] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, "Could not compute result")),
  });

  const openStatusDialog = (r) => {
    setStatusTarget(r);
    setStatusForm({ status: r.status, exam_center: r.exam_center || "", seat_number: r.seat_number || "" });
  };

  return (
    <div className="space-y-4" data-testid="examination-registrations-tab">
      {canManage && <Button size="sm" onClick={() => setRegisterOpen(true)} data-testid="registration-create-button">Register Student</Button>}

      {isLoading ? null : (
        <Table data-testid="registrations-table">
          <TableHeader>
            <TableRow><TableHead>Student</TableHead><TableHead>Hall Ticket</TableHead><TableHead>Status</TableHead><TableHead /></TableRow>
          </TableHeader>
          <TableBody>
            {(registrations || []).length === 0 && (
              <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground" data-testid="registrations-empty">No students registered yet.</TableCell></TableRow>
            )}
            {(registrations || []).map((r) => (
              <TableRow key={r.id} data-testid={`registration-row-${r.id}`}>
                <TableCell>
                  {r.first_name} {r.last_name}
                  <div className="text-xs text-muted-foreground">{r.registration_number}</div>
                </TableCell>
                <TableCell>{r.hall_ticket_number}</TableCell>
                <TableCell><StatusBadge status={r.status} /></TableCell>
                <TableCell className="flex flex-wrap gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setHallTicketTarget(r.id)} data-testid={`registration-hall-ticket-${r.id}`}>Hall Ticket</Button>
                  {(canEnterMarks || canVerifyMarks) && (
                    <Button variant="ghost" size="sm" onClick={() => setMarksTarget(r)} data-testid={`registration-marks-${r.id}`}>Marks</Button>
                  )}
                  {canPublish && (
                    <Button variant="ghost" size="sm" onClick={() => computeMutation.mutate(r.id)} disabled={computeMutation.isPending} data-testid={`registration-compute-result-${r.id}`}>
                      Compute Result
                    </Button>
                  )}
                  {canManage && (
                    <Button variant="ghost" size="sm" onClick={() => openStatusDialog(r)} data-testid={`registration-status-${r.id}`}>Status</Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={registerOpen} onOpenChange={setRegisterOpen}>
        <DialogContent data-testid="registration-create-dialog">
          <DialogHeader>
            <DialogTitle>Register Student</DialogTitle>
            <DialogDescription>Select an active enrollment eligible for this examination's course/session.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Enrollment</Label>
              <Select value={selectedEnrollmentId} onValueChange={setSelectedEnrollmentId}>
                <SelectTrigger data-testid="registration-enrollment-select"><SelectValue placeholder="Select a student" /></SelectTrigger>
                <SelectContent>
                  {eligibleOptions.length === 0 && <div className="px-3 py-2 text-sm text-muted-foreground">No eligible active enrollments found.</div>}
                  {eligibleOptions.map((e) => (
                    <SelectItem key={e.id} value={String(e.id)}>{e.first_name} {e.last_name} ({e.registration_number})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Exam Centre (optional)</Label><Input value={examCenter} onChange={(e) => setExamCenter(e.target.value)} data-testid="registration-exam-center-input" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRegisterOpen(false)}>Cancel</Button>
            <Button onClick={() => registerMutation.mutate()} disabled={!selectedEnrollmentId || registerMutation.isPending} data-testid="registration-create-submit">
              {registerMutation.isPending ? "Registering..." : "Register"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!statusTarget} onOpenChange={(o) => !o && setStatusTarget(null)}>
        <DialogContent data-testid="registration-status-dialog">
          <DialogHeader>
            <DialogTitle>Update Registration</DialogTitle>
            <DialogDescription>Change status, exam centre or seat number.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={statusForm.status} onValueChange={(v) => setStatusForm({ ...statusForm, status: v })}>
                <SelectTrigger data-testid="registration-status-select"><SelectValue /></SelectTrigger>
                <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Exam Centre</Label><Input value={statusForm.exam_center} onChange={(e) => setStatusForm({ ...statusForm, exam_center: e.target.value })} /></div>
            <div className="space-y-2"><Label>Seat Number</Label><Input value={statusForm.seat_number} onChange={(e) => setStatusForm({ ...statusForm, seat_number: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStatusTarget(null)}>Cancel</Button>
            <Button onClick={() => statusMutation.mutate()} disabled={statusMutation.isPending} data-testid="registration-status-submit">
              {statusMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <MarksEntryDialog
        open={!!marksTarget}
        onOpenChange={(o) => !o && setMarksTarget(null)}
        registration={marksTarget}
        subjects={subjects}
        canEnter={canEnterMarks}
        canVerify={canVerifyMarks}
      />

      <HallTicketDialog open={!!hallTicketTarget} onOpenChange={(o) => !o && setHallTicketTarget(null)} registrationId={hallTicketTarget} />
    </div>
  );
}
