import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { useCourses } from "@/hooks/useLookups";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

const STATUSES = ["active", "completed", "withdrawn", "suspended"];

export default function EnrollmentsListPage() {
  const [status, setStatus] = useState("all");
  const [courseId, setCourseId] = useState("all");
  const { data: courses } = useCourses();

  const { data: enrollments, isLoading } = useQuery({
    queryKey: ["enrollments", status, courseId],
    queryFn: async () =>
      (
        await api.get("/enrollments", {
          params: { ...(status !== "all" ? { status } : {}), ...(courseId !== "all" ? { course_id: courseId } : {}) },
        })
      ).data.enrollments || [],
  });

  return (
    <div data-testid="enrollments-list-page">
      <PageHeader title="Enrollments" description="Active and historical course enrollments" />

      <div className="mb-4 flex flex-wrap gap-3">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-48" data-testid="enrollments-status-filter"><SelectValue placeholder="Filter by status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={courseId} onValueChange={setCourseId}>
          <SelectTrigger className="w-56" data-testid="enrollments-course-filter"><SelectValue placeholder="Filter by course" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All courses</SelectItem>
            {(courses || []).map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <Table data-testid="enrollments-table">
          <TableHeader>
            <TableRow><TableHead>Student</TableHead><TableHead>Course</TableHead><TableHead>Roll No.</TableHead><TableHead>Status</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {(enrollments || []).length === 0 && (
              <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground" data-testid="enrollments-empty">No enrollments found.</TableCell></TableRow>
            )}
            {(enrollments || []).map((e) => (
              <TableRow key={e.id} data-testid={`enrollment-row-${e.id}`}>
                <TableCell>
                  <Link to={`/admin/enrollments/${e.id}`} className="font-medium text-primary hover:underline" data-testid={`enrollment-link-${e.id}`}>
                    {e.first_name} {e.last_name}
                  </Link>
                  <div className="text-xs text-muted-foreground">{e.registration_number}</div>
                </TableCell>
                <TableCell>{e.course_name} ({e.course_code})</TableCell>
                <TableCell>{e.roll_number}</TableCell>
                <TableCell><StatusBadge status={e.status} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
