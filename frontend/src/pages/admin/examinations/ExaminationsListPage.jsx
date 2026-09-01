import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { api, apiErrorMessage } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useCourses, useCourseSessions, nameById } from "@/hooks/useLookups";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus } from "lucide-react";

const TYPES = ["regular", "supplementary", "improvement"];
const STATUSES = ["scheduled", "ongoing", "completed", "results_published", "cancelled"];
const EMPTY_FORM = { name: "", course_id: "", session_id: "", exam_type: "regular", start_date: "", end_date: "", status: "scheduled" };

export default function ExaminationsListPage() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission("exams.manage");
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [statusFilter, setStatusFilter] = useState("all");
  const [courseFilter, setCourseFilter] = useState("all");

  const { data: courses } = useCourses();
  const { data: formSessions } = useCourseSessions(form.course_id);

  const { data: examinations, isLoading } = useQuery({
    queryKey: ["examinations", statusFilter, courseFilter],
    queryFn: async () =>
      (
        await api.get("/examinations", {
          params: { ...(statusFilter !== "all" ? { status: statusFilter } : {}), ...(courseFilter !== "all" ? { course_id: courseFilter } : {}) },
        })
      ).data.examinations || [],
  });

  const createMutation = useMutation({
    mutationFn: async () => (await api.post("/examinations", { ...form, course_id: Number(form.course_id), session_id: Number(form.session_id) })).data,
    onSuccess: () => {
      toast.success("Examination created");
      queryClient.invalidateQueries({ queryKey: ["examinations"] });
      setOpen(false);
      setForm(EMPTY_FORM);
    },
    onError: (err) => toast.error(apiErrorMessage(err, "Could not create examination")),
  });

  return (
    <div data-testid="examinations-list-page">
      <PageHeader
        title="Examinations"
        description="Schedule and manage examinations"
        action={canManage && <Button onClick={() => setOpen(true)} data-testid="examination-create-button"><Plus className="mr-2 h-4 w-4" /> New Examination</Button>}
      />

      <div className="mb-4 flex flex-wrap gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48" data-testid="examinations-status-filter"><SelectValue placeholder="Filter by status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s.replace(/_/g, " ")}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={courseFilter} onValueChange={setCourseFilter}>
          <SelectTrigger className="w-56" data-testid="examinations-course-filter"><SelectValue placeholder="Filter by course" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All courses</SelectItem>
            {(courses || []).map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <Table data-testid="examinations-table">
          <TableHeader>
            <TableRow><TableHead>Exam Code</TableHead><TableHead>Name</TableHead><TableHead>Course</TableHead><TableHead>Type</TableHead><TableHead>Status</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {(examinations || []).length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground" data-testid="examinations-empty">No examinations found.</TableCell></TableRow>
            )}
            {(examinations || []).map((e) => (
              <TableRow key={e.id} data-testid={`examination-row-${e.id}`}>
                <TableCell>
                  <Link to={`/admin/examinations/${e.id}`} className="font-medium text-primary hover:underline" data-testid={`examination-link-${e.id}`}>{e.exam_code}</Link>
                </TableCell>
                <TableCell>{e.name}</TableCell>
                <TableCell>{nameById(courses, e.course_id)}</TableCell>
                <TableCell className="capitalize">{e.exam_type}</TableCell>
                <TableCell><StatusBadge status={e.status} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-testid="examination-create-dialog">
          <DialogHeader>
            <DialogTitle>New Examination</DialogTitle>
            <DialogDescription>Schedule a new examination for a course session.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2"><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="examination-name-input" /></div>
            <div className="space-y-2">
              <Label>Course</Label>
              <Select value={form.course_id} onValueChange={(v) => setForm({ ...form, course_id: v, session_id: "" })}>
                <SelectTrigger data-testid="examination-course-select"><SelectValue placeholder="Select a course" /></SelectTrigger>
                <SelectContent>{(courses || []).map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Session</Label>
              <Select value={form.session_id} onValueChange={(v) => setForm({ ...form, session_id: v })} disabled={!form.course_id}>
                <SelectTrigger data-testid="examination-session-select"><SelectValue placeholder="Select a session" /></SelectTrigger>
                <SelectContent>{(formSessions || []).map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.session_name} ({s.academic_year})</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={form.exam_type} onValueChange={(v) => setForm({ ...form, exam_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TYPES.map((t) => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Start Date</Label><Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></div>
            <div className="space-y-2"><Label>End Date</Label><Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending || !form.name || !form.course_id || !form.session_id}
              data-testid="examination-create-submit"
            >
              {createMutation.isPending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
