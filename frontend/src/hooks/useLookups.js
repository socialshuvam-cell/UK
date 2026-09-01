import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export function useCourses() {
  return useQuery({
    queryKey: ["lookup", "courses"],
    queryFn: async () => (await api.get("/courses")).data.courses || [],
  });
}

export function useInstitutions() {
  return useQuery({
    queryKey: ["lookup", "institutions"],
    queryFn: async () => (await api.get("/institutions")).data.institutions || [],
  });
}

export function useCourseSessions(courseId) {
  return useQuery({
    queryKey: ["lookup", "sessions", courseId],
    queryFn: async () => (await api.get(`/courses/${courseId}/sessions`)).data.sessions || [],
    enabled: !!courseId,
  });
}

export function useCourseSubjects(courseId) {
  return useQuery({
    queryKey: ["lookup", "course-subjects", courseId],
    queryFn: async () => (await api.get(`/courses/${courseId}/subjects`)).data.subjects || [],
    enabled: !!courseId,
  });
}

export function nameById(list, id, field = "name") {
  const item = (list || []).find((x) => x.id === id);
  return item ? item[field] : id ? `#${id}` : "-";
}
