import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowRight } from "lucide-react";

function labelType(level) { return (level || "").replace(/\b\w/g, (c) => c.toUpperCase()); }

export default function CoursesPage() {
  const { data: courses, isLoading } = useQuery({
    queryKey: ["public-courses"],
    queryFn: async () => (await api.get("/public/courses")).data.courses || [],
  });

  return (
    <div data-testid="public-courses-page">
      <section className="bg-navy-deep py-16">
        <div className="mx-auto max-w-4xl px-5 text-center lg:px-8">
          <span className="mx-auto mb-4 block h-[3px] w-9 bg-gold" />
          <h1 className="font-serif text-3xl font-semibold text-white sm:text-4xl">Courses &amp; Programmes</h1>
          <p className="mt-4 text-sm text-white/60">Certificate, diploma and degree pathways offered across the Kingswell network.</p>
        </div>
      </section>

      <section className="py-16">
        <div className="mx-auto max-w-4xl px-5 lg:px-8">
          {isLoading ? (
            <div className="space-y-4"><Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" /></div>
          ) : (courses || []).length === 0 ? (
            <p className="text-center text-sm text-muted-foreground" data-testid="public-courses-empty">Programme listings are being updated — please check back shortly.</p>
          ) : (
            <div className="divide-y divide-border border-y border-border" data-testid="public-courses-list">
              {courses.map((c) => (
                <div key={c.id} className="flex flex-wrap items-start justify-between gap-4 py-6" data-testid={`public-course-row-${c.id}`}>
                  <div className="max-w-xl">
                    <div className="font-serif text-xl font-semibold text-foreground">{c.name}</div>
                    <div className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">
                      {labelType(c.level)}{c.category ? ` · ${c.category}` : ""}{c.duration_months ? ` · ${c.duration_months} months` : ""}
                    </div>
                    {c.description && <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{c.description}</p>}
                  </div>
                  <Link to="/admissions" data-testid={`public-course-apply-${c.id}`}>
                    <Button variant="outline" size="sm">Apply <ArrowRight className="ml-2 h-3.5 w-3.5" /></Button>
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
