import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";

export default function PortalDashboardPage() {
  const { user } = useAuth();

  const { data: student, isLoading } = useQuery({
    queryKey: ["me", "student"],
    queryFn: async () => (await api.get("/me/student")).data.student,
  });

  const { data: enrollments } = useQuery({
    queryKey: ["me", "enrollments"],
    queryFn: async () => (await api.get("/me/enrollments")).data.enrollments || [],
  });

  return (
    <div className="space-y-6" data-testid="portal-dashboard-page">
      <div>
        <h2 className="text-2xl font-semibold">Welcome, {user?.first_name}</h2>
        <p className="text-sm text-muted-foreground">Your Kingswell Institute student profile at a glance.</p>
      </div>

      <Card data-testid="portal-profile-card">
        <CardHeader>
          <CardTitle className="text-base">Profile Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {isLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : student ? (
            <>
              <div>
                <span className="text-muted-foreground">Registration No.: </span>
                <span className="font-medium" data-testid="portal-registration-number">{student.registration_number}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Status: </span>
                <Badge variant="secondary" className="capitalize">{student.status}</Badge>
              </div>
              <div>
                <span className="text-muted-foreground">Enrollments: </span>
                <span className="font-medium" data-testid="portal-enrollment-count">{enrollments?.length ?? "-"}</span>
              </div>
            </>
          ) : (
            <p className="text-muted-foreground">No student profile is linked to this account.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
