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

const EMPTY_FORM = { code: "", name: "", type: "centre", city: "", country: "", contact_email: "", contact_phone: "", status: "active" };

export default function InstitutionsListPage() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission("institutions.manage");
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const { data: institutions, isLoading } = useQuery({
    queryKey: ["institutions"],
    queryFn: async () => (await api.get("/institutions")).data.institutions || [],
  });

  const createMutation = useMutation({
    mutationFn: async () => (await api.post("/institutions", form)).data,
    onSuccess: () => {
      toast.success("Institution created");
      queryClient.invalidateQueries({ queryKey: ["institutions"] });
      queryClient.invalidateQueries({ queryKey: ["lookup", "institutions"] });
      setOpen(false);
      setForm(EMPTY_FORM);
    },
    onError: (err) => toast.error(apiErrorMessage(err, "Could not create institution")),
  });

  return (
    <div data-testid="institutions-list-page">
      <PageHeader
        title="Institutions / Centres"
        description="Manage institutions and examination centres"
        action={
          canManage && (
            <Button onClick={() => setOpen(true)} data-testid="institution-create-button">
              <Plus className="mr-2 h-4 w-4" /> New Institution
            </Button>
          )
        }
      />

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <Table data-testid="institutions-table">
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>City</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(institutions || []).length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground" data-testid="institutions-empty">No institutions found.</TableCell></TableRow>
            )}
            {(institutions || []).map((i) => (
              <TableRow key={i.id} data-testid={`institution-row-${i.id}`}>
                <TableCell>{i.code}</TableCell>
                <TableCell>
                  <Link to={`/admin/institutions/${i.id}`} className="font-medium text-primary hover:underline" data-testid={`institution-link-${i.id}`}>
                    {i.name}
                  </Link>
                </TableCell>
                <TableCell className="capitalize">{i.type}</TableCell>
                <TableCell>{i.city || "-"}</TableCell>
                <TableCell><StatusBadge status={i.status} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-testid="institution-create-dialog">
          <DialogHeader>
            <DialogTitle>New Institution / Centre</DialogTitle>
            <DialogDescription>Enter the details for the new institution or examination centre.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label>Code</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} data-testid="institution-code-input" /></div>
            <div className="space-y-2"><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="institution-name-input" /></div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="institution">Institution</SelectItem><SelectItem value="centre">Centre</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>City</Label><Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
            <div className="space-y-2"><Label>Country</Label><Input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} /></div>
            <div className="space-y-2"><Label>Contact Email</Label><Input value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} /></div>
            <div className="space-y-2"><Label>Contact Phone</Label><Input value={form.contact_phone} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !form.code || !form.name} data-testid="institution-create-submit">
              {createMutation.isPending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
