import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

const STATUSES = ["prospective", "active", "graduated", "inactive"];

export default function StudentsListPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");

  const { data: students, isLoading } = useQuery({
    queryKey: ["students", search, status],
    queryFn: async () =>
      (
        await api.get("/students", {
          params: { ...(search ? { search } : {}), ...(status !== "all" ? { status } : {}) },
        })
      ).data.students || [],
  });

  return (
    <div data-testid="students-list-page">
      <PageHeader title="Students" description="Master student records" />

      <div className="mb-4 flex flex-wrap gap-3">
        <Input
          placeholder="Search by name or registration number..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
          data-testid="students-search-input"
        />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-48" data-testid="students-status-filter">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <Table data-testid="students-table">
          <TableHeader>
            <TableRow>
              <TableHead>Registration No.</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(students || []).length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground" data-testid="students-empty">
                  No students found.
                </TableCell>
              </TableRow>
            )}
            {(students || []).map((s) => (
              <TableRow key={s.id} data-testid={`student-row-${s.id}`}>
                <TableCell>
                  <Link to={`/admin/students/${s.id}`} className="font-medium text-primary hover:underline" data-testid={`student-link-${s.id}`}>
                    {s.registration_number || "-"}
                  </Link>
                </TableCell>
                <TableCell>{s.first_name} {s.last_name}</TableCell>
                <TableCell>{s.email || "-"}</TableCell>
                <TableCell><StatusBadge status={s.status} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
