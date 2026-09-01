import { useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { usePublicSettings } from "@/hooks/usePublicSettings";
import { Button } from "@/components/ui/button";

const NAV_LINKS = [
  { label: "Home", to: "/" },
  { label: "About", to: "/about" },
  { label: "Courses", to: "/courses" },
  { label: "Admissions", to: "/admissions" },
  { label: "Institutions", to: "/institutions" },
  { label: "Verify Document", to: "/verify" },
];

export function PublicLayout() {
  const settings = usePublicSettings();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-gold/20 bg-navy-deep">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3.5 lg:px-8">
          <Link to="/" className="flex items-center gap-2.5" data-testid="public-nav-logo">
            <img src={settings.logo_url} alt={`${settings.institute_name} crest`} className="h-9 w-9" />
            <div className="leading-tight">
              <div className="font-serif text-[15px] font-semibold text-white">{settings.institute_name}</div>
              <div className="hidden text-[9px] uppercase tracking-[0.16em] text-gold/70 sm:block">{settings.tagline}</div>
            </div>
          </Link>

          <nav className="hidden items-center gap-6 lg:flex" data-testid="public-nav-desktop">
            {NAV_LINKS.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                data-testid={`public-nav-${l.label.toLowerCase().replace(/\s+/g, "-")}`}
                className={({ isActive }) => `text-[13px] font-medium tracking-wide transition-colors ${isActive ? "text-gold" : "text-white/70 hover:text-white"}`}
              >
                {l.label}
              </NavLink>
            ))}
          </nav>

          <div className="hidden items-center gap-3 lg:flex">
            <Link to="/login" data-testid="public-nav-student-login">
              <Button variant="outline" size="sm" className="border-white/25 bg-transparent text-white hover:border-gold hover:bg-white/5 hover:text-gold">
                Student Login
              </Button>
            </Link>
            <Link to="/admissions" data-testid="public-nav-apply-now">
              <Button size="sm" className="bg-gold text-navy-deep hover:bg-gold-hover hover:text-navy-deep">
                Apply Now
              </Button>
            </Link>
          </div>

          <button className="text-white lg:hidden" onClick={() => setMenuOpen((v) => !v)} data-testid="public-nav-mobile-toggle" aria-label="Toggle menu">
            {menuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>

        {menuOpen && (
          <div className="border-t border-white/10 bg-navy-deep px-5 py-4 lg:hidden" data-testid="public-nav-mobile-menu">
            <nav className="flex flex-col gap-3.5">
              {NAV_LINKS.map((l) => (
                <NavLink key={l.to} to={l.to} onClick={() => setMenuOpen(false)} className="text-sm font-medium text-white/80 hover:text-gold">
                  {l.label}
                </NavLink>
              ))}
              <Link to="/login" onClick={() => setMenuOpen(false)} className="text-sm font-medium text-white/80 hover:text-gold">Student Login</Link>
              <Link to="/admissions" onClick={() => setMenuOpen(false)}>
                <Button size="sm" className="mt-1 w-full bg-gold text-navy-deep hover:bg-gold-hover">Apply Now</Button>
              </Link>
            </nav>
          </div>
        )}
      </header>

      <Outlet />

      <footer className="bg-navy-deep py-12 text-white/70">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <div className="grid gap-10 sm:grid-cols-3">
            <div>
              <div className="flex items-center gap-2.5">
                <img src={settings.logo_url} alt={`${settings.institute_name} crest`} className="h-8 w-8" />
                <span className="font-serif text-base font-semibold text-white">{settings.institute_name}</span>
              </div>
              <p className="mt-3 text-sm leading-relaxed">{settings.footer_text}</p>
            </div>
            <div>
              <h4 className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-gold">Quick Links</h4>
              <ul className="space-y-2 text-sm">
                {NAV_LINKS.map((l) => (
                  <li key={l.to}><Link to={l.to} className="hover:text-gold">{l.label}</Link></li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-gold">Contact</h4>
              <ul className="space-y-2 text-sm">
                {settings.contact_address && <li>{settings.contact_address}</li>}
                {settings.contact_email && <li><a href={`mailto:${settings.contact_email}`} className="hover:text-gold">{settings.contact_email}</a></li>}
                {settings.contact_phone && <li><a href={`tel:${settings.contact_phone}`} className="hover:text-gold">{settings.contact_phone}</a></li>}
              </ul>
            </div>
          </div>
          <div className="mt-10 border-t border-white/10 pt-6 text-center text-xs text-white/40">
            &copy; {new Date().getFullYear()} {settings.institute_name}
            {settings.established_year ? ` — Established ${settings.established_year}` : ""}. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
