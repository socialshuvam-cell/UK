import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, apiErrorMessage } from "@/lib/api";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus } from "lucide-react";

const DOC_TYPES = ["hall_ticket", "marksheet", "transcript", "certificate", "diploma", "degree", "completion_letter", "admission_letter"];
const ORIENTATIONS = ["portrait", "landscape"];
const EMPTY_FORM = { doc_type: "", name: "", paper_size: "A4", orientation: "portrait", is_active: false, html_layout: "", css_styles: "", fields_config: "" };

function label(type) { return type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()); }

export default function DocumentTemplatesPage() {
  const queryClient = useQueryClient();
  const [docTypeFilter, setDocTypeFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [jsonError, setJsonError] = useState("");

  const { data: templates, isLoading } = useQuery({
    queryKey: ["document-templates", docTypeFilter],
    queryFn: async () => (await api.get("/document-templates", { params: docTypeFilter !== "all" ? { doc_type: docTypeFilter } : {} })).data.templates || [],
  });

  const openCreate = () => { setEditing(null); setForm(EMPTY_FORM); setJsonError(""); setDialogOpen(true); };
  const openEdit = (t) => {
    setEditing(t);
    setForm({
      doc_type: t.doc_type, name: t.name, paper_size: t.paper_size, orientation: t.orientation, is_active: !!t.is_active,
      html_layout: t.html_layout || "", css_styles: t.css_styles || "", fields_config: t.fields_config ? JSON.stringify(t.fields_config, null, 2) : "",
    });
    setJsonError("");
    setDialogOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      let fieldsConfig;
      if (form.fields_config.trim()) {
        try { fieldsConfig = JSON.parse(form.fields_config); } catch { throw new Error("INVALID_JSON"); }
      }
      const payload = {
        name: form.name, paper_size: form.paper_size, orientation: form.orientation, is_active: form.is_active,
        html_layout: form.html_layout || null, css_styles: form.css_styles || null,
        ...(fieldsConfig !== undefined ? { fields_config: fieldsConfig } : {}),
      };
      if (editing) return (await api.put(`/document-templates/${editing.id}`, payload)).data;
      return (await api.post("/document-templates", { ...payload, doc_type: form.doc_type })).data;
    },
    onSuccess: () => {
      toast.success(editing ? "Template updated" : "Template created");
      queryClient.invalidateQueries({ queryKey: ["document-templates"] });
      setDialogOpen(false);
    },
    onError: (err) => {
      if (err?.message === "INVALID_JSON") { setJsonError("Fields config must be valid JSON"); return; }
      toast.error(apiErrorMessage(err, "Could not save template"));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => (await api.delete(`/document-templates/${id}`)).data,
    onSuccess: () => { toast.success("Template deleted"); queryClient.invalidateQueries({ queryKey: ["document-templates"] }); },
    onError: (err) => toast.error(apiErrorMessage(err, "Could not delete template")),
  });

  return (
    <div data-testid="document-templates-page">
      <PageHeader
        title="Document Templates"
        description="Configure the layout and active version used when issuing each document type"
        action={<Button onClick={openCreate} data-testid="template-create-button"><Plus className="mr-2 h-4 w-4" /> New Template</Button>}
      />

      <div className="mb-4">
        <Select value={docTypeFilter} onValueChange={setDocTypeFilter}>
          <SelectTrigger className="w-56" data-testid="template-type-filter"><SelectValue placeholder="Filter by type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {DOC_TYPES.map((t) => <SelectItem key={t} value={t}>{label(t)}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <Table data-testid="templates-table">
          <TableHeader>
            <TableRow><TableHead>Type</TableHead><TableHead>Name</TableHead><TableHead>Version</TableHead><TableHead>Paper</TableHead><TableHead>Active</TableHead><TableHead /></TableRow>
          </TableHeader>
          <TableBody>
            {(templates || []).length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No templates found.</TableCell></TableRow>}
            {(templates || []).map((t) => (
              <TableRow key={t.id} data-testid={`template-row-${t.id}`}>
                <TableCell>{label(t.doc_type)}</TableCell>
                <TableCell>{t.name}</TableCell>
                <TableCell>v{t.version}</TableCell>
                <TableCell>{t.paper_size} / {t.orientation}</TableCell>
                <TableCell>{t.is_active ? <StatusBadge status="active" /> : <StatusBadge status="inactive" />}</TableCell>
                <TableCell className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(t)} data-testid={`template-edit-${t.id}`}>Edit</Button>
                  <Button variant="ghost" size="sm" onClick={() => deleteMutation.mutate(t.id)} data-testid={`template-delete-${t.id}`}>Delete</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl" data-testid="template-dialog">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit Template — v${editing.version}` : "New Template"}</DialogTitle>
            <DialogDescription>Creating a new template for a document type starts a new version; the previous version is retained for already-issued documents.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[65vh] space-y-4 overflow-y-auto pr-1">
            {!editing && (
              <div className="space-y-2">
                <Label>Document Type</Label>
                <Select value={form.doc_type} onValueChange={(v) => setForm({ ...form, doc_type: v })}>
                  <SelectTrigger data-testid="template-doc-type-select"><SelectValue placeholder="Select document type" /></SelectTrigger>
                  <SelectContent>{DOC_TYPES.map((t) => <SelectItem key={t} value={t}>{label(t)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2"><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="template-name-input" /></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Paper Size</Label>
                <Input value={form.paper_size} onChange={(e) => setForm({ ...form, paper_size: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Orientation</Label>
                <Select value={form.orientation} onValueChange={(v) => setForm({ ...form, orientation: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{ORIENTATIONS.map((o) => <SelectItem key={o} value={o} className="capitalize">{o}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={form.is_active} onCheckedChange={(c) => setForm({ ...form, is_active: !!c })} data-testid="template-active-checkbox" />
              Set as the active version for this document type
            </label>
            <div className="space-y-2">
              <Label>HTML Layout (optional)</Label>
              <Textarea rows={4} value={form.html_layout} onChange={(e) => setForm({ ...form, html_layout: e.target.value })} data-testid="template-html-input" />
            </div>
            <div className="space-y-2">
              <Label>CSS Styles (optional)</Label>
              <Textarea rows={3} value={form.css_styles} onChange={(e) => setForm({ ...form, css_styles: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Fields Config (JSON, optional)</Label>
              <Textarea rows={4} value={form.fields_config} onChange={(e) => setForm({ ...form, fields_config: e.target.value })} data-testid="template-fields-config-input" />
              {jsonError && <p className="text-sm text-destructive">{jsonError}</p>}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !form.name || (!editing && !form.doc_type)} data-testid="template-save-button">
              {saveMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
