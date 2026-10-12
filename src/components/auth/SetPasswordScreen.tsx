"use client";

import type { CSSProperties, FormEvent, ReactNode } from "react";
import { AlertCircle, CheckCircle, Eye, EyeOff, ShieldCheck, type LucideIcon } from "lucide-react";

export type PasswordRuleState = {
  text: string;
  met: boolean;
};

export type PasswordSetupStep = {
  step: string;
  label: string;
  done: boolean;
};

export type PasswordSetupTheme = {
  canvas: string;
  sidebar: string;
  sidebarMuted: string;
  header: string;
  headerMuted: string;
  accent: string;
  accentDark: string;
  accentSoft: string;
  panelBorder: string;
  noticeBackground: string;
  noticeBorder: string;
  noticeText: string;
};

type SetPasswordScreenProps = {
  theme: PasswordSetupTheme;
  icon: LucideIcon;
  portalLabel: string;
  sidebarTitle: ReactNode;
  sidebarDescription: string;
  steps: PasswordSetupStep[];
  headerDescription: string;
  temporaryPasswordMessage: string;
  password: string;
  confirmPassword: string;
  showPassword: boolean;
  showConfirmation: boolean;
  rules: PasswordRuleState[];
  passwordsMatch: boolean;
  canSubmit: boolean;
  loading: boolean;
  error: string;
  completed: boolean;
  onPasswordChange: (value: string) => void;
  onConfirmPasswordChange: (value: string) => void;
  onTogglePassword: () => void;
  onToggleConfirmation: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

function PasswordRule({ rule, theme }: { rule: PasswordRuleState; theme: PasswordSetupTheme }) {
  return (
    <div className="flex items-center gap-2 text-xs transition-colors" style={{ color: rule.met ? theme.accentDark : "#4b5563" }}>
      {rule.met ? (
        <CheckCircle className="h-3.5 w-3.5 shrink-0" style={{ color: theme.accent }} />
      ) : (
        <div className="h-3.5 w-3.5 shrink-0 rounded-full bg-gray-400" />
      )}
      <span className={rule.met ? "font-medium" : ""}>{rule.text}</span>
    </div>
  );
}

export function SetPasswordScreen({
  theme,
  icon: PortalIcon,
  portalLabel,
  sidebarTitle,
  sidebarDescription,
  steps,
  headerDescription,
  temporaryPasswordMessage,
  password,
  confirmPassword,
  showPassword,
  showConfirmation,
  rules,
  passwordsMatch,
  canSubmit,
  loading,
  error,
  completed,
  onPasswordChange,
  onConfirmPasswordChange,
  onTogglePassword,
  onToggleConfirmation,
  onSubmit,
}: SetPasswordScreenProps) {
  const strength = rules.filter((rule) => rule.met).length;
  const strengthLabel = ["", "Weak", "Fair", "Good", "Strong"][strength] ?? "";
  const strengthColor = [
    "#e5e7eb",
    "#ef4444",
    "#f59e0b",
    "#3b82f6",
    theme.accent,
  ][strength] ?? theme.accent;
  const themeStyle = { "--password-accent": theme.accent } as CSSProperties;

  return (
    <div className="flex min-h-screen font-sans" style={{ background: theme.canvas, ...themeStyle }}>
      <aside className="hidden w-80 shrink-0 flex-col justify-between px-8 py-10 text-white lg:flex" style={{ background: theme.sidebar }}>
        <div>
          <div className="mb-10 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20">
              <PortalIcon className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-base font-extrabold leading-tight">ParentConnect</p>
              <p className="text-[11px]" style={{ color: theme.sidebarMuted }}>{portalLabel}</p>
            </div>
          </div>

          <h2 className="mb-3 text-2xl font-extrabold leading-snug">{sidebarTitle}</h2>
          <p className="text-sm leading-relaxed" style={{ color: theme.sidebarMuted }}>{sidebarDescription}</p>
        </div>

        <div className="space-y-4">
          {steps.map((item) => (
            <div key={item.step} className="flex items-center gap-3">
              <div
                className={"flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold " + (item.done ? "bg-white" : "bg-white/20 text-white")}
                style={item.done ? { color: theme.accentDark } : undefined}
              >
                {item.done ? <CheckCircle className="h-4 w-4" /> : item.step}
              </div>
              <p className="text-sm font-medium" style={{ color: item.done ? "#ffffff" : theme.sidebarMuted }}>{item.label}</p>
            </div>
          ))}
        </div>

        <p className="text-xs" style={{ color: theme.sidebarMuted }}>© 2026 Santiago Elementary School</p>
      </aside>

      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          {completed ? (
            <div className="flex flex-col items-center rounded-2xl border bg-white p-10 text-center shadow-xl" style={{ borderColor: theme.panelBorder }}>
              <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-full" style={{ background: theme.accentSoft }}>
                <CheckCircle className="h-10 w-10" style={{ color: theme.accent }} />
              </div>
              <h1 className="mb-2 text-2xl font-extrabold text-slate-800">Password Set!</h1>
              <p className="text-sm text-slate-500">Redirecting you to your dashboard…</p>
              <div className="mt-6 flex gap-1.5">
                {[0, 1, 2].map((index) => (
                  <span
                    key={index}
                    className="h-2 w-2 animate-bounce rounded-full"
                    style={{ background: theme.accent, animationDelay: String(index * 0.15) + "s" }}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border bg-white shadow-xl" style={{ borderColor: theme.panelBorder }}>
              <div className="px-8 pb-7 pt-8" style={{ background: theme.header }}>
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20">
                  <ShieldCheck className="h-7 w-7 text-white" />
                </div>
                <h1 className="text-2xl font-extrabold text-white">Create Your Password</h1>
                <p className="mt-1.5 text-sm leading-relaxed" style={{ color: theme.headerMuted }}>{headerDescription}</p>
              </div>

              <form onSubmit={onSubmit} className="space-y-5 px-8 py-7">
                <div className="flex items-start gap-2.5 rounded-xl border px-4 py-3" style={{ background: theme.noticeBackground, borderColor: theme.noticeBorder }}>
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" style={{ color: theme.accentDark }} />
                  <p className="text-xs leading-relaxed" style={{ color: theme.noticeText }}>{temporaryPasswordMessage}</p>
                </div>

                {error && (
                  <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                    <AlertCircle className="h-4 w-4 shrink-0" /> {error}
                  </div>
                )}

                <div>
                  <label className="mb-1.5 block text-xs font-bold text-gray-600">
                    New Password <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(event) => onPasswordChange(event.target.value)}
                      placeholder="Create a strong password"
                      required
                      className="w-full rounded-xl border border-gray-200 px-4 py-3 pr-11 text-sm text-gray-900 outline-none transition placeholder:text-gray-300 focus:border-[var(--password-accent)] focus:ring-2 focus:ring-[var(--password-accent)]/30"
                    />
                    <button type="button" onClick={onTogglePassword} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 transition hover:text-gray-600" aria-label={showPassword ? "Hide password" : "Show password"}>
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {password && (
                    <div className="mt-2 space-y-1">
                      <div className="flex gap-1">
                        {[1, 2, 3, 4].map((index) => (
                          <span key={index} className="h-1.5 flex-1 rounded-full" style={{ background: index <= strength ? strengthColor : "#e5e7eb" }} />
                        ))}
                      </div>
                      {strengthLabel && <p className="text-xs font-semibold" style={{ color: strengthColor }}>{strengthLabel}</p>}
                    </div>
                  )}
                </div>

                <div className="space-y-2 rounded-xl border border-gray-100 bg-gray-50 p-3.5">
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-gray-400">Password Requirements</p>
                  {rules.map((rule) => <PasswordRule key={rule.text} rule={rule} theme={theme} />)}
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-bold text-gray-600">
                    Confirm Password <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showConfirmation ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(event) => onConfirmPasswordChange(event.target.value)}
                      placeholder="Re-enter your password"
                      required
                      className={"w-full rounded-xl border px-4 py-3 pr-11 text-sm text-gray-900 outline-none transition placeholder:text-gray-300 focus:ring-2 " + (
                        confirmPassword && !passwordsMatch
                          ? "border-red-300 focus:border-red-400 focus:ring-red-200"
                          : "border-gray-200 focus:border-[var(--password-accent)] focus:ring-[var(--password-accent)]/30"
                      )}
                    />
                    <button type="button" onClick={onToggleConfirmation} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 transition hover:text-gray-600" aria-label={showConfirmation ? "Hide confirmation password" : "Show confirmation password"}>
                      {showConfirmation ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {confirmPassword && !passwordsMatch && (
                    <p className="mt-1 flex items-center gap-1 text-xs text-red-500">
                      <AlertCircle className="h-3 w-3" /> Passwords do not match
                    </p>
                  )}
                  {passwordsMatch && (
                    <p className="mt-1 flex items-center gap-1 text-xs" style={{ color: theme.accentDark }}>
                      <CheckCircle className="h-3 w-3" /> Passwords match
                    </p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={!canSubmit}
                  className="flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-bold text-white shadow-md transition-all duration-200 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                  style={{ background: theme.header, boxShadow: "0 4px 14px " + theme.accent + "55" }}
                >
                  {loading ? (
                    <>
                      <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                      </svg>
                      Setting password…
                    </>
                  ) : (
                    <><ShieldCheck className="h-4 w-4" /> Set Password &amp; Go to Dashboard</>
                  )}
                </button>
              </form>
            </div>
          )}

          <p className="mt-5 text-center text-xs text-gray-400">ParentConnect · Santiago Elementary School</p>
        </div>
      </main>
    </div>
  );
}
