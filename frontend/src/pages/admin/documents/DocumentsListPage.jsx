import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { IssueDocumentDialog } from "@/pages/admin/documents/IssueDocumentDialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus } from "lucide-react";

const DOC_TYPES = ["hall_ticket", "marksheet", "transcript", "certificate", "diploma", "degree", "completion_letter", "admission_letter"];
const STATUSES = ["valid", "revoked", "cancelled", "superseded"];

function label(type) { return type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()); }

export default function DocumentsListPage() {
  const { hasPermission } = useAuth();
  const canIssue = hasPermission("documents.issue");
  const [docTypeFilter, setDocTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [issueOpen, setIssueOpen] = useState(false);

  const { data: documents, isLoading } = useQuery({
    queryKey: ["documents", docTypeFilter, statusFilter],
    queryFn: async () =>
      (
        await api.get("/documents", {
          params: { ...(docTypeFilter !== "all" ? { doc_type: docTypeFilter } : {}), ...(statusFilter !== "all" ? { status: statusFilter } : {}) },
        })
      ).data.documents || [],
  });

  const filtered = (documents || []).filter((d) => {
    if (!search) return true;
    const term = search.toLowerCase();
    return (
      d.document_number.toLowerCase().includes(term) ||
      `${d.first_name} ${d.last_name}`.toLowerCase().includes(term) ||
      (d.registration_number || "").toLowerCase().includes(term)
    );
  });

  return (
    <div data-testid="documents-list-page">
      <PageHeader
        title="Documents"
        description="Issue, verify and manage official student documents"
        action={canIssue && <Button onClick={() => setIssueOpen(true)} data-testid="issue-document-button"><Plus className="mr-2 h-4 w-4" /> Issue Document</Button>}
      />

      <div className="mb-4 flex flex-wrap gap-3">
        <Input
          placeholder="Search by document #, student or registration #..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-72"
          data-testid="documents-search-input"
        />
        <Select value={docTypeFilter} onValueChange={setDocTypeFilter}>
          <SelectTrigger className="w-52" data-testid="documents-type-filter"><SelectValue placeholder="Filter by type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {DOC_TYPES.map((t) => <SelectItem key={t} value={t}>{label(t)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44" data-testid="documents-status-filter"><SelectValue placeholder="Filter by status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <Table data-testid="documents-table">
          <TableHeader>
            <TableRow><TableHead>Document #</TableHead><TableHead>Student</TableHead><TableHead>Type</TableHead><TableHead>Issue Date</TableHead><TableHead>Status</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground" data-testid="documents-empty">No documents found.</TableCell></TableRow>
            )}
            {filtered.map((d) => (
              <TableRow key={d.id} data-testid={`document-row-${d.id}`}>
                <TableCell>
                  <Link to={`/admin/documents/${d.id}`} className="font-medium text-primary hover:underline" data-testid={`document-link-${d.id}`}>{d.document_number}</Link>
                </TableCell>
                <TableCell>{d.first_name} {d.last_name} <span className="text-xs text-muted-foreground">({d.registration_number})</span></TableCell>
                <TableCell>{label(d.doc_type)}</TableCell>
                <TableCell>{d.issue_date}</TableCell>
                <TableCell><StatusBadge status={d.status} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <IssueDocumentDialog open={issueOpen} onOpenChange={setIssueOpen} />
    </div>
  );
}
