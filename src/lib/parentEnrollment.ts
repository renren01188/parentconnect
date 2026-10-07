import bcrypt from "bcryptjs";
import crypto from "crypto";
import { sameParentEnrollmentName } from "@/lib/familyName";
import { supabase } from "@/lib/supabase";

export const FAMILY_ROLES = ["Father", "Mother", "Guardian"] as const;
export type FamilyRole = (typeof FAMILY_ROLES)[number];

type ParentAccount = {
  id: number;
  email: string | null;
  contact_number: string | null;
  parent_first_name: string | null;
  parent_middle_name: string | null;
  parent_last_name: string | null;
  parent_suffix: string | null;
  relationship: string | null;
  password_set: number | boolean | null;
  archive_status: string | null;
};

export type ParentEnrollmentInput = {
  studentId: string;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  suffix?: string | null;
  relationship: FamilyRole;
  email: string;
  contactNumber: string;
  address?: string | null;
};

export function isFamilyRole(value: unknown): value is FamilyRole {
  return FAMILY_ROLES.includes(value as FamilyRole);
}

export function normalizeParentEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function normalizeParentPhone(value: unknown): string {
  return typeof value === "string" ? value.replace(/\D/g, "") : "";
}

function accountMatchesEnrollment(account: ParentAccount, input: ParentEnrollmentInput) {
  return normalizeParentEmail(account.email) === normalizeParentEmail(input.email)
    && normalizeParentPhone(account.contact_number) === normalizeParentPhone(input.contactNumber)
    && account.archive_status !== "archived"
    && account.relationship === input.relationship
    && sameParentEnrollmentName(
      {
        firstName: account.parent_first_name,
        middleName: account.parent_middle_name,
        lastName: account.parent_last_name,
      },
      {
        firstName: input.firstName,
        middleName: input.middleName,
        lastName: input.lastName,
      },
    );
}

/**
 * Creates one pending parent account, or reuses the one already verified by
 * the same email, phone, name, and family role. It only ever adds the exact
 * missing parent/student link; it never creates a second account for a
 * sibling.
 */
export async function provisionParentForStudent(input: ParentEnrollmentInput) {
  const email = normalizeParentEmail(input.email);
  const contactNumber = normalizeParentPhone(input.contactNumber);
  const firstName = input.firstName.trim();
  const middleName = input.middleName?.trim() || null;
  const lastName = input.lastName.trim();
  const suffix = input.suffix?.trim() || null;

  if (!isFamilyRole(input.relationship) || !firstName || !lastName
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || contactNumber.length !== 11) {
    throw new Error("A verified parent name, role, email, and 11-digit contact number are required.");
  }

  const { data: emailMatches, error: emailError } = await supabase
    .from("parents")
    .select("id, email, contact_number, parent_first_name, parent_middle_name, parent_last_name, parent_suffix, relationship, password_set, archive_status")
    .ilike("email", email);
  if (emailError) throw emailError;

  const exactMatches = ((emailMatches ?? []) as ParentAccount[])
    .filter((account) => accountMatchesEnrollment(account, {
      ...input,
      email,
      contactNumber,
      firstName,
      middleName,
      lastName,
      suffix,
    }));

  if (exactMatches.length > 1) {
    throw new Error("Multiple parent accounts use these verified details. ICT review is required before linking a student.");
  }

  const conflictingEmail = (emailMatches ?? []).some((account) => normalizeParentEmail(account.email) === email)
    && exactMatches.length === 0;
  if (conflictingEmail) {
    throw new Error("This email is already assigned to a different parent record. ICT review is required before linking a student.");
  }

  let parentId = exactMatches[0]?.id;
  if (!parentId) {
    const password = await bcrypt.hash(crypto.randomUUID(), 10);
    const { data: created, error: createError } = await supabase
      .from("parents")
      .insert({
        student_id: input.studentId,
        parent_first_name: firstName,
        parent_middle_name: middleName,
        parent_last_name: lastName,
        parent_suffix: suffix,
        relationship: input.relationship,
        contact_number: contactNumber,
        email,
        address: input.address?.trim() || null,
        password,
        temp_password: null,
        password_set: 0,
        status: "active",
      })
      .select("id")
      .single();
    if (createError?.code === "23505") {
      // The normalized-email index may have won a concurrent provisioning
      // race. Re-read and accept only the exact same verified identity.
      const { data: retryRows, error: retryError } = await supabase
        .from("parents")
        .select("id, email, contact_number, parent_first_name, parent_middle_name, parent_last_name, parent_suffix, relationship, password_set, archive_status")
        .ilike("email", email);
      if (retryError) throw retryError;
      const retryMatches = ((retryRows ?? []) as ParentAccount[])
        .filter((account) => accountMatchesEnrollment(account, {
          ...input,
          email,
          contactNumber,
          firstName,
          middleName,
          lastName,
          suffix,
        }));
      if (retryMatches.length !== 1) throw createError;
      parentId = retryMatches[0].id;
    } else {
      if (createError) throw createError;
      parentId = created.id;
    }
  }

  const { error: linkError } = await supabase
    .from("parent_student_links")
    .upsert({ parent_id: parentId, student_id: input.studentId, relationship: input.relationship }, {
      onConflict: "parent_id,student_id",
      ignoreDuplicates: true,
    });
  if (linkError) throw linkError;

  return { parentId, reusedExistingAccount: exactMatches.length === 1 };
}
