import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { Users, ClipboardList, FileCheck2, FileText } from "lucide-react";

const TILES = [
  { key: "students", label: "Students", permission: "students.view", icon: Users, url: "/students", dataKey: "students" },
  { key: "admissions", label: "Pending Admissions", permission: "admissions.view", icon: ClipboardList, url: "/admissions?status=submitted", dataKey: "admissions" },
  { key: "examinations", label: "Scheduled Examinations", permission: "exams.manage", icon: FileCheck2, url: "/examinations?status=scheduled", dataKey: "examinations" },
  { key: "documents", label: "Documents Issued", permission: "documents.issue", icon: FileText, url: "/documents?status=valid", dataKey: "documents" },
];

function StatCard({ tile }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["dashboard", tile.key],
    queryFn: async () => (await api.get(tile.url)).data[tile.dataKey] || [],
  });

  return (
    <div
      className="border-t-2 border-gold bg-card p-5 shadow-sm"
      data-testid={`stat-card-${tile.key}`}
    >
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{tile.label}</p>
        <tile.icon className="h-4 w-4 text-gold" />
      </div>
      <div className="mt-3">
        {isLoading ? (
          <Skeleton className="h-9 w-16" />
        ) : isError ? (
          <span className="text-sm text-destructive">Unavailable</span>
        ) : (
          <div className="font-serif text-3xl font-bold text-foreground" data-testid={`stat-value-${tile.key}`}>{data.length}</div>
        )}
      </div>
    </div>
  );
}

export default function AdminDashboardPage() {
  const { user, hasPermission } = useAuth();
  const visibleTiles = TILES.filter((t) => hasPermission(t.permission));

  return (
    <div className="space-y-7" data-testid="admin-dashboard-page">
      <div className="border-b border-border pb-5">
        <span className="mb-1.5 block h-[3px] w-9 bg-gold" />
        <h2 className="font-serif text-2xl font-semibold text-foreground sm:text-[28px]">Welcome, {user?.first_name}</h2>
        <p className="mt-1 text-sm text-muted-foreground">Here's what's happening at Kingswell Institute today.</p>
      </div>

      {visibleTiles.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="no-tiles-message">
          Your role does not have visibility into any dashboard summary yet.
        </p>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {visibleTiles.map((tile) => (
            <StatCard key={tile.key} tile={tile} />
          ))}
        </div>
      )}
    </div>
  );
}
