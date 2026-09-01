import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { MapPin, Mail, Phone } from "lucide-react";

export default function InstitutionsPage() {
  const { data: institutions, isLoading } = useQuery({
    queryKey: ["public-institutions"],
    queryFn: async () => (await api.get("/public/institutions")).data.institutions || [],
  });

  return (
    <div data-testid="public-institutions-page">
      <section className="bg-navy-deep py-16">
        <div className="mx-auto max-w-4xl px-5 text-center lg:px-8">
          <span className="mx-auto mb-4 block h-[3px] w-9 bg-gold" />
          <h1 className="font-serif text-3xl font-semibold text-white sm:text-4xl">Institutions &amp; Centres</h1>
          <p className="mt-4 text-sm text-white/60">The network of institutions and examination centres operating under the Kingswell standard.</p>
        </div>
      </section>

      <section className="py-16">
        <div className="mx-auto max-w-5xl px-5 lg:px-8">
          {isLoading ? (
            <div className="grid gap-6 sm:grid-cols-2"><Skeleton className="h-40 w-full" /><Skeleton className="h-40 w-full" /></div>
          ) : (institutions || []).length === 0 ? (
            <p className="text-center text-sm text-muted-foreground" data-testid="public-institutions-empty">Institution listings are being updated — please check back shortly.</p>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2" data-testid="public-institutions-list">
              {institutions.map((i) => (
                <div key={i.id} className="border border-border p-6" data-testid={`public-institution-row-${i.id}`}>
                  <div className="text-[10px] uppercase tracking-wide text-gold">{i.type}</div>
                  <div className="mt-1 font-serif text-lg font-semibold text-foreground">{i.name}</div>
                  <div className="mt-4 space-y-1.5 text-sm text-muted-foreground">
                    {(i.address || i.city) && (
                      <div className="flex items-start gap-2"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />{[i.address, i.city, i.country].filter(Boolean).join(", ")}</div>
                    )}
                    {i.contact_email && <div className="flex items-center gap-2"><Mail className="h-3.5 w-3.5 shrink-0" />{i.contact_email}</div>}
                    {i.contact_phone && <div className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 shrink-0" />{i.contact_phone}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
