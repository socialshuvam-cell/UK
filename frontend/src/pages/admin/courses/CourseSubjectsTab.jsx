import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, apiErrorMessage } from "@/lib/api";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const EMPTY_FORM = { subject_code: "", subject_name: "", max_marks: 100, pass_marks: 40, is_elective: false, status: "active" };

export function CourseSubjectsTab({ courseId, subjects, canManage }) {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["course", String(courseId)] });

  const openCreate = () => { setEditing(null); setForm(EMPTY_FORM); setDialogOpen(true); };
  const openEdit = (s) => { setEditing(s); setForm(s); setDialogOpen(true); };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = { ...form, max_marks: Number(form.max_marks), pass_marks: Number(form.pass_marks) };
      return editing
        ? (await api.put(`/courses/${courseId}/subjects/${editing.id}`, payload)).data
        : (await api.post(`/courses/${courseId}/subjects`, payload)).data;
    },
    onSuccess: () => {
      toast.success(editing ? "Subject updated" : "Subject added");
      invalidate();
      setDialogOpen(false);
    },
    onError: (err) => toast.error(apiErrorMessage(err, "Could not save subject")),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => (await api.delete(`/courses/${courseId}/subjects/${deleteTarget.id}`)).data,
    onSuccess: () => { toast.success("Subject removed"); invalidate(); setDeleteTarget(null); },
    onError: (err) => toast.error(apiErrorMessage(err, "Could not remove subject")),
  });

  return (
    <div className="space-y-4" data-testid="course-subjects-tab">
      {canManage && <Button size="sm" onClick={openCreate} data-testid="subject-create-button">Add Subject</Button>}
      <Table data-testid="course-subjects-table">
        <TableHeader>
          <TableRow><TableHead>Code</TableHead><TableHead>Name</TableHead><TableHead>Max</TableHead><TableHead>Pass</TableHead><TableHead>Status</TableHead>{canManage && <TableHead />}</TableRow>
        </TableHeader>
        <TableBody>
          {subjects.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No subjects added.</TableCell></TableRow>}
          {subjects.map((s) => (
            <TableRow key={s.id} data-testid={`subject-row-${s.id}`}>
              <TableCell>{s.subject_code}</TableCell>
              <TableCell>{s.subject_name}</TableCell>
              <TableCell>{s.max_marks}</TableCell>
              <TableCell>{s.pass_marks}</TableCell>
              <TableCell><StatusBadge status={s.status} /></TableCell>
              {canManage && (
                <TableCell className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(s)} data-testid={`subject-edit-${s.id}`}>Edit</Button>
                  <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(s)} data-testid={`subject-delete-${s.id}`}>Delete</Button>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent data-testid="subject-dialog">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Subject" : "Add Subject"}</DialogTitle>
            <DialogDescription>Course subject and marking scheme details.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label>Code</Label><Input value={form.subject_code} onChange={(e) => setForm({ ...form, subject_code: e.target.value })} data-testid="subject-code-input" /></div>
            <div className="space-y-2"><Label>Name</Label><Input value={form.subject_name} onChange={(e) => setForm({ ...form, subject_name: e.target.value })} data-testid="subject-name-input" /></div>
            <div className="space-y-2"><Label>Max Marks</Label><Input type="number" value={form.max_marks} onChange={(e) => setForm({ ...form, max_marks: e.target.value })} /></div>
            <div className="space-y-2"><Label>Pass Marks</Label><Input type="number" value={form.pass_marks} onChange={(e) => setForm({ ...form, pass_marks: e.target.value })} /></div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} data-testid="subject-save-button">
              {saveMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title={`Delete subject "${deleteTarget?.subject_name || ""}"?`}
        confirmLabel="Delete"
        destructive
        submitting={deleteMutation.isPending}
        testId="subject-delete-dialog"
        onConfirm={() => deleteMutation.mutate()}
      />
    </div>
  );
}
