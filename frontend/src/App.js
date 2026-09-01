import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/context/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/layout/AppLayout";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { ADMIN_NAV, PORTAL_NAV } from "@/constants/nav";
import LoginPage from "@/pages/LoginPage";
import VerifyPage from "@/pages/VerifyPage";
import NotFoundPage from "@/pages/NotFoundPage";
import HomePage from "@/pages/public/HomePage";
import AboutPage from "@/pages/public/AboutPage";
import CoursesPublicPage from "@/pages/public/CoursesPage";
import InstitutionsPublicPage from "@/pages/public/InstitutionsPage";
import AdmissionsPublicPage from "@/pages/public/AdmissionsPage";
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
import SettingsPage from "@/pages/admin/SettingsPage";
import "@/App.css";

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route element={<PublicLayout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="/courses" element={<CoursesPublicPage />} />
            <Route path="/admissions" element={<AdmissionsPublicPage />} />
            <Route path="/institutions" element={<InstitutionsPublicPage />} />
          </Route>

          <Route path="/login" element={<LoginPage />} />
          <Route path="/verify" element={<VerifyPage />} />
          <Route path="/verify/:token" element={<VerifyPage />} />

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
            <Route path="settings" element={<SettingsPage />} />
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
