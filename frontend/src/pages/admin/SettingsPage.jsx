import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, apiErrorMessage } from "@/lib/api";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

const FIELDS = [
  { key: "institute_name", label: "Institute Name" },
  { key: "tagline", label: "Tagline" },
  { key: "logo_url", label: "Logo URL" },
  { key: "established_year", label: "Established Year" },
  { key: "contact_email", label: "Contact Email" },
  { key: "contact_phone", label: "Contact Phone" },
  { key: "contact_address", label: "Contact Address" },
  { key: "social_facebook", label: "Facebook URL" },
  { key: "social_twitter", label: "Twitter / X URL" },
  { key: "social_linkedin", label: "LinkedIn URL" },
];
const TEXTAREA_FIELDS = [
  { key: "hero_heading", label: "Homepage Hero Heading" },
  { key: "hero_subheading", label: "Homepage Hero Subheading" },
  { key: "about_text", label: "About / Introduction Text" },
  { key: "footer_text", label: "Footer Description" },
];

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["admin-settings"],
    queryFn: async () => (await api.get("/settings")).data.settings || {},
  });
  const [form, setForm] = useState(null);

  useEffect(() => { if (data) setForm(data); }, [data]);

  const saveMutation = useMutation({
    mutationFn: async () => (await api.put("/settings", form)).data,
    onSuccess: () => {
      toast.success("Site settings updated");
      queryClient.invalidateQueries({ queryKey: ["admin-settings"] });
      queryClient.invalidateQueries({ queryKey: ["public-settings"] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, "Could not save settings")),
  });

  if (isLoading || !form) return <Skeleton className="h-64 w-full" />;

  return (
    <div data-testid="admin-settings-page">
      <PageHeader title="Site Settings" description="White-label branding shown on the public website, without touching code" />
      <div className="space-y-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Identity & Contact</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {FIELDS.map((f) => (
              <div className="space-y-2" key={f.key}>
                <Label>{f.label}</Label>
                <Input value={form[f.key] || ""} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} data-testid={`settings-${f.key}-input`} />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Homepage Copy</CardTitle></CardHeader>
          <CardContent className="grid gap-4">
            {TEXTAREA_FIELDS.map((f) => (
              <div className="space-y-2" key={f.key}>
                <Label>{f.label}</Label>
                <Textarea rows={3} value={form[f.key] || ""} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} data-testid={`settings-${f.key}-input`} />
              </div>
            ))}
          </CardContent>
        </Card>

        <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} data-testid="settings-save-button">
          {saveMutation.isPending ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </div>
  );
}
