import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    <Card data-testid={`stat-card-${tile.key}`}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{tile.label}</CardTitle>
        <tile.icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-8 w-16" />
        ) : isError ? (
          <span className="text-sm text-destructive">Unavailable</span>
        ) : (
          <div className="text-2xl font-bold" data-testid={`stat-value-${tile.key}`}>{data.length}</div>
        )}
      </CardContent>
    </Card>
  );
}

export default function AdminDashboardPage() {
  const { user, hasPermission } = useAuth();
  const visibleTiles = TILES.filter((t) => hasPermission(t.permission));

  return (
    <div className="space-y-6" data-testid="admin-dashboard-page">
      <div>
        <h2 className="text-2xl font-semibold">Welcome, {user?.first_name}</h2>
        <p className="text-sm text-muted-foreground">Here's what's happening at Kingswell Institute today.</p>
      </div>

      {visibleTiles.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="no-tiles-message">
          Your role does not have visibility into any dashboard summary yet.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {visibleTiles.map((tile) => (
            <StatCard key={tile.key} tile={tile} />
          ))}
        </div>
      )}
    </div>
  );
}
