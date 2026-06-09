export type GuidanceProfile = {
  firstName: string;
  middleName: string;
  lastName: string;
  suffix: string;
  email: string;
  contactNumber: string;
  employeeId: string;
  school: string;
  role: string;
  status: string;
};

export const GUIDANCE_PROFILE_STORAGE_KEY = "parentconnect.guidance.profile";
export const GUIDANCE_PROFILE_APPROVAL_KEY = "parentconnect.guidance.profileApproval";

export const DEFAULT_GUIDANCE_PROFILE: GuidanceProfile = {
  firstName: "Grace",
  middleName: "",
  lastName: "Santos",
  suffix: "",
  email: "guidance@santiago.edu.ph",
  contactNumber: "+63 912 345 6789",
  employeeId: "GUID-2024-001",
  school: "Santiago Elementary",
  role: "Guidance Counselor",
  status: "Active",
};

export function getGuidanceFullName(profile: Pick<GuidanceProfile, "firstName" | "middleName" | "lastName" | "suffix">) {
  return [profile.firstName, profile.middleName, profile.lastName, profile.suffix]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ");
}

export function getGuidanceInitials(profile: Pick<GuidanceProfile, "firstName" | "lastName">) {
  return `${profile.firstName[0] ?? ""}${profile.lastName[0] ?? ""}`.toUpperCase() || "GC";
}

export function readStoredGuidanceProfile() {
  if (typeof window === "undefined") return DEFAULT_GUIDANCE_PROFILE;

  try {
    const stored = window.localStorage.getItem(GUIDANCE_PROFILE_STORAGE_KEY);
    return stored
      ? { ...DEFAULT_GUIDANCE_PROFILE, ...JSON.parse(stored) as Partial<GuidanceProfile> }
      : DEFAULT_GUIDANCE_PROFILE;
  } catch {
    return DEFAULT_GUIDANCE_PROFILE;
  }
}
