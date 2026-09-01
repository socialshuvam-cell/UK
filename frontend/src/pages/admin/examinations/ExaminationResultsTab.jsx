import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, apiErrorMessage } from "@/lib/api";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export function ExaminationResultsTab({ examId, canPublish }) {
  const queryClient = useQueryClient();

  const { data: results, isLoading } = useQuery({
    queryKey: ["exam-results", examId],
    queryFn: async () => (await api.get(`/examinations/${examId}/results`)).data.results || [],
  });

  const publishMutation = useMutation({
    mutationFn: async (id) => (await api.put(`/results/${id}/publish`)).data,
    onSuccess: () => {
      toast.success("Result published");
      queryClient.invalidateQueries({ queryKey: ["exam-results", examId] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, "Could not publish result")),
  });

  if (isLoading) return <Skeleton className="h-40 w-full" />;

  return (
    <div data-testid="examination-results-tab">
      <p className="mb-3 text-sm text-muted-foreground">
        Results appear here after being computed from the Registrations tab. Use Publish to release a result to the student.
      </p>
      <Table data-testid="results-table">
        <TableHeader>
          <TableRow><TableHead>Student</TableHead><TableHead>Marks</TableHead><TableHead>Percentage</TableHead><TableHead>Grade</TableHead><TableHead>Status</TableHead><TableHead>Published</TableHead>{canPublish && <TableHead />}</TableRow>
        </TableHeader>
        <TableBody>
          {(results || []).length === 0 && (
            <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground" data-testid="results-empty">No results computed yet.</TableCell></TableRow>
          )}
          {(results || []).map((r) => (
            <TableRow key={r.id} data-testid={`result-row-${r.id}`}>
              <TableCell>
                {r.first_name} {r.last_name}
                <div className="text-xs text-muted-foreground">{r.registration_number}</div>
              </TableCell>
              <TableCell>{r.total_obtained_marks} / {r.total_max_marks}</TableCell>
              <TableCell>{r.percentage}%</TableCell>
              <TableCell>{r.grade}</TableCell>
              <TableCell><StatusBadge status={r.result_status} /></TableCell>
              <TableCell>{r.published_at ? new Date(r.published_at).toLocaleString() : "Not published"}</TableCell>
              {canPublish && (
                <TableCell>
                  {!r.published_at && r.result_status !== "pending" && (
                    <Button size="sm" onClick={() => publishMutation.mutate(r.id)} disabled={publishMutation.isPending} data-testid={`result-publish-${r.id}`}>
                      Publish
                    </Button>
                  )}
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
