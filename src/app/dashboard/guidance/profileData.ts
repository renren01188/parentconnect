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
  profilePicture?: string;
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
