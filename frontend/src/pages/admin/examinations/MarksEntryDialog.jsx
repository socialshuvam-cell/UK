import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, apiErrorMessage } from "@/lib/api";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export function MarksEntryDialog({ open, onOpenChange, registration, subjects, canEnter, canVerify }) {
  const queryClient = useQueryClient();
  const [rows, setRows] = useState({});

  const { data: marks, isLoading } = useQuery({
    queryKey: ["marks", registration?.id],
    queryFn: async () => (await api.get(`/exam-registrations/${registration.id}/marks`)).data.marks || [],
    enabled: open && !!registration,
  });

  useEffect(() => {
    if (marks) {
      const next = {};
      subjects.forEach((s) => {
        const existing = marks.find((m) => m.examination_subject_id === s.id);
        next[s.id] = {
          marks_obtained: existing && !existing.is_absent ? String(existing.marks_obtained) : "",
          is_absent: existing ? !!existing.is_absent : false,
          markId: existing?.id ?? null,
          verified_by: existing?.verified_by ?? null,
        };
      });
      setRows(next);
    }
  }, [marks, subjects]);

  const saveMutation = useMutation({
    mutationFn: async (subjectId) => {
      const row = rows[subjectId];
      return (
        await api.post(`/exam-registrations/${registration.id}/marks`, {
          examination_subject_id: subjectId,
          is_absent: row.is_absent,
          marks_obtained: row.is_absent ? null : row.marks_obtained === "" ? null : Number(row.marks_obtained),
        })
      ).data;
    },
    onSuccess: () => {
      toast.success("Marks saved");
      queryClient.invalidateQueries({ queryKey: ["marks", registration.id] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, "Could not save marks")),
  });

  const verifyMutation = useMutation({
    mutationFn: async (markId) => (await api.put(`/marks/${markId}/verify`)).data,
    onSuccess: () => {
      toast.success("Marks verified");
      queryClient.invalidateQueries({ queryKey: ["marks", registration.id] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, "Could not verify marks")),
  });

  const setRow = (subjectId, patch) => setRows((prev) => ({ ...prev, [subjectId]: { ...prev[subjectId], ...patch } }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" data-testid="marks-entry-dialog">
        <DialogHeader>
          <DialogTitle>Enter Marks — {registration?.first_name} {registration?.last_name}</DialogTitle>
          <DialogDescription>Hall ticket {registration?.hall_ticket_number}</DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <Table data-testid="marks-entry-table">
            <TableHeader>
              <TableRow><TableHead>Subject</TableHead><TableHead>Marks</TableHead><TableHead>Absent</TableHead><TableHead /></TableRow>
            </TableHeader>
            <TableBody>
              {subjects.map((s) => {
                const row = rows[s.id] || { marks_obtained: "", is_absent: false };
                const verified = !!row.verified_by;
                return (
                  <TableRow key={s.id} data-testid={`marks-row-${s.id}`}>
                    <TableCell>
                      {s.subject_code}
                      <div className="text-xs text-muted-foreground">Max {s.max_marks} / Pass {s.pass_marks}</div>
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        className="w-24"
                        value={row.marks_obtained}
                        disabled={!canEnter || row.is_absent || verified}
                        onChange={(e) => setRow(s.id, { marks_obtained: e.target.value })}
                        data-testid={`marks-input-${s.id}`}
                      />
                    </TableCell>
                    <TableCell>
                      <Checkbox
                        checked={row.is_absent}
                        disabled={!canEnter || verified}
                        onCheckedChange={(checked) => setRow(s.id, { is_absent: !!checked })}
                        data-testid={`marks-absent-checkbox-${s.id}`}
                      />
                    </TableCell>
                    <TableCell className="flex gap-2">
                      {verified ? (
                        <Badge variant="default" data-testid={`marks-verified-badge-${s.id}`}>Verified</Badge>
                      ) : (
                        <>
                          {canEnter && (
                            <Button size="sm" variant="outline" onClick={() => saveMutation.mutate(s.id)} disabled={saveMutation.isPending} data-testid={`marks-save-${s.id}`}>
                              Save
                            </Button>
                          )}
                          {canVerify && row.markId && (
                            <Button size="sm" onClick={() => verifyMutation.mutate(row.markId)} disabled={verifyMutation.isPending} data-testid={`marks-verify-${s.id}`}>
                              Verify
                            </Button>
                          )}
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </DialogContent>
    </Dialog>
  );
}
