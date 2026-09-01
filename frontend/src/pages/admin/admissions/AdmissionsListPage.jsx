import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { useCourses, nameById } from "@/hooks/useLookups";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

const STATUSES = ["submitted", "under_review", "approved", "rejected", "cancelled", "enrolled"];

export default function AdmissionsListPage() {
  const [status, setStatus] = useState("all");
  const { data: courses } = useCourses();

  const { data: admissions, isLoading } = useQuery({
    queryKey: ["admissions", status],
    queryFn: async () => (await api.get("/admissions", { params: status !== "all" ? { status } : {} })).data.admissions || [],
  });

  return (
    <div data-testid="admissions-list-page">
      <PageHeader title="Admissions" description="Review and process admission applications" />

      <div className="mb-4 w-48">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger data-testid="admissions-status-filter">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s} className="capitalize">{s.replace(/_/g, " ")}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <Table data-testid="admissions-table">
          <TableHeader>
            <TableRow>
              <TableHead>Admission #</TableHead>
              <TableHead>Applicant</TableHead>
              <TableHead>Course</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Submitted</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(admissions || []).length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground" data-testid="admissions-empty">
                  No admissions found.
                </TableCell>
              </TableRow>
            )}
            {(admissions || []).map((a) => (
              <TableRow key={a.id} data-testid={`admission-row-${a.id}`}>
                <TableCell>
                  <Link to={`/admin/admissions/${a.id}`} className="font-medium text-primary hover:underline" data-testid={`admission-link-${a.id}`}>
                    {a.admission_number}
                  </Link>
                </TableCell>
                <TableCell>{a.applicant_first_name} {a.applicant_last_name}</TableCell>
                <TableCell>{nameById(courses, a.course_id, "name")}</TableCell>
                <TableCell><StatusBadge status={a.status} /></TableCell>
                <TableCell>{a.submitted_at ? new Date(a.submitted_at).toLocaleDateString() : "-"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
