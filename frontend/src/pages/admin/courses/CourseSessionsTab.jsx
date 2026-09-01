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

const EMPTY_FORM = { session_name: "", academic_year: "", start_date: "", end_date: "", status: "upcoming" };
const STATUSES = ["upcoming", "active", "completed", "archived"];

export function CourseSessionsTab({ courseId, sessions, canManage }) {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["course", String(courseId)] });
    queryClient.invalidateQueries({ queryKey: ["lookup", "sessions", courseId] });
  };

  const openCreate = () => { setEditing(null); setForm(EMPTY_FORM); setDialogOpen(true); };
  const openEdit = (s) => { setEditing(s); setForm({ ...s, start_date: s.start_date || "", end_date: s.end_date || "" }); setDialogOpen(true); };

  const saveMutation = useMutation({
    mutationFn: async () => editing
      ? (await api.put(`/courses/${courseId}/sessions/${editing.id}`, form)).data
      : (await api.post(`/courses/${courseId}/sessions`, form)).data,
    onSuccess: () => { toast.success(editing ? "Session updated" : "Session added"); invalidate(); setDialogOpen(false); },
    onError: (err) => toast.error(apiErrorMessage(err, "Could not save session")),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => (await api.delete(`/courses/${courseId}/sessions/${deleteTarget.id}`)).data,
    onSuccess: () => { toast.success("Session removed"); invalidate(); setDeleteTarget(null); },
    onError: (err) => toast.error(apiErrorMessage(err, "Could not remove session")),
  });

  return (
    <div className="space-y-4" data-testid="course-sessions-tab">
      {canManage && <Button size="sm" onClick={openCreate} data-testid="session-create-button">Add Session</Button>}
      <Table data-testid="course-sessions-table">
        <TableHeader>
          <TableRow><TableHead>Name</TableHead><TableHead>Year</TableHead><TableHead>Start</TableHead><TableHead>End</TableHead><TableHead>Status</TableHead>{canManage && <TableHead />}</TableRow>
        </TableHeader>
        <TableBody>
          {sessions.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No sessions added.</TableCell></TableRow>}
          {sessions.map((s) => (
            <TableRow key={s.id} data-testid={`session-row-${s.id}`}>
              <TableCell>{s.session_name}</TableCell>
              <TableCell>{s.academic_year}</TableCell>
              <TableCell>{s.start_date || "-"}</TableCell>
              <TableCell>{s.end_date || "-"}</TableCell>
              <TableCell><StatusBadge status={s.status} /></TableCell>
              {canManage && (
                <TableCell className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(s)} data-testid={`session-edit-${s.id}`}>Edit</Button>
                  <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(s)} data-testid={`session-delete-${s.id}`}>Delete</Button>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent data-testid="session-dialog">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Session" : "Add Session"}</DialogTitle>
            <DialogDescription>Course session / intake details.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label>Session Name</Label><Input value={form.session_name} onChange={(e) => setForm({ ...form, session_name: e.target.value })} data-testid="session-name-input" /></div>
            <div className="space-y-2"><Label>Academic Year</Label><Input value={form.academic_year} onChange={(e) => setForm({ ...form, academic_year: e.target.value })} data-testid="session-year-input" /></div>
            <div className="space-y-2"><Label>Start Date</Label><Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></div>
            <div className="space-y-2"><Label>End Date</Label><Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} /></div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} data-testid="session-save-button">
              {saveMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title={`Delete session "${deleteTarget?.session_name || ""}"?`}
        confirmLabel="Delete"
        destructive
        submitting={deleteMutation.isPending}
        testId="session-delete-dialog"
        onConfirm={() => deleteMutation.mutate()}
      />
    </div>
  );
}
