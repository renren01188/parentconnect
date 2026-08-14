export function getStudentAge(birthDate?: string | null, today = new Date()): string {
  if (!birthDate) return "—";
  const birth = new Date(`${birthDate.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return "—";
  let age = today.getFullYear() - birth.getFullYear();
  const monthDifference = today.getMonth() - birth.getMonth();
  if (monthDifference < 0 || (monthDifference === 0 && today.getDate() < birth.getDate())) age--;
  return age >= 0 ? String(age) : "—";
}
