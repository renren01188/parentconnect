export const PARENT_PASSWORD_REQUIREMENTS_MESSAGE = "Password must be at least 8 characters and include an uppercase letter, a lowercase letter, and a number.";

/** Keep the browser guidance and the server-side password policy identical. */
export function parentPasswordMeetsRequirements(value: unknown) {
  const password = typeof value === "string" ? value : "";
  return password.length >= 8
    && /[A-Z]/.test(password)
    && /[a-z]/.test(password)
    && /\d/.test(password);
}
