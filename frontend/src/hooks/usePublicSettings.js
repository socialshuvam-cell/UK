import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

const DEFAULTS = {
  institute_name: "Kingswell Institute",
  tagline: "Excellence in Academics, Examinations & Professional Advancement",
  logo_url: "/assets/kingswell-logo.png",
  contact_email: "info@kingswellinstitute.uk",
  contact_phone: "",
  contact_address: "",
  footer_text: "",
  established_year: "",
  social_facebook: "",
  social_twitter: "",
  social_linkedin: "",
  hero_heading: "A Legacy of Academic Excellence",
  hero_subheading: "",
  about_text: "",
};

export function usePublicSettings() {
  const { data } = useQuery({
    queryKey: ["public-settings"],
    queryFn: async () => (await api.get("/settings/public")).data.settings || {},
    staleTime: 5 * 60 * 1000,
  });
  return { ...DEFAULTS, ...(data || {}) };
}
