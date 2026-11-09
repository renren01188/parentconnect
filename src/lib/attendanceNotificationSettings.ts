import { supabase } from "@/lib/supabase";

export type AttendanceNotificationDelivery = "sms" | "email" | "both" | "none";

export type AttendanceNotificationSettings = {
  smsEnabled: boolean;
  emailEnabled: boolean;
  lowCreditThreshold: number;
  smsCreditBalance: number | null;
  smsCreditsCheckedAt: string | null;
  smsCreditsCheckError: string | null;
  updatedAt: string | null;
};

type AttendanceNotificationSettingsRow = {
  sms_enabled: boolean;
  email_enabled: boolean;
  sms_low_credit_threshold: number;
  sms_credit_balance: number | null;
  sms_credits_checked_at: string | null;
  sms_credits_check_error: string | null;
  updated_at: string | null;
};

export const DEFAULT_SMS_LOW_CREDIT_THRESHOLD = 50;

const SETTINGS_COLUMNS = "sms_enabled, email_enabled, sms_low_credit_threshold, sms_credit_balance, sms_credits_checked_at, sms_credits_check_error, updated_at";

export function deliveryFromChannels(smsEnabled: boolean, emailEnabled: boolean): AttendanceNotificationDelivery {
  if (smsEnabled && emailEnabled) return "both";
  if (smsEnabled) return "sms";
  if (emailEnabled) return "email";
  return "none";
}

export function channelsForDelivery(delivery: AttendanceNotificationDelivery) {
  return {
    smsEnabled: delivery === "sms" || delivery === "both",
    emailEnabled: delivery === "email" || delivery === "both",
  };
}

/**
 * ICT's Email-only mode is a school-wide delivery decision. It deliberately
 * overrides an account's normal SMS preference, while the Parent's explicit
 * Neither choice remains an opt-out.
 */
export function isEmailOnlyDelivery(settings: Pick<AttendanceNotificationSettings, "smsEnabled" | "emailEnabled">) {
  return settings.emailEnabled && !settings.smsEnabled;
}

export function isLowSmsCredit(balance: number | null, threshold: number) {
  return balance !== null && Number.isFinite(balance) && balance <= threshold;
}

export function normalizeLowCreditThreshold(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 1_000_000) return null;
  return parsed;
}

export function mapAttendanceNotificationSettings(row: AttendanceNotificationSettingsRow): AttendanceNotificationSettings {
  return {
    smsEnabled: row.sms_enabled,
    emailEnabled: row.email_enabled,
    lowCreditThreshold: row.sms_low_credit_threshold,
    smsCreditBalance: row.sms_credit_balance,
    smsCreditsCheckedAt: row.sms_credits_checked_at,
    smsCreditsCheckError: row.sms_credits_check_error,
    updatedAt: row.updated_at,
  };
}

/** Server-only. All callers use the service-role Supabase client. */
export async function getAttendanceNotificationSettings(): Promise<AttendanceNotificationSettings> {
  const { data, error } = await supabase
    .from("attendance_notification_settings")
    .select(SETTINGS_COLUMNS)
    .eq("id", true)
    .maybeSingle();

  if (error) throw error;
  if (!data) return initializeAttendanceNotificationSettings();
  return mapAttendanceNotificationSettings(data as AttendanceNotificationSettingsRow);
}

/**
 * Ensures older or newly deployed databases have the singleton settings row.
 * `ignoreDuplicates` means it cannot overwrite settings an ICT administrator
 * has already saved, even when two requests initialize it at the same time.
 */
export async function initializeAttendanceNotificationSettings(): Promise<AttendanceNotificationSettings> {
  const { error } = await supabase
    .from("attendance_notification_settings")
    .upsert(
      {
        id: true,
        sms_enabled: true,
        email_enabled: false,
        sms_low_credit_threshold: DEFAULT_SMS_LOW_CREDIT_THRESHOLD,
      },
      { onConflict: "id", ignoreDuplicates: true },
    );
  if (error) throw error;

  const { data, error: readError } = await supabase
    .from("attendance_notification_settings")
    .select(SETTINGS_COLUMNS)
    .eq("id", true)
    .single();
  if (readError) throw readError;
  return mapAttendanceNotificationSettings(data as AttendanceNotificationSettingsRow);
}

export async function isAttendanceSmsEnabled() {
  return (await getAttendanceNotificationSettings()).smsEnabled;
}

export async function isAttendanceEmailEnabled() {
  return (await getAttendanceNotificationSettings()).emailEnabled;
}
