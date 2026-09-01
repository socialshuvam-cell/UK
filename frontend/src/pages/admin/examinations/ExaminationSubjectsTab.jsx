import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, apiErrorMessage } from "@/lib/api";
import { useCourseSubjects } from "@/hooks/useLookups";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const EMPTY_FORM = { course_subject_id: "", exam_date: "", start_time: "", duration_minutes: "", max_marks: "", pass_marks: "" };

export function ExaminationSubjectsTab({ examId, courseId, subjects, canManage }) {
  const queryClient = useQueryClient();
  const { data: courseSubjects } = useCourseSubjects(courseId);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["examination", String(examId)] });

  const addedSubjectIds = new Set(subjects.map((s) => s.course_subject_id));
  const availableSubjects = (courseSubjects || []).filter((cs) => !addedSubjectIds.has(cs.id));

  const openCreate = () => { setEditing(null); setForm(EMPTY_FORM); setDialogOpen(true); };
  const openEdit = (s) => {
    setEditing(s);
    setForm({
      course_subject_id: String(s.course_subject_id),
      exam_date: s.exam_date || "",
      start_time: s.start_time || "",
      duration_minutes: s.duration_minutes ?? "",
      max_marks: s.max_marks ?? "",
      pass_marks: s.pass_marks ?? "",
    });
    setDialogOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        exam_date: form.exam_date || null,
        start_time: form.start_time || null,
        duration_minutes: form.duration_minutes === "" ? null : Number(form.duration_minutes),
        max_marks: form.max_marks === "" ? null : Number(form.max_marks),
        pass_marks: form.pass_marks === "" ? null : Number(form.pass_marks),
      };
      if (editing) {
        return (await api.put(`/examinations/${examId}/subjects/${editing.id}`, payload)).data;
      }
      return (await api.post(`/examinations/${examId}/subjects`, { ...payload, course_subject_id: Number(form.course_subject_id) })).data;
    },
    onSuccess: () => { toast.success(editing ? "Subject updated" : "Subject added"); invalidate(); setDialogOpen(false); },
    onError: (err) => toast.error(apiErrorMessage(err, "Could not save subject")),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => (await api.delete(`/examinations/${examId}/subjects/${deleteTarget.id}`)).data,
    onSuccess: () => { toast.success("Subject removed"); invalidate(); setDeleteTarget(null); },
    onError: (err) => toast.error(apiErrorMessage(err, "Could not remove subject")),
  });

  return (
    <div className="space-y-4" data-testid="examination-subjects-tab">
      {canManage && <Button size="sm" onClick={openCreate} data-testid="exam-subject-create-button">Add Subject</Button>}
      <Table data-testid="examination-subjects-table">
        <TableHeader>
          <TableRow><TableHead>Subject</TableHead><TableHead>Date</TableHead><TableHead>Time</TableHead><TableHead>Duration</TableHead><TableHead>Max</TableHead><TableHead>Pass</TableHead>{canManage && <TableHead />}</TableRow>
        </TableHeader>
        <TableBody>
          {subjects.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No subjects added to this examination.</TableCell></TableRow>}
          {subjects.map((s) => (
            <TableRow key={s.id} data-testid={`exam-subject-row-${s.id}`}>
              <TableCell>{s.subject_code} - {s.subject_name}</TableCell>
              <TableCell>{s.exam_date || "-"}</TableCell>
              <TableCell>{s.start_time || "-"}</TableCell>
              <TableCell>{s.duration_minutes ? `${s.duration_minutes} min` : "-"}</TableCell>
              <TableCell>{s.max_marks}</TableCell>
              <TableCell>{s.pass_marks}</TableCell>
              {canManage && (
                <TableCell className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(s)} data-testid={`exam-subject-edit-${s.id}`}>Edit</Button>
                  <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(s)} data-testid={`exam-subject-delete-${s.id}`}>Delete</Button>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent data-testid="exam-subject-dialog">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Examination Subject" : "Add Examination Subject"}</DialogTitle>
            <DialogDescription>Schedule and marking scheme for this subject within the examination.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            {!editing && (
              <div className="space-y-2 sm:col-span-2">
                <Label>Course Subject</Label>
                <Select value={form.course_subject_id} onValueChange={(v) => {
                  const cs = (courseSubjects || []).find((c) => String(c.id) === v);
                  setForm({ ...form, course_subject_id: v, max_marks: cs ? String(cs.max_marks) : "", pass_marks: cs ? String(cs.pass_marks) : "" });
                }}>
                  <SelectTrigger data-testid="exam-subject-course-subject-select"><SelectValue placeholder="Select a subject" /></SelectTrigger>
                  <SelectContent>{availableSubjects.map((cs) => <SelectItem key={cs.id} value={String(cs.id)}>{cs.subject_code} - {cs.subject_name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2"><Label>Exam Date</Label><Input type="date" value={form.exam_date} onChange={(e) => setForm({ ...form, exam_date: e.target.value })} data-testid="exam-subject-date-input" /></div>
            <div className="space-y-2"><Label>Start Time</Label><Input type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} /></div>
            <div className="space-y-2"><Label>Duration (minutes)</Label><Input type="number" value={form.duration_minutes} onChange={(e) => setForm({ ...form, duration_minutes: e.target.value })} /></div>
            <div className="space-y-2"><Label>Max Marks</Label><Input type="number" value={form.max_marks} onChange={(e) => setForm({ ...form, max_marks: e.target.value })} /></div>
            <div className="space-y-2"><Label>Pass Marks</Label><Input type="number" value={form.pass_marks} onChange={(e) => setForm({ ...form, pass_marks: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || (!editing && !form.course_subject_id)}
              data-testid="exam-subject-save-button"
            >
              {saveMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title={`Remove subject "${deleteTarget?.subject_name || ""}" from this examination?`}
        confirmLabel="Remove"
        destructive
        submitting={deleteMutation.isPending}
        testId="exam-subject-delete-dialog"
        onConfirm={() => deleteMutation.mutate()}
      />
    </div>
  );
}
