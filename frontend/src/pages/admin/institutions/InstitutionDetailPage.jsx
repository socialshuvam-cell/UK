import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { api, apiErrorMessage } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useCourses } from "@/hooks/useLookups";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const EDITABLE_FIELDS = ["code", "name", "type", "city", "country", "contact_email", "contact_phone", "status"];

export default function InstitutionDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { hasPermission } = useAuth();
  const canManage = hasPermission("institutions.manage");
  const { data: allCourses } = useCourses();

  const { data, isLoading } = useQuery({
    queryKey: ["institution", id],
    queryFn: async () => (await api.get(`/institutions/${id}`)).data,
  });

  const [form, setForm] = useState(null);
  useEffect(() => {
    if (data?.institution) {
      const next = {};
      EDITABLE_FIELDS.forEach((f) => (next[f] = data.institution[f] ?? ""));
      setForm(next);
    }
  }, [data]);

  const updateMutation = useMutation({
    mutationFn: async () => (await api.put(`/institutions/${id}`, form)).data,
    onSuccess: () => {
      toast.success("Institution updated");
      queryClient.invalidateQueries({ queryKey: ["institution", id] });
      queryClient.invalidateQueries({ queryKey: ["institutions"] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, "Could not update institution")),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => (await api.delete(`/institutions/${id}`)).data,
    onSuccess: () => {
      toast.success("Institution deleted");
      navigate("/admin/institutions");
    },
    onError: (err) => toast.error(apiErrorMessage(err, "Could not delete institution")),
  });

  const [linkOpen, setLinkOpen] = useState(false);
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const linkMutation = useMutation({
    mutationFn: async () => (await api.post(`/institutions/${id}/courses`, { course_id: Number(selectedCourseId) })).data,
    onSuccess: () => {
      toast.success("Course linked");
      queryClient.invalidateQueries({ queryKey: ["institution", id] });
      setLinkOpen(false);
      setSelectedCourseId("");
    },
    onError: (err) => toast.error(apiErrorMessage(err, "Could not link course")),
  });

  const unlinkMutation = useMutation({
    mutationFn: async (courseId) => (await api.delete(`/institutions/${id}/courses/${courseId}`)).data,
    onSuccess: () => {
      toast.success("Course unlinked");
      queryClient.invalidateQueries({ queryKey: ["institution", id] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, "Could not unlink course")),
  });

  const [deleteOpen, setDeleteOpen] = useState(false);

  if (isLoading || !data?.institution || !form) return <Skeleton className="h-64 w-full" />;
  const linkedCourseIds = new Set((data.courses || []).map((c) => c.id));
  const linkableCourses = (allCourses || []).filter((c) => !linkedCourseIds.has(c.id));

  return (
    <div data-testid="institution-detail-page">
      <PageHeader
        title={data.institution.name}
        description={data.institution.code}
        action={
          canManage && (
            <Button variant="destructive" onClick={() => setDeleteOpen(true)} data-testid="institution-delete-button">
              Delete
            </Button>
          )
        }
      />

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Details</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label>Code</Label><Input value={form.code} disabled={!canManage} onChange={(e) => setForm({ ...form, code: e.target.value })} data-testid="institution-edit-code" /></div>
            <div className="space-y-2"><Label>Name</Label><Input value={form.name} disabled={!canManage} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="institution-edit-name" /></div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })} disabled={!canManage}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="institution">Institution</SelectItem><SelectItem value="centre">Centre</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })} disabled={!canManage}>
                <SelectTrigger data-testid="institution-edit-status"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>City</Label><Input value={form.city} disabled={!canManage} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
            <div className="space-y-2"><Label>Country</Label><Input value={form.country} disabled={!canManage} onChange={(e) => setForm({ ...form, country: e.target.value })} /></div>
            <div className="space-y-2"><Label>Contact Email</Label><Input value={form.contact_email} disabled={!canManage} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} /></div>
            <div className="space-y-2"><Label>Contact Phone</Label><Input value={form.contact_phone} disabled={!canManage} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} /></div>
            {canManage && (
              <div className="sm:col-span-2">
                <Button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending} data-testid="institution-save-button">
                  {updateMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Linked Courses</CardTitle>
            {canManage && <Button size="sm" onClick={() => setLinkOpen(true)} data-testid="institution-link-course-button">Link Course</Button>}
          </CardHeader>
          <CardContent>
            <Table data-testid="institution-courses-table">
              <TableHeader><TableRow><TableHead>Course</TableHead><TableHead>Status</TableHead>{canManage && <TableHead />}</TableRow></TableHeader>
              <TableBody>
                {(data.courses || []).length === 0 && (
                  <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">No courses linked.</TableCell></TableRow>
                )}
                {(data.courses || []).map((c) => (
                  <TableRow key={c.id} data-testid={`institution-course-row-${c.id}`}>
                    <TableCell>{c.name} ({c.code})</TableCell>
                    <TableCell><StatusBadge status={c.link_status} /></TableCell>
                    {canManage && (
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={() => unlinkMutation.mutate(c.id)} data-testid={`institution-unlink-course-${c.id}`}>
                          Unlink
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent data-testid="institution-link-course-dialog">
          <DialogHeader><DialogTitle>Link a Course</DialogTitle><DialogDescription>Choose a course to offer at this institution/centre.</DialogDescription></DialogHeader>
          <Select value={selectedCourseId} onValueChange={setSelectedCourseId}>
            <SelectTrigger data-testid="institution-link-course-select"><SelectValue placeholder="Select a course" /></SelectTrigger>
            <SelectContent>
              {linkableCourses.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name} ({c.code})</SelectItem>)}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkOpen(false)}>Cancel</Button>
            <Button onClick={() => linkMutation.mutate()} disabled={!selectedCourseId || linkMutation.isPending} data-testid="institution-link-course-submit">
              {linkMutation.isPending ? "Linking..." : "Link"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete this institution?"
        description="This cannot be undone. Institutions with linked admissions/enrollments cannot be deleted."
        confirmLabel="Delete"
        destructive
        submitting={deleteMutation.isPending}
        testId="institution-delete-dialog"
        onConfirm={() => deleteMutation.mutate()}
      />
    </div>
  );
}
