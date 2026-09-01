import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/layout/AppLayout";
import { ADMIN_NAV, PORTAL_NAV } from "@/constants/nav";
import LoginPage from "@/pages/LoginPage";
import NotFoundPage from "@/pages/NotFoundPage";
import AdminDashboardPage from "@/pages/admin/DashboardPage";
import PortalDashboardPage from "@/pages/portal/DashboardPage";
import AdmissionsListPage from "@/pages/admin/admissions/AdmissionsListPage";
import AdmissionDetailPage from "@/pages/admin/admissions/AdmissionDetailPage";
import StudentsListPage from "@/pages/admin/students/StudentsListPage";
import StudentDetailPage from "@/pages/admin/students/StudentDetailPage";
import InstitutionsListPage from "@/pages/admin/institutions/InstitutionsListPage";
import InstitutionDetailPage from "@/pages/admin/institutions/InstitutionDetailPage";
import CoursesListPage from "@/pages/admin/courses/CoursesListPage";
import CourseDetailPage from "@/pages/admin/courses/CourseDetailPage";
import EnrollmentsListPage from "@/pages/admin/enrollments/EnrollmentsListPage";
import EnrollmentDetailPage from "@/pages/admin/enrollments/EnrollmentDetailPage";
import ExaminationsListPage from "@/pages/admin/examinations/ExaminationsListPage";
import ExaminationDetailPage from "@/pages/admin/examinations/ExaminationDetailPage";
import DocumentsListPage from "@/pages/admin/documents/DocumentsListPage";
import DocumentDetailPage from "@/pages/admin/documents/DocumentDetailPage";
import DocumentTemplatesPage from "@/pages/admin/documents/DocumentTemplatesPage";
import "@/App.css";

function RootRedirect() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={user.role === "student" ? "/portal" : "/admin"} replace />;
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/login" element={<LoginPage />} />

          <Route
            path="/admin"
            element={
              <ProtectedRoute allow="staff">
                <AppLayout navItems={ADMIN_NAV} title="Admin Dashboard" />
              </ProtectedRoute>
            }
          >
            <Route index element={<AdminDashboardPage />} />
            <Route path="admissions" element={<AdmissionsListPage />} />
            <Route path="admissions/:id" element={<AdmissionDetailPage />} />
            <Route path="students" element={<StudentsListPage />} />
            <Route path="students/:id" element={<StudentDetailPage />} />
            <Route path="institutions" element={<InstitutionsListPage />} />
            <Route path="institutions/:id" element={<InstitutionDetailPage />} />
            <Route path="courses" element={<CoursesListPage />} />
            <Route path="courses/:id" element={<CourseDetailPage />} />
            <Route path="enrollments" element={<EnrollmentsListPage />} />
            <Route path="enrollments/:id" element={<EnrollmentDetailPage />} />
            <Route path="examinations" element={<ExaminationsListPage />} />
            <Route path="examinations/:id" element={<ExaminationDetailPage />} />
            <Route path="documents" element={<DocumentsListPage />} />
            <Route path="documents/:id" element={<DocumentDetailPage />} />
            <Route path="document-templates" element={<DocumentTemplatesPage />} />
          </Route>

          <Route
            path="/portal"
            element={
              <ProtectedRoute allow="student">
                <AppLayout navItems={PORTAL_NAV} title="Student Portal" />
              </ProtectedRoute>
            }
          >
            <Route index element={<PortalDashboardPage />} />
          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
