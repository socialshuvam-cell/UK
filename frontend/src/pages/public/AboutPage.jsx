import { usePublicSettings } from "@/hooks/usePublicSettings";
import { ShieldCheck, GraduationCap, BadgeCheck, Building2 } from "lucide-react";

const PILLARS = [
  { icon: GraduationCap, title: "Academic Rigour", text: "Every programme follows a structured curriculum with clearly defined subjects, credits and assessment criteria." },
  { icon: ShieldCheck, title: "Transparent Governance", text: "Admissions, examinations and results follow a documented, auditable process from application to certification." },
  { icon: BadgeCheck, title: "Verified Credentials", text: "Certificates, diplomas, degrees and transcripts are all independently verifiable online via QR code." },
  { icon: Building2, title: "A Connected Network", text: "Our institutions and examination centres operate to one common academic and administrative standard." },
];

export default function AboutPage() {
  const settings = usePublicSettings();
  return (
    <div data-testid="public-about-page">
      <section className="bg-navy-deep py-16">
        <div className="mx-auto max-w-4xl px-5 text-center lg:px-8">
          <span className="mx-auto mb-4 block h-[3px] w-9 bg-gold" />
          <h1 className="font-serif text-3xl font-semibold text-white sm:text-4xl">About {settings.institute_name}</h1>
          <p className="mt-4 text-sm uppercase tracking-[0.16em] text-gold/70">{settings.tagline}</p>
        </div>
      </section>

      <section className="py-16">
        <div className="mx-auto max-w-3xl px-5 lg:px-8">
          <p className="text-base leading-relaxed text-muted-foreground" data-testid="public-about-text">{settings.about_text}</p>
        </div>
      </section>

      <section className="border-t border-border bg-card py-16">
        <div className="mx-auto max-w-6xl px-5 lg:px-8">
          <h2 className="mb-10 text-center font-serif text-2xl font-semibold text-foreground sm:text-3xl">Our Guiding Principles</h2>
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {PILLARS.map((p) => (
              <div key={p.title} className="border-t-2 border-gold pt-5">
                <p.icon className="h-6 w-6 text-gold" />
                <div className="mt-3 font-medium text-foreground">{p.title}</div>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{p.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
