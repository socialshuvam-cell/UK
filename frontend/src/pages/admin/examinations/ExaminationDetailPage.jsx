import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { api, apiErrorMessage } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useCourses, nameById } from "@/hooks/useLookups";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { ExaminationSubjectsTab } from "@/pages/admin/examinations/ExaminationSubjectsTab";
import { ExaminationRegistrationsTab } from "@/pages/admin/examinations/ExaminationRegistrationsTab";
import { ExaminationResultsTab } from "@/pages/admin/examinations/ExaminationResultsTab";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

const TYPES = ["regular", "supplementary", "improvement"];
const STATUSES = ["scheduled", "ongoing", "completed", "results_published", "cancelled"];
const EDITABLE_FIELDS = ["name", "exam_type", "start_date", "end_date", "status"];

export default function ExaminationDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { hasPermission } = useAuth();
  const canManage = hasPermission("exams.manage");
  const canManageRegistrations = hasPermission("exam_registrations.manage");
  const canEnterMarks = hasPermission("marks.enter");
  const canVerifyMarks = hasPermission("marks.verify");
  const canPublish = hasPermission("results.publish");
  const { data: courses } = useCourses();

  const { data, isLoading } = useQuery({
    queryKey: ["examination", id],
    queryFn: async () => (await api.get(`/examinations/${id}`)).data,
  });

  const [form, setForm] = useState(null);
  useEffect(() => {
    if (data?.examination) {
      const next = {};
      EDITABLE_FIELDS.forEach((f) => (next[f] = data.examination[f] ?? ""));
      setForm(next);
    }
  }, [data]);

  const updateMutation = useMutation({
    mutationFn: async () => (await api.put(`/examinations/${id}`, form)).data,
    onSuccess: () => {
      toast.success("Examination updated");
      queryClient.invalidateQueries({ queryKey: ["examination", id] });
      queryClient.invalidateQueries({ queryKey: ["examinations"] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, "Could not update examination")),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => (await api.delete(`/examinations/${id}`)).data,
    onSuccess: () => { toast.success("Examination deleted"); navigate("/admin/examinations"); },
    onError: (err) => toast.error(apiErrorMessage(err, "Could not delete examination")),
  });
  const [deleteOpen, setDeleteOpen] = useState(false);

  if (isLoading || !data?.examination || !form) return <Skeleton className="h-64 w-full" />;
  const exam = data.examination;

  return (
    <div data-testid="examination-detail-page">
      <PageHeader
        title={exam.name}
        description={`${exam.exam_code} — ${nameById(courses, exam.course_id)}`}
        action={canManage && <Button variant="destructive" onClick={() => setDeleteOpen(true)} data-testid="examination-delete-button">Delete</Button>}
      />

      <Card className="mb-6">
        <CardHeader><CardTitle className="text-base">Details</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2"><Label>Name</Label><Input value={form.name} disabled={!canManage} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="examination-edit-name" /></div>
          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={form.exam_type} onValueChange={(v) => setForm({ ...form, exam_type: v })} disabled={!canManage}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{TYPES.map((t) => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })} disabled={!canManage}>
              <SelectTrigger data-testid="examination-edit-status"><SelectValue /></SelectTrigger>
              <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div />
          <div className="space-y-2"><Label>Start Date</Label><Input type="date" value={form.start_date || ""} disabled={!canManage} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></div>
          <div className="space-y-2"><Label>End Date</Label><Input type="date" value={form.end_date || ""} disabled={!canManage} onChange={(e) => setForm({ ...form, end_date: e.target.value })} /></div>
          {canManage && (
            <div className="sm:col-span-2">
              <Button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending} data-testid="examination-save-button">
                {updateMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="subjects" data-testid="examination-detail-tabs">
        <TabsList>
          <TabsTrigger value="subjects" data-testid="tab-exam-subjects">Subjects ({data.subjects.length})</TabsTrigger>
          <TabsTrigger value="registrations" data-testid="tab-exam-registrations">Registrations</TabsTrigger>
          <TabsTrigger value="results" data-testid="tab-exam-results">Results</TabsTrigger>
        </TabsList>
        <TabsContent value="subjects">
          <ExaminationSubjectsTab examId={id} courseId={exam.course_id} subjects={data.subjects} canManage={canManage} />
        </TabsContent>
        <TabsContent value="registrations">
          <ExaminationRegistrationsTab
            examId={id}
            courseId={exam.course_id}
            sessionId={exam.session_id}
            subjects={data.subjects}
            canManage={canManageRegistrations}
            canEnterMarks={canEnterMarks}
            canVerifyMarks={canVerifyMarks}
            canPublish={canPublish}
          />
        </TabsContent>
        <TabsContent value="results">
          <ExaminationResultsTab examId={id} canPublish={canPublish} />
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete this examination?"
        description="Examinations with linked subjects/registrations cannot be deleted — set status to cancelled instead."
        confirmLabel="Delete"
        destructive
        submitting={deleteMutation.isPending}
        testId="examination-delete-dialog"
        onConfirm={() => deleteMutation.mutate()}
      />
    </div>
  );
}
