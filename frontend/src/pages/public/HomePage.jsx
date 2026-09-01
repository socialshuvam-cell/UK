import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { usePublicSettings } from "@/hooks/usePublicSettings";
import { Button } from "@/components/ui/button";
import { GraduationCap, ShieldCheck, Building2, ArrowRight, BadgeCheck } from "lucide-react";

const HERO_IMAGE = "https://images.unsplash.com/photo-1623632306901-e509641e7191?crop=entropy&cs=srgb&fm=jpg&q=85";
const LIBRARY_IMAGE = "https://images.unsplash.com/photo-1514513452089-17f8a9771ee8?crop=entropy&cs=srgb&fm=jpg&q=85";

const WHY_POINTS = [
  { icon: GraduationCap, title: "Rigorous Academics", text: "Structured curricula spanning certificate, diploma and degree pathways across accredited institutions." },
  { icon: ShieldCheck, title: "Transparent Examinations", text: "Independently verified marking, published results and formally issued hall tickets for every session." },
  { icon: BadgeCheck, title: "Verifiable Credentials", text: "Every certificate, diploma and transcript carries a QR code for instant public verification." },
  { icon: Building2, title: "A Network of Centres", text: "A federation of institutions and examination centres upholding one common academic standard." },
];

function labelType(level) { return (level || "").replace(/\b\w/g, (c) => c.toUpperCase()); }

export default function HomePage() {
  const settings = usePublicSettings();
  const { data: courses } = useQuery({
    queryKey: ["public-courses-home"],
    queryFn: async () => (await api.get("/public/courses")).data.courses || [],
  });

  return (
    <div data-testid="public-home-page">
      <section className="relative overflow-hidden bg-navy-deep">
        <img src={HERO_IMAGE} alt="" className="absolute inset-0 h-full w-full object-cover opacity-30" />
        <div className="absolute inset-0 bg-gradient-to-r from-navy-deep via-navy-deep/95 to-navy-deep/60" />
        <div className="relative mx-auto max-w-7xl px-5 py-24 sm:py-32 lg:px-8">
          <span className="mb-5 block h-[3px] w-12 bg-gold" />
          <h1 className="max-w-2xl font-serif text-4xl font-semibold leading-tight text-white sm:text-5xl lg:text-6xl" data-testid="home-hero-heading">
            {settings.hero_heading}
          </h1>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-white/75 sm:text-lg">{settings.hero_subheading}</p>
          <div className="mt-9 flex flex-wrap gap-4">
            <Link to="/admissions" data-testid="hero-apply-now-button">
              <Button size="lg" className="bg-gold px-7 text-navy-deep hover:bg-gold-hover">Apply Now <ArrowRight className="ml-2 h-4 w-4" /></Button>
            </Link>
            <Link to="/courses" data-testid="hero-explore-courses-button">
              <Button size="lg" variant="outline" className="border-white/30 bg-transparent px-7 text-white hover:border-gold hover:text-gold">
                Explore Programmes
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <section className="border-b border-border bg-card py-16">
        <div className="mx-auto max-w-4xl px-5 text-center lg:px-8">
          <span className="mx-auto mb-4 block h-[3px] w-9 bg-gold" />
          <h2 className="font-serif text-2xl font-semibold text-foreground sm:text-3xl">About Kingswell Institute</h2>
          <p className="mt-5 text-base leading-relaxed text-muted-foreground">{settings.about_text}</p>
          <Link to="/about" className="mt-5 inline-block text-sm font-medium text-primary hover:underline" data-testid="home-about-link">Learn more about our history &rarr;</Link>
        </div>
      </section>

      <section className="py-20">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <div className="mb-10 flex items-end justify-between border-b border-border pb-5">
            <div>
              <span className="mb-2 block h-[3px] w-9 bg-gold" />
              <h2 className="font-serif text-2xl font-semibold text-foreground sm:text-3xl">Featured Programmes</h2>
            </div>
            <Link to="/courses" className="hidden text-sm font-medium text-primary hover:underline sm:block" data-testid="home-view-all-courses">View all programmes &rarr;</Link>
          </div>

          {(courses || []).length === 0 ? (
            <p className="text-sm text-muted-foreground" data-testid="home-courses-empty">Programme listings are being updated — please check back shortly.</p>
          ) : (
            <div className="divide-y divide-border border-y border-border" data-testid="home-courses-list">
              {(courses || []).slice(0, 5).map((c) => (
                <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-5" data-testid={`home-course-row-${c.id}`}>
                  <div>
                    <div className="font-serif text-lg font-semibold text-foreground">{c.name}</div>
                    <div className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">
                      {labelType(c.level)}{c.duration_months ? ` · ${c.duration_months} months` : ""}
                    </div>
                  </div>
                  <Link to="/admissions" className="text-sm font-medium text-primary hover:underline">Apply for this programme &rarr;</Link>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="bg-navy-deep py-20">
        <div className="mx-auto grid max-w-7xl gap-12 px-5 lg:grid-cols-2 lg:px-8">
          <div>
            <span className="mb-4 block h-[3px] w-9 bg-gold" />
            <h2 className="font-serif text-2xl font-semibold text-white sm:text-3xl">Why Choose Kingswell</h2>
            <div className="mt-8 space-y-7">
              {WHY_POINTS.map((p) => (
                <div key={p.title} className="flex gap-4">
                  <p.icon className="h-6 w-6 shrink-0 text-gold" />
                  <div>
                    <div className="font-medium text-white">{p.title}</div>
                    <div className="mt-1 text-sm leading-relaxed text-white/60">{p.text}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="overflow-hidden">
            <img src={LIBRARY_IMAGE} alt="Students studying at Kingswell Institute" className="h-full w-full object-cover" style={{ minHeight: 340 }} />
          </div>
        </div>
      </section>

      <section className="py-20">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <div className="grid gap-10 sm:grid-cols-2">
            <div className="border border-border p-8">
              <h3 className="font-serif text-xl font-semibold text-foreground">Begin Your Admission</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                Submit your application online in minutes. Our admissions team reviews every application carefully and will contact you with next steps.
              </p>
              <Link to="/admissions" className="mt-5 inline-block" data-testid="cta-admissions">
                <Button>Start Your Application <ArrowRight className="ml-2 h-4 w-4" /></Button>
              </Link>
            </div>
            <div className="border border-border p-8">
              <h3 className="font-serif text-xl font-semibold text-foreground">Verify a Document</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                Employers and institutions can instantly verify the authenticity of any Kingswell certificate, diploma, transcript or hall ticket.
              </p>
              <Link to="/verify" className="mt-5 inline-block" data-testid="cta-verify">
                <Button variant="outline">Verify Document <ArrowRight className="ml-2 h-4 w-4" /></Button>
              </Link>
            </div>
          </div>

          <div className="mt-10 flex flex-col items-center justify-between gap-4 border border-gold/30 bg-secondary/40 p-8 text-center sm:flex-row sm:text-left">
            <div>
              <h3 className="font-serif text-xl font-semibold text-foreground">Already a Kingswell Student?</h3>
              <p className="mt-2 text-sm text-muted-foreground">Sign in to the Student Portal to view your enrollments, results and issued documents.</p>
            </div>
            <Link to="/login" data-testid="cta-portal-login">
              <Button size="lg">Student Login <ArrowRight className="ml-2 h-4 w-4" /></Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
