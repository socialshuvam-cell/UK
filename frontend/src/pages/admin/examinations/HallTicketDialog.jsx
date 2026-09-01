import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export function HallTicketDialog({ open, onOpenChange, registrationId }) {
  const { data, isLoading } = useQuery({
    queryKey: ["hall-ticket", registrationId],
    queryFn: async () => (await api.get(`/exam-registrations/${registrationId}/hall-ticket`)).data.hall_ticket,
    enabled: open && !!registrationId,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl" data-testid="hall-ticket-dialog">
        <DialogHeader>
          <DialogTitle>Hall Ticket</DialogTitle>
          <DialogDescription>{data?.hall_ticket_number}</DialogDescription>
        </DialogHeader>
        {isLoading || !data ? (
          <Skeleton className="h-52 w-full" />
        ) : (
          <div className="space-y-4 text-sm" data-testid="hall-ticket-content">
            <div className="grid grid-cols-2 gap-2">
              <Row label="Student">{data.student?.first_name} {data.student?.last_name}</Row>
              <Row label="Registration No.">{data.student?.registration_number}</Row>
              <Row label="Examination">{data.examination?.name}</Row>
              <Row label="Exam Code">{data.examination?.exam_code}</Row>
              <Row label="Exam Centre">{data.exam_center || "Not assigned"}</Row>
              <Row label="Seat No.">{data.seat_number || "Not assigned"}</Row>
            </div>
            <Table>
              <TableHeader>
                <TableRow><TableHead>Subject</TableHead><TableHead>Date</TableHead><TableHead>Time</TableHead><TableHead>Max Marks</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {(data.subjects || []).length === 0 && (
                  <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No subjects scheduled yet.</TableCell></TableRow>
                )}
                {(data.subjects || []).map((s, idx) => (
                  <TableRow key={idx}>
                    <TableCell>{s.subject_code} - {s.subject_name}</TableCell>
                    <TableCell>{s.exam_date || "-"}</TableCell>
                    <TableCell>{s.start_time || "-"}</TableCell>
                    <TableCell>{s.max_marks}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, children }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium">{children}</div>
    </div>
  );
}
