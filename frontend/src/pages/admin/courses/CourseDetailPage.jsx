import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { api, apiErrorMessage } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { CourseSubjectsTab } from "@/pages/admin/courses/CourseSubjectsTab";
import { CourseSessionsTab } from "@/pages/admin/courses/CourseSessionsTab";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

const LEVELS = ["certificate", "diploma", "degree", "other"];
const EDITABLE_FIELDS = ["code", "name", "level", "category", "duration_months", "total_credits", "eligibility", "description", "status"];

export default function CourseDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { hasPermission } = useAuth();
  const canManage = hasPermission("courses.manage");

  const { data, isLoading } = useQuery({
    queryKey: ["course", id],
    queryFn: async () => (await api.get(`/courses/${id}`)).data,
  });

  const [form, setForm] = useState(null);
  useEffect(() => {
    if (data?.course) {
      const next = {};
      EDITABLE_FIELDS.forEach((f) => (next[f] = data.course[f] ?? ""));
      setForm(next);
    }
  }, [data]);

  const updateMutation = useMutation({
    mutationFn: async () => (await api.put(`/courses/${id}`, form)).data,
    onSuccess: () => {
      toast.success("Course updated");
      queryClient.invalidateQueries({ queryKey: ["course", id] });
      queryClient.invalidateQueries({ queryKey: ["courses"] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, "Could not update course")),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => (await api.delete(`/courses/${id}`)).data,
    onSuccess: () => { toast.success("Course deleted"); navigate("/admin/courses"); },
    onError: (err) => toast.error(apiErrorMessage(err, "Could not delete course")),
  });
  const [deleteOpen, setDeleteOpen] = useState(false);

  if (isLoading || !data?.course || !form) return <Skeleton className="h-64 w-full" />;

  return (
    <div data-testid="course-detail-page">
      <PageHeader
        title={data.course.name}
        description={data.course.code}
        action={canManage && <Button variant="destructive" onClick={() => setDeleteOpen(true)} data-testid="course-delete-button">Delete</Button>}
      />

      <Card className="mb-6">
        <CardHeader><CardTitle className="text-base">Details</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2"><Label>Code</Label><Input value={form.code} disabled={!canManage} onChange={(e) => setForm({ ...form, code: e.target.value })} data-testid="course-edit-code" /></div>
          <div className="space-y-2"><Label>Name</Label><Input value={form.name} disabled={!canManage} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="course-edit-name" /></div>
          <div className="space-y-2">
            <Label>Level</Label>
            <Select value={form.level} onValueChange={(v) => setForm({ ...form, level: v })} disabled={!canManage}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{LEVELS.map((l) => <SelectItem key={l} value={l} className="capitalize">{l}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })} disabled={!canManage}>
              <SelectTrigger data-testid="course-edit-status"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="space-y-2"><Label>Category</Label><Input value={form.category} disabled={!canManage} onChange={(e) => setForm({ ...form, category: e.target.value })} /></div>
          <div className="space-y-2"><Label>Duration (months)</Label><Input type="number" value={form.duration_months} disabled={!canManage} onChange={(e) => setForm({ ...form, duration_months: e.target.value })} /></div>
          <div className="space-y-2"><Label>Total Credits</Label><Input type="number" value={form.total_credits} disabled={!canManage} onChange={(e) => setForm({ ...form, total_credits: e.target.value })} /></div>
          <div className="space-y-2"><Label>Eligibility</Label><Input value={form.eligibility} disabled={!canManage} onChange={(e) => setForm({ ...form, eligibility: e.target.value })} /></div>
          {canManage && (
            <div className="sm:col-span-2">
              <Button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending} data-testid="course-save-button">
                {updateMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="subjects" data-testid="course-detail-tabs">
        <TabsList>
          <TabsTrigger value="subjects" data-testid="tab-subjects">Subjects ({data.subjects.length})</TabsTrigger>
          <TabsTrigger value="sessions" data-testid="tab-sessions">Sessions ({data.sessions.length})</TabsTrigger>
          <TabsTrigger value="institutions" data-testid="tab-institutions">Institutions ({data.institutions.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="subjects">
          <CourseSubjectsTab courseId={id} subjects={data.subjects} canManage={canManage} />
        </TabsContent>
        <TabsContent value="sessions">
          <CourseSessionsTab courseId={id} sessions={data.sessions} canManage={canManage} />
        </TabsContent>
        <TabsContent value="institutions">
          <Table data-testid="course-institutions-table">
            <TableHeader><TableRow><TableHead>Institution</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
            <TableBody>
              {data.institutions.length === 0 && <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground">Not linked to any institution yet.</TableCell></TableRow>}
              {data.institutions.map((i) => (
                <TableRow key={i.id}><TableCell>{i.name} ({i.code})</TableCell><TableCell><StatusBadge status={i.link_status} /></TableCell></TableRow>
              ))}
            </TableBody>
          </Table>
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete this course?"
        description="Courses with linked admissions/enrollments/subjects/sessions cannot be deleted."
        confirmLabel="Delete"
        destructive
        submitting={deleteMutation.isPending}
        testId="course-delete-dialog"
        onConfirm={() => deleteMutation.mutate()}
      />
    </div>
  );
}
