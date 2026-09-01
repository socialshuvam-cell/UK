import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { api, apiErrorMessage } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
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

const LEVELS = ["certificate", "diploma", "degree", "other"];
const EMPTY_FORM = { code: "", name: "", level: "certificate", category: "", duration_months: "", total_credits: "", status: "active" };

export default function CoursesListPage() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission("courses.manage");
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const { data: courses, isLoading } = useQuery({
    queryKey: ["courses"],
    queryFn: async () => (await api.get("/courses")).data.courses || [],
  });

  const createMutation = useMutation({
    mutationFn: async () => (await api.post("/courses", form)).data,
    onSuccess: () => {
      toast.success("Course created");
      queryClient.invalidateQueries({ queryKey: ["courses"] });
      queryClient.invalidateQueries({ queryKey: ["lookup", "courses"] });
      setOpen(false);
      setForm(EMPTY_FORM);
    },
    onError: (err) => toast.error(apiErrorMessage(err, "Could not create course")),
  });

  return (
    <div data-testid="courses-list-page">
      <PageHeader
        title="Courses"
        description="Manage academic programmes"
        action={canManage && <Button onClick={() => setOpen(true)} data-testid="course-create-button"><Plus className="mr-2 h-4 w-4" /> New Course</Button>}
      />

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <Table data-testid="courses-table">
          <TableHeader>
            <TableRow><TableHead>Code</TableHead><TableHead>Name</TableHead><TableHead>Level</TableHead><TableHead>Status</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {(courses || []).length === 0 && (
              <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground" data-testid="courses-empty">No courses found.</TableCell></TableRow>
            )}
            {(courses || []).map((c) => (
              <TableRow key={c.id} data-testid={`course-row-${c.id}`}>
                <TableCell>{c.code}</TableCell>
                <TableCell>
                  <Link to={`/admin/courses/${c.id}`} className="font-medium text-primary hover:underline" data-testid={`course-link-${c.id}`}>{c.name}</Link>
                </TableCell>
                <TableCell className="capitalize">{c.level}</TableCell>
                <TableCell><StatusBadge status={c.status} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-testid="course-create-dialog">
          <DialogHeader>
            <DialogTitle>New Course</DialogTitle>
            <DialogDescription>Enter the details for the new academic programme.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label>Code</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} data-testid="course-code-input" /></div>
            <div className="space-y-2"><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="course-name-input" /></div>
            <div className="space-y-2">
              <Label>Level</Label>
              <Select value={form.level} onValueChange={(v) => setForm({ ...form, level: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{LEVELS.map((l) => <SelectItem key={l} value={l} className="capitalize">{l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Category</Label><Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></div>
            <div className="space-y-2"><Label>Duration (months)</Label><Input type="number" value={form.duration_months} onChange={(e) => setForm({ ...form, duration_months: e.target.value })} /></div>
            <div className="space-y-2"><Label>Total Credits</Label><Input type="number" value={form.total_credits} onChange={(e) => setForm({ ...form, total_credits: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !form.code || !form.name} data-testid="course-create-submit">
              {createMutation.isPending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
