import { NavLink, Outlet } from "react-router-dom";
import { LogOut, Menu } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetDescription, SheetTrigger } from "@/components/ui/sheet";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

function initials(user) {
  return `${user?.first_name?.[0] || ""}${user?.last_name?.[0] || ""}`.toUpperCase();
}

function Crest() {
  return (
    <div className="flex h-16 items-center gap-2.5 border-b border-gold/20 px-5" data-testid="sidebar-brand">
      <img src="/assets/kingswell-logo.png" alt="Kingswell Institute crest" className="h-9 w-9" />
      <div className="leading-tight">
        <div className="font-serif text-[15px] font-semibold tracking-wide text-white">Kingswell</div>
        <div className="text-[10px] uppercase tracking-[0.18em] text-gold/70">Institute</div>
      </div>
    </div>
  );
}

function NavList({ items, onNavigate }) {
  const { hasPermission } = useAuth();
  const visible = items.filter((item) => !item.permission || hasPermission(item.permission));
  return (
    <nav className="flex flex-col gap-0.5 p-3" data-testid="sidebar-nav">
      {visible.map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          end
          onClick={onNavigate}
          data-testid={item.testId}
          className={({ isActive }) =>
            cn(
              "flex items-center gap-3 rounded-sm border-l-2 px-3 py-2.5 text-[13.5px] font-medium tracking-wide transition-colors duration-150",
              isActive
                ? "border-gold bg-white/[0.06] text-white"
                : "border-transparent text-white/55 hover:border-gold/40 hover:bg-white/[0.04] hover:text-white/90"
            )
          }
        >
          <item.icon className="h-[17px] w-[17px]" />
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}

export function AppLayout({ navItems, title }) {
  const { user, logout } = useAuth();
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-60 flex-col bg-navy-deep md:flex">
        <Crest />
        <NavList items={navItems} />
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b border-border bg-card px-4 md:px-8">
          <div className="flex items-center gap-3">
            <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
              <SheetTrigger asChild className="md:hidden">
                <Button variant="ghost" size="icon" data-testid="mobile-nav-trigger">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-64 border-none bg-navy-deep p-0">
                <SheetTitle className="sr-only">Navigation menu</SheetTitle>
                <SheetDescription className="sr-only">Kingswell Institute site navigation</SheetDescription>
                <Crest />
                <NavList items={navItems} onNavigate={() => setSheetOpen(false)} />
              </SheetContent>
            </Sheet>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-gold">Administration</p>
              <h1 className="font-serif text-lg font-semibold text-foreground md:text-xl" data-testid="page-title">{title}</h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block" data-testid="current-user-name">
              <div className="text-sm font-medium text-foreground">{user?.first_name} {user?.last_name}</div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{user?.role_name || user?.role}</div>
            </div>
            <Avatar className="h-9 w-9 border border-gold/30">
              <AvatarFallback className="bg-navy-surface text-[13px] font-semibold text-gold">{initials(user)}</AvatarFallback>
            </Avatar>
            <Button variant="outline" size="icon" onClick={logout} data-testid="logout-button" title="Log out" className="border-border hover:border-gold hover:text-gold">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </header>

        <main className="flex-1 p-5 md:p-8">
          <div className="mx-auto max-w-7xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
