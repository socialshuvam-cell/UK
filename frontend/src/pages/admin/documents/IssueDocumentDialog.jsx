import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { api, apiErrorMessage } from "@/lib/api";
import { useInstitutions } from "@/hooks/useLookups";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const DOC_TYPES = [
  { value: "hall_ticket", label: "Hall Ticket" },
  { value: "marksheet", label: "Marksheet" },
  { value: "transcript", label: "Transcript" },
  { value: "certificate", label: "Certificate" },
  { value: "diploma", label: "Diploma" },
  { value: "degree", label: "Degree" },
  { value: "completion_letter", label: "Completion Letter" },
  { value: "admission_letter", label: "Admission Letter" },
];
const ENROLLMENT_DOC_TYPES = ["certificate", "diploma", "degree", "completion_letter"];

function useStudentSearch(term) {
  return useQuery({
    queryKey: ["issue-doc-student-search", term],
    queryFn: async () => (await api.get("/students", { params: { search: term } })).data.students || [],
    enabled: term.length >= 2,
  });
}

function usePublishedResultsForStudent(studentId) {
  const { data: exams } = useQuery({
    queryKey: ["issue-doc-all-exams"],
    queryFn: async () => (await api.get("/examinations")).data.examinations || [],
  });
  return useQuery({
    queryKey: ["issue-doc-student-results", studentId, exams?.length],
    queryFn: async () => {
      const lists = await Promise.all(
        exams.map((e) => api.get(`/examinations/${e.id}/results`).then((r) => (r.data.results || []).map((res) => ({ ...res, exam_code: e.exam_code, exam_name: e.name }))))
      );
      return lists.flat().filter((r) => r.student_id === Number(studentId) && r.published_at);
    },
    enabled: !!studentId && !!exams,
  });
}

function StudentPicker({ value, onChange }) {
  const [term, setTerm] = useState("");
  const { data: results } = useStudentSearch(term);
  return (
    <div className="space-y-2">
      <Label>Student</Label>
      <Input placeholder="Search by name or registration number..." value={term} onChange={(e) => setTerm(e.target.value)} data-testid="issue-doc-student-search" />
      {term.length >= 2 && (
        <div className="max-h-36 overflow-y-auto rounded-sm border border-border">
          {(results || []).length === 0 && <p className="p-2 text-xs text-muted-foreground">No students found.</p>}
          {(results || []).map((s) => (
            <button
              type="button"
              key={s.id}
              onClick={() => { onChange(s); setTerm(`${s.first_name} ${s.last_name}`); }}
              className={`block w-full px-3 py-1.5 text-left text-sm hover:bg-secondary ${value?.id === s.id ? "bg-secondary" : ""}`}
              data-testid={`issue-doc-student-option-${s.id}`}
            >
              {s.first_name} {s.last_name} <span className="text-xs text-muted-foreground">({s.registration_number})</span>
            </button>
          ))}
        </div>
      )}
      {value && <p className="text-xs text-muted-foreground">Selected: {value.first_name} {value.last_name} ({value.registration_number})</p>}
    </div>
  );
}

export function IssueDocumentDialog({ open, onOpenChange }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data: institutions } = useInstitutions();
  const [docType, setDocType] = useState("");
  const [institutionId, setInstitutionId] = useState("");
  const [student, setStudent] = useState(null);
  const [examId, setExamId] = useState("");
  const [registrationId, setRegistrationId] = useState("");
  const [resultId, setResultId] = useState("");
  const [enrollmentId, setEnrollmentId] = useState("");
  const [linkedResultId, setLinkedResultId] = useState("");
  const [resultIds, setResultIds] = useState([]);
  const [admissionId, setAdmissionId] = useState("");

  const reset = () => {
    setDocType(""); setInstitutionId(""); setStudent(null); setExamId(""); setRegistrationId("");
    setResultId(""); setEnrollmentId(""); setLinkedResultId(""); setResultIds([]); setAdmissionId("");
  };

  const { data: exams } = useQuery({
    queryKey: ["issue-doc-all-exams"],
    queryFn: async () => (await api.get("/examinations")).data.examinations || [],
    enabled: open && ["hall_ticket", "marksheet"].includes(docType),
  });
  const { data: registrations } = useQuery({
    queryKey: ["issue-doc-registrations", examId],
    queryFn: async () => (await api.get(`/examinations/${examId}/registrations`)).data.registrations || [],
    enabled: !!examId && docType === "hall_ticket",
  });
  const { data: examResults } = useQuery({
    queryKey: ["issue-doc-exam-results", examId],
    queryFn: async () => (await api.get(`/examinations/${examId}/results`)).data.results || [],
    enabled: !!examId && docType === "marksheet",
  });
  const { data: enrollments } = useQuery({
    queryKey: ["issue-doc-enrollments", student?.id],
    queryFn: async () => (await api.get("/enrollments", { params: { student_id: student.id, status: "completed" } })).data.enrollments || [],
    enabled: !!student && ENROLLMENT_DOC_TYPES.includes(docType),
  });
  const { data: studentResults } = usePublishedResultsForStudent(student && (docType === "transcript" || ENROLLMENT_DOC_TYPES.includes(docType)) ? student.id : null);
  const { data: admissions } = useQuery({
    queryKey: ["issue-doc-admissions"],
    queryFn: async () => {
      const [approved, enrolled] = await Promise.all([
        api.get("/admissions", { params: { status: "approved" } }),
        api.get("/admissions", { params: { status: "enrolled" } }),
      ]);
      return [...(approved.data.admissions || []), ...(enrolled.data.admissions || [])].filter((a) => a.student_id);
    },
    enabled: open && docType === "admission_letter",
  });

  const buildPayload = () => {
    const payload = { doc_type: docType };
    if (institutionId) payload.institution_id = Number(institutionId);
    if (docType === "hall_ticket") payload.exam_registration_id = Number(registrationId);
    if (docType === "marksheet") payload.result_id = Number(resultId);
    if (docType === "transcript") { payload.student_id = student.id; payload.result_ids = resultIds.map(Number); }
    if (ENROLLMENT_DOC_TYPES.includes(docType)) {
      payload.enrollment_id = Number(enrollmentId);
      if (linkedResultId) payload.result_id = Number(linkedResultId);
    }
    if (docType === "admission_letter") payload.admission_id = Number(admissionId);
    return payload;
  };

  const isValid = () => {
    if (!docType) return false;
    if (docType === "hall_ticket") return !!registrationId;
    if (docType === "marksheet") return !!resultId;
    if (docType === "transcript") return !!student && resultIds.length > 0;
    if (ENROLLMENT_DOC_TYPES.includes(docType)) return !!enrollmentId;
    if (docType === "admission_letter") return !!admissionId;
    return false;
  };

  const issueMutation = useMutation({
    mutationFn: async () => (await api.post("/documents", buildPayload())).data.document,
    onSuccess: (doc) => {
      toast.success(`${doc.document_number} issued successfully`);
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      onOpenChange(false);
      reset();
      navigate(`/admin/documents/${doc.id}`);
    },
    onError: (err) => toast.error(apiErrorMessage(err, "Could not issue document")),
  });

  const toggleResultId = (id) => setResultIds((prev) => (prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]));

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="max-w-lg" data-testid="issue-document-dialog">
        <DialogHeader>
          <DialogTitle>Issue Document</DialogTitle>
          <DialogDescription>Document number, QR verification token and snapshot data are generated automatically by the server.</DialogDescription>
        </DialogHeader>
        <div className="max-h-[65vh] space-y-4 overflow-y-auto pr-1">
          <div className="space-y-2">
            <Label>Document Type</Label>
            <Select value={docType} onValueChange={(v) => { setDocType(v); setStudent(null); setExamId(""); setRegistrationId(""); setResultId(""); setEnrollmentId(""); setLinkedResultId(""); setResultIds([]); setAdmissionId(""); }}>
              <SelectTrigger data-testid="issue-doc-type-select"><SelectValue placeholder="Select document type" /></SelectTrigger>
              <SelectContent>{DOC_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          {docType === "hall_ticket" && (
            <>
              <div className="space-y-2">
                <Label>Examination</Label>
                <Select value={examId} onValueChange={(v) => { setExamId(v); setRegistrationId(""); }}>
                  <SelectTrigger data-testid="issue-doc-exam-select"><SelectValue placeholder="Select examination" /></SelectTrigger>
                  <SelectContent>{(exams || []).map((e) => <SelectItem key={e.id} value={String(e.id)}>{e.exam_code} - {e.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {examId && (
                <div className="space-y-2">
                  <Label>Registered Student</Label>
                  <Select value={registrationId} onValueChange={setRegistrationId}>
                    <SelectTrigger data-testid="issue-doc-registration-select"><SelectValue placeholder="Select a registration" /></SelectTrigger>
                    <SelectContent>
                      {(registrations || []).length === 0 && <div className="px-3 py-2 text-sm text-muted-foreground">No registrations for this exam.</div>}
                      {(registrations || []).map((r) => <SelectItem key={r.id} value={String(r.id)}>{r.first_name} {r.last_name} - {r.hall_ticket_number}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </>
          )}

          {docType === "marksheet" && (
            <>
              <div className="space-y-2">
                <Label>Examination</Label>
                <Select value={examId} onValueChange={(v) => { setExamId(v); setResultId(""); }}>
                  <SelectTrigger data-testid="issue-doc-exam-select"><SelectValue placeholder="Select examination" /></SelectTrigger>
                  <SelectContent>{(exams || []).map((e) => <SelectItem key={e.id} value={String(e.id)}>{e.exam_code} - {e.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {examId && (
                <div className="space-y-2">
                  <Label>Result (published only)</Label>
                  <Select value={resultId} onValueChange={setResultId}>
                    <SelectTrigger data-testid="issue-doc-result-select"><SelectValue placeholder="Select a result" /></SelectTrigger>
                    <SelectContent>
                      {(examResults || []).filter((r) => r.published_at).length === 0 && <div className="px-3 py-2 text-sm text-muted-foreground">No published results for this exam yet.</div>}
                      {(examResults || []).filter((r) => r.published_at).map((r) => (
                        <SelectItem key={r.id} value={String(r.id)}>{r.first_name} {r.last_name} - {r.percentage}% ({r.grade})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </>
          )}

          {docType === "transcript" && (
            <>
              <StudentPicker value={student} onChange={setStudent} />
              {student && (
                <div className="space-y-2">
                  <Label>Published Results to Include</Label>
                  <div className="max-h-40 space-y-1 overflow-y-auto rounded-sm border border-border p-2">
                    {(studentResults || []).length === 0 && <p className="text-xs text-muted-foreground">No published results found for this student.</p>}
                    {(studentResults || []).map((r) => (
                      <label key={r.id} className="flex items-center gap-2 text-sm" data-testid={`issue-doc-result-checkbox-${r.id}`}>
                        <Checkbox checked={resultIds.includes(r.id)} onCheckedChange={() => toggleResultId(r.id)} />
                        {r.exam_code} - {r.percentage}% ({r.grade})
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {ENROLLMENT_DOC_TYPES.includes(docType) && (
            <>
              <StudentPicker value={student} onChange={setStudent} />
              {student && (
                <div className="space-y-2">
                  <Label>Completed Enrollment</Label>
                  <Select value={enrollmentId} onValueChange={setEnrollmentId}>
                    <SelectTrigger data-testid="issue-doc-enrollment-select"><SelectValue placeholder="Select a completed enrollment" /></SelectTrigger>
                    <SelectContent>
                      {(enrollments || []).length === 0 && <div className="px-3 py-2 text-sm text-muted-foreground">No completed enrollments for this student.</div>}
                      {(enrollments || []).map((e) => <SelectItem key={e.id} value={String(e.id)}>{e.course_code} - {e.course_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {student && (
                <div className="space-y-2">
                  <Label>Link a Result (optional)</Label>
                  <Select value={linkedResultId} onValueChange={setLinkedResultId}>
                    <SelectTrigger data-testid="issue-doc-linked-result-select"><SelectValue placeholder="None" /></SelectTrigger>
                    <SelectContent>
                      {(studentResults || []).map((r) => <SelectItem key={r.id} value={String(r.id)}>{r.exam_code} - {r.percentage}% ({r.grade})</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </>
          )}

          {docType === "admission_letter" && (
            <div className="space-y-2">
              <Label>Admission</Label>
              <Select value={admissionId} onValueChange={setAdmissionId}>
                <SelectTrigger data-testid="issue-doc-admission-select"><SelectValue placeholder="Select an approved/enrolled admission" /></SelectTrigger>
                <SelectContent>
                  {(admissions || []).length === 0 && <div className="px-3 py-2 text-sm text-muted-foreground">No eligible admissions found.</div>}
                  {(admissions || []).map((a) => <SelectItem key={a.id} value={String(a.id)}>{a.applicant_first_name} {a.applicant_last_name} - {a.admission_number}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          {docType && (
            <div className="space-y-2">
              <Label>Institution (optional)</Label>
              <Select value={institutionId} onValueChange={setInstitutionId}>
                <SelectTrigger data-testid="issue-doc-institution-select"><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>{(institutions || []).map((i) => <SelectItem key={i.id} value={String(i.id)}>{i.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => issueMutation.mutate()} disabled={!isValid() || issueMutation.isPending} data-testid="issue-document-submit">
            {issueMutation.isPending ? "Issuing..." : "Issue Document"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
