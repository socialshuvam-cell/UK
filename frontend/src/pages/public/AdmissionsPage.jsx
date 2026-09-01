import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api, apiErrorMessage } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, ClipboardList, FileCheck, MailCheck } from "lucide-react";

const STEPS = [
  { icon: ClipboardList, title: "Submit Application", text: "Complete the online application below with your details and chosen programme." },
  { icon: FileCheck, title: "Application Review", text: "Our admissions team reviews eligibility and documentation for the selected programme." },
  { icon: MailCheck, title: "Decision & Enrollment", text: "You will be notified of the outcome and, once approved, guided through enrollment." },
];

const EMPTY_FORM = { first_name: "", last_name: "", email: "", phone: "", course_id: "", institution_id: "" };

export default function AdmissionsPage() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitted, setSubmitted] = useState(null);

  const { data: courses } = useQuery({
    queryKey: ["public-courses-apply"],
    queryFn: async () => (await api.get("/public/courses")).data.courses || [],
  });
  const { data: institutions } = useQuery({
    queryKey: ["public-institutions-apply"],
    queryFn: async () => (await api.get("/public/institutions")).data.institutions || [],
  });

  const applyMutation = useMutation({
    mutationFn: async () =>
      (
        await api.post("/admissions", {
          first_name: form.first_name,
          last_name: form.last_name,
          email: form.email || null,
          phone: form.phone || null,
          course_id: Number(form.course_id),
          institution_id: form.institution_id ? Number(form.institution_id) : null,
        })
      ).data.admission,
    onSuccess: (admission) => { setSubmitted(admission); setFieldErrors({}); },
    onError: (err) => {
      setFieldErrors(err?.response?.data?.errors || {});
      if (!err?.response?.data?.errors) apiErrorMessage(err, "Could not submit your application");
    },
  });

  if (submitted) {
    return (
      <div className="mx-auto max-w-lg px-5 py-24 text-center" data-testid="admission-success">
        <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
        <h1 className="mt-5 font-serif text-2xl font-semibold text-foreground">Application Received</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Thank you, {submitted.applicant_first_name}. Your application reference is:
        </p>
        <p className="mt-2 font-serif text-xl font-semibold text-primary" data-testid="admission-number">{submitted.admission_number}</p>
        <p className="mt-4 text-sm text-muted-foreground">Our admissions team will review your application and contact you at {submitted.email || "the phone number provided"} with next steps.</p>
      </div>
    );
  }

  return (
    <div data-testid="public-admissions-page">
      <section className="bg-navy-deep py-16">
        <div className="mx-auto max-w-4xl px-5 text-center lg:px-8">
          <span className="mx-auto mb-4 block h-[3px] w-9 bg-gold" />
          <h1 className="font-serif text-3xl font-semibold text-white sm:text-4xl">Admissions</h1>
          <p className="mt-4 text-sm text-white/60">Begin your journey with Kingswell Institute — apply online in minutes.</p>
        </div>
      </section>

      <section className="border-b border-border bg-card py-14">
        <div className="mx-auto grid max-w-5xl gap-8 px-5 sm:grid-cols-3 lg:px-8">
          {STEPS.map((s, i) => (
            <div key={s.title} className="border-t-2 border-gold pt-5">
              <div className="text-xs font-semibold uppercase tracking-wide text-gold">Step {i + 1}</div>
              <s.icon className="mt-2 h-6 w-6 text-primary" />
              <div className="mt-2 font-medium text-foreground">{s.title}</div>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="py-16">
        <div className="mx-auto max-w-2xl px-5 lg:px-8">
          <h2 className="mb-8 font-serif text-2xl font-semibold text-foreground">Application Form</h2>
          <form
            className="space-y-5"
            onSubmit={(e) => { e.preventDefault(); applyMutation.mutate(); }}
            data-testid="admission-apply-form"
          >
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>First Name</Label>
                <Input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} required data-testid="apply-first-name-input" />
                {fieldErrors.first_name && <p className="text-xs text-destructive">{fieldErrors.first_name[0]}</p>}
              </div>
              <div className="space-y-2">
                <Label>Last Name</Label>
                <Input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} required data-testid="apply-last-name-input" />
                {fieldErrors.last_name && <p className="text-xs text-destructive">{fieldErrors.last_name[0]}</p>}
              </div>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} data-testid="apply-email-input" />
                {fieldErrors.email && <p className="text-xs text-destructive">{fieldErrors.email[0]}</p>}
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} data-testid="apply-phone-input" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Programme</Label>
              <Select value={form.course_id} onValueChange={(v) => setForm({ ...form, course_id: v })}>
                <SelectTrigger data-testid="apply-course-select"><SelectValue placeholder="Select a programme" /></SelectTrigger>
                <SelectContent>{(courses || []).map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
              {fieldErrors.course_id && <p className="text-xs text-destructive">{fieldErrors.course_id[0]}</p>}
            </div>
            <div className="space-y-2">
              <Label>Preferred Institution / Centre (optional)</Label>
              <Select value={form.institution_id} onValueChange={(v) => setForm({ ...form, institution_id: v })}>
                <SelectTrigger data-testid="apply-institution-select"><SelectValue placeholder="No preference" /></SelectTrigger>
                <SelectContent>{(institutions || []).map((i) => <SelectItem key={i.id} value={String(i.id)}>{i.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <Button type="submit" size="lg" className="w-full" disabled={applyMutation.isPending || !form.first_name || !form.last_name || !form.course_id} data-testid="apply-submit-button">
              {applyMutation.isPending ? "Submitting..." : "Submit Application"}
            </Button>
          </form>
        </div>
      </section>
    </div>
  );
}
