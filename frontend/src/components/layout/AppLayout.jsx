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

function NavList({ items, onNavigate }) {
  return (
    <nav className="flex flex-col gap-1 p-3" data-testid="sidebar-nav">
      {items.map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          end
          onClick={onNavigate}
          data-testid={item.testId}
          className={({ isActive }) =>
            cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            )
          }
        >
          <item.icon className="h-4 w-4" />
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
      <aside className="hidden w-64 flex-col border-r md:flex">
        <div className="flex h-16 items-center border-b px-5 text-lg font-semibold" data-testid="sidebar-brand">
          Kingswell Institute
        </div>
        <NavList items={navItems} />
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b px-4 md:px-6">
          <div className="flex items-center gap-3">
            <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
              <SheetTrigger asChild className="md:hidden">
                <Button variant="ghost" size="icon" data-testid="mobile-nav-trigger">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-64 p-0">
                <SheetTitle className="sr-only">Navigation menu</SheetTitle>
                <SheetDescription className="sr-only">Kingswell Institute site navigation</SheetDescription>
                <div className="flex h-16 items-center border-b px-5 text-lg font-semibold">Kingswell Institute</div>
                <NavList items={navItems} onNavigate={() => setSheetOpen(false)} />
              </SheetContent>
            </Sheet>
            <h1 className="text-base font-semibold md:text-lg" data-testid="page-title">{title}</h1>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden text-right text-sm sm:block" data-testid="current-user-name">
              <div className="font-medium">{user?.first_name} {user?.last_name}</div>
              <div className="text-xs capitalize text-muted-foreground">{user?.role_name || user?.role}</div>
            </div>
            <Avatar>
              <AvatarFallback>{initials(user)}</AvatarFallback>
            </Avatar>
            <Button variant="outline" size="icon" onClick={logout} data-testid="logout-button" title="Log out">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
