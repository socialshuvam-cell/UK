import {
  LayoutDashboard,
  ClipboardList,
  Users,
  Building2,
  GraduationCap,
  BookOpen,
  FileCheck2,
  FileText,
  Settings,
  UserCircle,
  Ticket,
  Award,
} from "lucide-react";

// Nav items appear only once their checkpoint's page exists. Extend this list
// as each Phase 7 checkpoint adds real pages — do not add placeholder routes.
export const ADMIN_NAV = [
  { label: "Dashboard", path: "/admin", icon: LayoutDashboard, permission: null, testId: "nav-admin-dashboard" },
];

export const PORTAL_NAV = [
  { label: "Dashboard", path: "/portal", icon: LayoutDashboard, testId: "nav-portal-dashboard" },
];

// Reserved for later checkpoints (kept here so icons/labels are defined once):
export const FUTURE_ADMIN_NAV_ICONS = {
  admissions: ClipboardList,
  students: Users,
  institutions: Building2,
  courses: BookOpen,
  enrollments: GraduationCap,
  examinations: FileCheck2,
  documents: FileText,
  templates: Settings,
};

export const FUTURE_PORTAL_NAV_ICONS = {
  profile: UserCircle,
  exams: Ticket,
  documents: Award,
};
