import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import { api, apiErrorMessage } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

const STATUSES = ["prospective", "active", "graduated", "inactive"];
const GENDERS = ["male", "female", "other", "undisclosed"];
const DOC_TYPES = ["photo", "id_proof", "previous_qualification", "other"];

const EDITABLE_FIELDS = [
  "first_name", "last_name", "dob", "gender", "email", "phone", "address", "city",
  "country", "nationality", "guardian_name", "guardian_phone", "id_proof_type", "id_proof_number", "status",
];

export default function StudentDetailPage() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const { hasPermission } = useAuth();
  const canManage = hasPermission("students.manage");

  const { data, isLoading } = useQuery({
    queryKey: ["student", id],
    queryFn: async () => (await api.get(`/students/${id}`)).data,
  });

  const [form, setForm] = useState(null);
  useEffect(() => {
    if (data?.student) {
      const next = {};
      EDITABLE_FIELDS.forEach((f) => (next[f] = data.student[f] ?? ""));
      setForm(next);
    }
  }, [data]);

  const updateMutation = useMutation({
    mutationFn: async () => (await api.put(`/students/${id}`, form)).data,
    onSuccess: () => {
      toast.success("Student profile updated");
      queryClient.invalidateQueries({ queryKey: ["student", id] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, "Could not update student")),
  });

  const [docType, setDocType] = useState("id_proof");
  const [file, setFile] = useState(null);
  const uploadMutation = useMutation({
    mutationFn: async () => {
      const body = new FormData();
      body.append("doc_type", docType);
      body.append("file", file);
      return (await api.post(`/students/${id}/documents`, body)).data;
    },
    onSuccess: () => {
      toast.success("Document uploaded");
      setFile(null);
      queryClient.invalidateQueries({ queryKey: ["student", id] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, "Upload failed")),
  });

  if (isLoading || !data?.student || !form) return <Skeleton className="h-64 w-full" />;
  const { student, enrollments, documents } = data;

  return (
    <div data-testid="student-detail-page">
      <PageHeader
        title={`${student.first_name} ${student.last_name}`}
        description={student.registration_number || "No registration number assigned yet"}
      />

      <Tabs defaultValue="profile" data-testid="student-detail-tabs">
        <TabsList>
          <TabsTrigger value="profile" data-testid="tab-profile">Profile</TabsTrigger>
          <TabsTrigger value="enrollments" data-testid="tab-enrollments">Enrollments ({enrollments.length})</TabsTrigger>
          <TabsTrigger value="documents" data-testid="tab-documents">Documents ({documents.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <Card>
            <CardHeader><CardTitle className="text-base">Profile Information</CardTitle></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field label="First Name">
                <Input value={form.first_name} disabled={!canManage} onChange={(e) => setForm({ ...form, first_name: e.target.value })} data-testid="student-first-name-input" />
              </Field>
              <Field label="Last Name">
                <Input value={form.last_name} disabled={!canManage} onChange={(e) => setForm({ ...form, last_name: e.target.value })} data-testid="student-last-name-input" />
              </Field>
              <Field label="Email">
                <Input value={form.email} disabled={!canManage} onChange={(e) => setForm({ ...form, email: e.target.value })} data-testid="student-email-input" />
              </Field>
              <Field label="Phone">
                <Input value={form.phone} disabled={!canManage} onChange={(e) => setForm({ ...form, phone: e.target.value })} data-testid="student-phone-input" />
              </Field>
              <Field label="Date of Birth">
                <Input type="date" value={form.dob || ""} disabled={!canManage} onChange={(e) => setForm({ ...form, dob: e.target.value })} data-testid="student-dob-input" />
              </Field>
              <Field label="Gender">
                <Select value={form.gender || ""} onValueChange={(v) => setForm({ ...form, gender: v })} disabled={!canManage}>
                  <SelectTrigger data-testid="student-gender-select"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{GENDERS.map((g) => <SelectItem key={g} value={g} className="capitalize">{g}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Address"><Input value={form.address} disabled={!canManage} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
              <Field label="City"><Input value={form.city} disabled={!canManage} onChange={(e) => setForm({ ...form, city: e.target.value })} /></Field>
              <Field label="Country"><Input value={form.country} disabled={!canManage} onChange={(e) => setForm({ ...form, country: e.target.value })} /></Field>
              <Field label="Nationality"><Input value={form.nationality} disabled={!canManage} onChange={(e) => setForm({ ...form, nationality: e.target.value })} /></Field>
              <Field label="Guardian Name"><Input value={form.guardian_name} disabled={!canManage} onChange={(e) => setForm({ ...form, guardian_name: e.target.value })} /></Field>
              <Field label="Guardian Phone"><Input value={form.guardian_phone} disabled={!canManage} onChange={(e) => setForm({ ...form, guardian_phone: e.target.value })} /></Field>
              <Field label="ID Proof Type"><Input value={form.id_proof_type} disabled={!canManage} onChange={(e) => setForm({ ...form, id_proof_type: e.target.value })} /></Field>
              <Field label="ID Proof Number"><Input value={form.id_proof_number} disabled={!canManage} onChange={(e) => setForm({ ...form, id_proof_number: e.target.value })} /></Field>
              <Field label="Status">
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })} disabled={!canManage}>
                  <SelectTrigger data-testid="student-status-select"><SelectValue /></SelectTrigger>
                  <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              {canManage && (
                <div className="sm:col-span-2">
                  <Button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending} data-testid="student-save-button">
                    {updateMutation.isPending ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="enrollments">
          <Table data-testid="student-enrollments-table">
            <TableHeader>
              <TableRow>
                <TableHead>Course</TableHead>
                <TableHead>Session</TableHead>
                <TableHead>Roll No.</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {enrollments.length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No enrollments yet.</TableCell></TableRow>
              )}
              {enrollments.map((e) => (
                <TableRow key={e.id} data-testid={`enrollment-row-${e.id}`}>
                  <TableCell>{e.course_name} ({e.course_code})</TableCell>
                  <TableCell>{e.session_name}</TableCell>
                  <TableCell>{e.roll_number}</TableCell>
                  <TableCell><StatusBadge status={e.status} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TabsContent>

        <TabsContent value="documents" className="space-y-4">
          {canManage && (
            <Card>
              <CardHeader><CardTitle className="text-base">Upload Document</CardTitle></CardHeader>
              <CardContent className="flex flex-wrap items-end gap-3">
                <div className="space-y-2">
                  <Label>Document Type</Label>
                  <Select value={docType} onValueChange={setDocType}>
                    <SelectTrigger className="w-48" data-testid="student-doc-type-select"><SelectValue /></SelectTrigger>
                    <SelectContent>{DOC_TYPES.map((d) => <SelectItem key={d} value={d} className="capitalize">{d.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>File</Label>
                  <Input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} data-testid="student-doc-file-input" />
                </div>
                <Button onClick={() => uploadMutation.mutate()} disabled={!file || uploadMutation.isPending} data-testid="student-doc-upload-button">
                  {uploadMutation.isPending ? "Uploading..." : "Upload"}
                </Button>
              </CardContent>
            </Card>
          )}

          <Table data-testid="student-documents-table">
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>File</TableHead>
                <TableHead>Uploaded</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {documents.length === 0 && (
                <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">No documents uploaded.</TableCell></TableRow>
              )}
              {documents.map((d) => (
                <TableRow key={d.id} data-testid={`document-row-${d.id}`}>
                  <TableCell className="capitalize">{d.doc_type.replace(/_/g, " ")}</TableCell>
                  <TableCell>
                    <a href={`/${d.file_path}`} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                      {d.original_name || "View"}
                    </a>
                  </TableCell>
                  <TableCell>{new Date(d.created_at).toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
