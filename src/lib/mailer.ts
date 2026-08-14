import nodemailer, { type Transporter } from "nodemailer";

type EmailMessage = {
  from?: string;
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string;
};

let smtpTransporter: Transporter | undefined;

function getSmtpTransporter() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    throw new Error("SMTP_HOST, SMTP_USER, and SMTP_PASS must be configured.");
  }

  if (!smtpTransporter) {
    const port = Number(SMTP_PORT ?? 587);
    smtpTransporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
      // Email delivery must not leave deletion workflows waiting indefinitely
      // when an SMTP server is unavailable or slow to respond.
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });
  }

  return smtpTransporter;
}

/** Sends system mail through the SMTP provider configured in .env.local. */
export async function sendWithSmtp(mail: EmailMessage) {
  const from = mail.from ?? process.env.SMTP_FROM;
  if (!from) {
    throw new Error("SMTP_FROM must be configured.");
  }

  return getSmtpTransporter().sendMail({ ...mail, from });
}

const transporter = { sendMail: sendWithSmtp };

export async function sendParentRegistrationConfirmation({ parentEmail, parentName }: { parentEmail: string; parentName: string }) {
  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: parentEmail,
    subject: "ParentConnect — Registration Successful",
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:28px;border:1px solid #e2e8f0;border-radius:14px"><h2 style="color:#0f766e">Registration successful</h2><p>Hello ${parentName},</p><p>Your ParentConnect account has been created successfully. You can now sign in to view your linked student information and attendance updates.</p></div>`,
  });
}

// ── Parent: temp password email ───────────────────────────────────────────────
export async function sendTempPasswordEmail({
  parentEmail, parentName, studentName, tempPassword,
}: {
  parentEmail: string; parentName: string; studentName: string; tempPassword: string;
}) {
  await transporter.sendMail({
    from:    process.env.SMTP_FROM,
    to:      parentEmail,
    subject: "🎓 Student Account Registered — Your Temporary Password",
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f8fafc;padding:32px;border-radius:16px;">
        <div style="background:#10b981;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px;">
          <h1 style="color:white;margin:0;font-size:22px;">ParentConnect</h1>
          <p style="color:#d1fae5;margin:6px 0 0;font-size:13px;">Santiago Elementary School</p>
        </div>
        <div style="background:white;border-radius:12px;padding:24px;margin-bottom:16px;border:1px solid #e2e8f0;">
          <p style="color:#374151;font-size:15px;margin:0 0 12px;">Hello, <strong>${parentName}</strong>,</p>
          <p style="color:#6b7280;font-size:14px;margin:0 0 16px;">
            Your child <strong style="color:#111827;">${studentName}</strong> has been successfully registered. Below are your ParentConnect login credentials.
          </p>
          <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:20px;margin:16px 0;">
            <p style="margin:0 0 8px;font-size:12px;font-weight:700;color:#065f46;text-transform:uppercase;">Your Login Credentials</p>
            <table style="width:100%;font-size:14px;">
              <tr><td style="color:#6b7280;padding:4px 0;width:160px;">Email:</td><td style="color:#111827;font-weight:600;">${parentEmail}</td></tr>
              <tr><td style="color:#6b7280;padding:4px 0;">Temporary Password:</td>
                <td><span style="font-family:monospace;font-size:18px;font-weight:700;color:#047857;background:#d1fae5;padding:4px 10px;border-radius:6px;letter-spacing:2px;">${tempPassword}</span></td>
              </tr>
            </table>
          </div>
          <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px 16px;margin-top:12px;">
            <p style="margin:0;font-size:12px;color:#92400e;">⚠️ <strong>Important:</strong> You will be asked to create a new password on your first login.</p>
          </div>
        </div>
        <p style="color:#9ca3af;font-size:12px;text-align:center;margin:0;">This is an automated message from ParentConnect. Please do not reply.</p>
      </div>`,
  });
}

// ── Parent: student deletion notification ─────────────────────────────────────
export async function sendStudentLinkedEmail({
  parentEmail, parentName, studentName,
}: {
  parentEmail: string;
  parentName: string;
  studentName: string;
}) {
  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: parentEmail,
    subject: "Student Linked to Your ParentConnect Account",
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f8fafc;padding:32px;border-radius:16px;">
        <div style="background:#10b981;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px;">
          <h1 style="color:white;margin:0;font-size:22px;">ParentConnect</h1>
          <p style="color:#d1fae5;margin:6px 0 0;font-size:13px;">Santiago Elementary School</p>
        </div>
        <div style="background:white;border-radius:12px;padding:24px;margin-bottom:16px;border:1px solid #e2e8f0;">
          <p style="color:#374151;font-size:15px;margin:0 0 12px;">Hello, <strong>${parentName}</strong>,</p>
          <p style="color:#6b7280;font-size:14px;line-height:1.6;margin:0;">
            <strong style="color:#111827;">${studentName}</strong> has been linked to your existing ParentConnect account.
            You can sign in with your current parent account credentials to view attendance records and messages.
          </p>
        </div>
        <p style="color:#9ca3af;font-size:12px;text-align:center;margin:0;">This is an automated message from ParentConnect. Please do not reply.</p>
      </div>`,
  });
}

export async function sendDeletionEmail({
  parentEmail, parentName, studentName, grade, section, studentId, reason, adviserName, deletedAt,
}: {
  parentEmail: string; parentName: string; studentName: string;
  grade: string; section: string; studentId: string;
  reason: string; adviserName: string; deletedAt: string;
}) {
  await transporter.sendMail({
    from:    process.env.SMTP_FROM,
    to:      parentEmail,
    subject: "📋 Student Record Removed — ParentConnect Notification",
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f8fafc;padding:32px;border-radius:16px;">
        <div style="background:#ef4444;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px;">
          <h1 style="color:white;margin:0;font-size:22px;">ParentConnect</h1>
          <p style="color:#fecaca;margin:6px 0 0;font-size:13px;">Santiago Elementary School</p>
        </div>
        <div style="background:white;border-radius:12px;padding:24px;margin-bottom:16px;border:1px solid #e2e8f0;">
          <p style="color:#374151;font-size:15px;margin:0 0 12px;">Dear <strong>${parentName}</strong>,</p>
          <p style="color:#6b7280;font-size:14px;line-height:1.6;margin:0 0 20px;">
            The student record for <strong style="color:#111827;">${studentName}</strong> has been removed from ParentConnect.
          </p>
          <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:20px;margin-bottom:20px;">
            <p style="margin:0 0 12px;font-size:12px;font-weight:700;color:#991b1b;text-transform:uppercase;">Student Details</p>
            <table style="width:100%;font-size:14px;border-collapse:collapse;">
              <tr><td style="color:#6b7280;padding:5px 0;width:160px;">Student Name</td><td style="color:#111827;font-weight:600;">${studentName}</td></tr>
              <tr><td style="color:#6b7280;padding:5px 0;">Student ID</td><td style="color:#111827;font-weight:600;">${studentId}</td></tr>
              <tr><td style="color:#6b7280;padding:5px 0;">Grade &amp; Section</td><td style="color:#111827;font-weight:600;">${grade} · ${section}</td></tr>
              <tr><td style="color:#6b7280;padding:5px 0;">Removed By</td><td style="color:#111827;font-weight:600;">${adviserName}</td></tr>
              <tr><td style="color:#6b7280;padding:5px 0;">Date &amp; Time</td><td style="color:#111827;font-weight:600;">${deletedAt}</td></tr>
            </table>
          </div>
          <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:20px;">
            <p style="margin:0 0 10px;font-size:12px;font-weight:700;color:#92400e;text-transform:uppercase;">Reason for Removal</p>
            <p style="margin:0;font-size:14px;color:#374151;line-height:1.7;white-space:pre-wrap;">${reason}</p>
          </div>
        </div>
        <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:10px;padding:16px;margin-bottom:16px;">
          <p style="margin:0;font-size:13px;color:#0c4a6e;line-height:1.6;">
            <strong>Note:</strong> Your ParentConnect account access has been deactivated. Contact the school office if you have questions.
          </p>
        </div>
        <p style="color:#9ca3af;font-size:12px;text-align:center;margin:0;">This is an automated message from ParentConnect · Santiago Elementary School.<br/>Please do not reply.</p>
      </div>`,
  });
}

export async function sendParentDeletionScheduledEmail({ parentEmail, parentName, reason, deleteAfter }: { parentEmail: string; parentName: string; reason: string; deleteAfter: string }) {
  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: parentEmail,
    subject: "ParentConnect account scheduled for deletion",
    html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;background:#f8fafc;padding:28px;border-radius:16px">
      <div style="background:#b91c1c;color:white;padding:22px;border-radius:12px;text-align:center"><h1 style="margin:0;font-size:22px">ParentConnect</h1><p style="margin:6px 0 0;font-size:13px">Account deletion notice</p></div>
      <div style="background:white;border:1px solid #e2e8f0;border-radius:12px;padding:24px;margin-top:18px"><p>Hello, <strong>${parentName}</strong>,</p><p>Your ParentConnect account has been scheduled for deletion by the school.</p>
      <p><strong>Scheduled permanent deletion date:</strong> ${deleteAfter}</p><div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:16px"><p style="margin:0 0 8px;font-weight:bold">Reason for deletion</p><p style="margin:0;white-space:pre-wrap">${reason}</p></div>
      <p style="line-height:1.6">Your account and related student information remain recoverable for 30 days. Please contact the school immediately if you believe this was scheduled in error.</p></div>
      <p style="color:#94a3b8;text-align:center;font-size:12px">This is an automated ParentConnect notification. Please do not reply.</p></div>`,
  });
}

export async function sendStudentDeletionScheduledEmail({ parentEmail, studentName, reason, deleteAfter }: { parentEmail: string; studentName: string; reason: string; deleteAfter: string }) {
  await transporter.sendMail({ from: process.env.SMTP_FROM, to: parentEmail, subject: "Student deletion approved — ParentConnect", html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:28px;background:#f8fafc"><h1 style="color:#b91c1c">ParentConnect</h1><p>The deletion request for <strong>${studentName}</strong> has been approved by the ICT Office.</p><p>The student record and related data are scheduled for permanent deletion on <strong>${deleteAfter}</strong>. The deletion can be reverted by ICT until that date.</p><div style="padding:16px;border:1px solid #fed7aa;background:#fff7ed"><strong>Reason provided by the adviser</strong><p style="white-space:pre-wrap">${reason}</p></div></div>` });
}

export async function sendStudentDeletionRevertedEmail({ parentEmail, studentName }: { parentEmail: string; studentName: string }) {
  await transporter.sendMail({ from: process.env.SMTP_FROM, to: parentEmail, subject: "Student deletion reverted — ParentConnect", html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:28px;background:#f8fafc"><h1 style="color:#047857">ParentConnect</h1><p>The approved deletion for <strong>${studentName}</strong> has been reverted by the ICT Office.</p><p>The student record will remain available in ParentConnect and is no longer scheduled for deletion.</p></div>` });
}

export async function sendAccountDeletionScheduledEmail({ recipientEmail, recipientName, accountType, reason, deleteAfter }: { recipientEmail: string; recipientName: string; accountType: string; reason: string; deleteAfter: string }) {
  await transporter.sendMail({ from: process.env.SMTP_FROM, to: recipientEmail, subject: "Account deletion scheduled — ParentConnect", html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:28px;background:#f8fafc"><h1 style="color:#b91c1c">ParentConnect</h1><p>Hello, <strong>${recipientName}</strong>.</p><p>Your <strong>${accountType}</strong> account has been confirmed for deletion and is scheduled for permanent removal on <strong>${deleteAfter}</strong>.</p><div style="padding:16px;border:1px solid #fed7aa;background:#fff7ed"><strong>Reason for deletion</strong><p style="white-space:pre-wrap">${reason}</p></div><p>The deletion remains reversible by the ICT Office until the scheduled date.</p></div>` });
}

export async function sendAccountDeletionRevertedEmail({ recipientEmail, recipientName, accountType }: { recipientEmail: string; recipientName: string; accountType: string }) {
  await transporter.sendMail({ from: process.env.SMTP_FROM, to: recipientEmail, subject: "Account deletion reverted — ParentConnect", html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:28px;background:#f8fafc"><h1 style="color:#047857">ParentConnect</h1><p>Hello, <strong>${recipientName}</strong>.</p><p>The scheduled deletion of your <strong>${accountType}</strong> account has been cancelled by the ICT Office. Your account is no longer scheduled for deletion.</p></div>` });
}

export async function sendIctDeletionRequestEmail({ recipientEmail, adviserName, requestCount }: { recipientEmail: string; adviserName: string; requestCount: number }) {
  await transporter.sendMail({ from: process.env.SMTP_FROM, to: recipientEmail, subject: "New student deletion request awaiting approval — ParentConnect", html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:28px;background:#f8fafc"><h1 style="color:#274e13">ParentConnect</h1><p>Hello, ICT Administrator.</p><p><strong>${adviserName}</strong> submitted a student deletion request${requestCount > 1 ? ` for ${requestCount} students` : ""} that is awaiting ICT approval.</p><p>Please sign in to <strong>ICT User Management</strong> to review and act on the request.</p></div>` });
}

// ── Adviser: account created — temp password email ────────────────────────────
export async function sendAdviserTempPasswordEmail({
  adviserEmail, adviserName, grade, section, additionalSections, tempPassword,
}: {
  adviserEmail: string;
  adviserName: string;
  grade: string;
  section: string;
  additionalSections?: string[];
  tempPassword: string;
}) {
  const hasAdditional = additionalSections && additionalSections.length > 0;
  const allSections = hasAdditional
    ? [section, ...additionalSections]
    : [section];

  // Build the sections display block
  const sectionsHtml = hasAdditional
    ? `
      <tr>
        <td style="color:#6b7280;padding:4px 0;width:160px;vertical-align:top;">Primary Section:</td>
        <td style="color:#111827;font-weight:600;">${section}</td>
      </tr>
      <tr>
        <td style="color:#6b7280;padding:4px 0;vertical-align:top;">Additional Sections:</td>
        <td style="color:#111827;font-weight:600;">${additionalSections.join(", ")}</td>
      </tr>
    `
    : `
      <tr>
        <td style="color:#6b7280;padding:4px 0;width:160px;">Section:</td>
        <td style="color:#111827;font-weight:600;">${section}</td>
      </tr>
    `;

  const assignmentText = hasAdditional
    ? `You have been assigned as the class adviser for <strong style="color:#111827;">${grade}</strong>, handling the following sections: <strong style="color:#111827;">${allSections.join(", ")}</strong>.`
    : `You have been assigned as the class adviser for <strong style="color:#111827;">${grade} – ${section}</strong>.`;

  await transporter.sendMail({
    from:    process.env.SMTP_FROM,
    to:      adviserEmail,
    subject: "🏫 Your Adviser Account Has Been Created — Temporary Password",
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f8fafc;padding:32px;border-radius:16px;">
        <div style="background:#522081;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px;">
          <h1 style="color:white;margin:0;font-size:22px;">ParentConnect</h1>
          <p style="color:#ddd6fe;margin:6px 0 0;font-size:13px;">Santiago Elementary School — Adviser Portal</p>
        </div>
        <div style="background:white;border-radius:12px;padding:24px;margin-bottom:16px;border:1px solid #e2e8f0;">
          <p style="color:#374151;font-size:15px;margin:0 0 12px;">Hello, <strong>${adviserName}</strong>,</p>
          <p style="color:#6b7280;font-size:14px;margin:0 0 16px;line-height:1.6;">
            Your adviser account has been created by the school principal.
            ${assignmentText}
          </p>
          <p style="color:#6b7280;font-size:14px;margin:0 0 16px;">
            Use the credentials below to log in. You will be asked to create a permanent password on your first login.
          </p>

          <!-- Assignment summary -->
          <div style="background:#f5f3ff;border:1px solid #ddd6fe;border-radius:10px;padding:20px;margin:16px 0;">
            <p style="margin:0 0 10px;font-size:12px;font-weight:700;color:#5b21b6;text-transform:uppercase;">Class Assignment</p>
            <table style="width:100%;font-size:14px;">
              <tr>
                <td style="color:#6b7280;padding:4px 0;width:160px;">Grade Level:</td>
                <td style="color:#111827;font-weight:600;">${grade}</td>
              </tr>
              ${sectionsHtml}
            </table>
          </div>

          <!-- Login credentials -->
          <div style="background:#f5f3ff;border:1px solid #ddd6fe;border-radius:10px;padding:20px;margin:16px 0;">
            <p style="margin:0 0 8px;font-size:12px;font-weight:700;color:#5b21b6;text-transform:uppercase;">Your Login Credentials</p>
            <table style="width:100%;font-size:14px;">
              <tr>
                <td style="color:#6b7280;padding:4px 0;width:160px;">Email:</td>
                <td style="color:#111827;font-weight:600;">${adviserEmail}</td>
              </tr>
              <tr>
                <td style="color:#6b7280;padding:4px 0;">Temporary Password:</td>
                <td>
                  <span style="font-family:monospace;font-size:18px;font-weight:700;color:#5b21b6;background:#ede9fe;padding:4px 10px;border-radius:6px;letter-spacing:2px;">
                    ${tempPassword}
                  </span>
                </td>
              </tr>
            </table>
          </div>

          <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px 16px;margin-top:12px;">
            <p style="margin:0;font-size:12px;color:#92400e;">
              ⚠️ <strong>Important:</strong> After logging in, you will be redirected to create your permanent password. Do not share this password with anyone.
            </p>
          </div>
        </div>
        <p style="color:#9ca3af;font-size:12px;text-align:center;margin:0;">
          This is an automated message from ParentConnect · Santiago Elementary School.<br/>Please do not reply.
        </p>
      </div>`,
  });
}

// Guidance: account created temp password email
export async function sendGuidanceTempPasswordEmail({
  guidanceEmail,
  guidanceName,
  tempPassword,
}: {
  guidanceEmail: string;
  guidanceName: string;
  tempPassword: string;
}) {
  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: guidanceEmail,
    subject: "Your Guidance Account Has Been Created - Temporary Password",
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f8fafc;padding:32px;border-radius:16px;">
        <div style="background:#0ea5e9;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px;">
          <h1 style="color:white;margin:0;font-size:22px;">ParentConnect</h1>
          <p style="color:#e0f2fe;margin:6px 0 0;font-size:13px;">Santiago Elementary School - Guidance Portal</p>
        </div>
        <div style="background:white;border-radius:12px;padding:24px;margin-bottom:16px;border:1px solid #e2e8f0;">
          <p style="color:#374151;font-size:15px;margin:0 0 12px;">Hello, <strong>${guidanceName}</strong>,</p>
          <p style="color:#6b7280;font-size:14px;margin:0 0 16px;line-height:1.6;">
            Your Guidance Counselor account has been created. Use the credentials below to log in.
            You will be asked to create a permanent password on your first login.
          </p>
          <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:10px;padding:20px;margin:16px 0;">
            <p style="margin:0 0 8px;font-size:12px;font-weight:700;color:#0369a1;text-transform:uppercase;">Your Login Credentials</p>
            <table style="width:100%;font-size:14px;">
              <tr>
                <td style="color:#6b7280;padding:4px 0;width:160px;">Email:</td>
                <td style="color:#111827;font-weight:600;">${guidanceEmail}</td>
              </tr>
              <tr>
                <td style="color:#6b7280;padding:4px 0;">Temporary Password:</td>
                <td>
                  <span style="font-family:monospace;font-size:18px;font-weight:700;color:#0369a1;background:#e0f2fe;padding:4px 10px;border-radius:6px;letter-spacing:2px;">
                    ${tempPassword}
                  </span>
                </td>
              </tr>
            </table>
          </div>
          <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px 16px;margin-top:12px;">
            <p style="margin:0;font-size:12px;color:#92400e;">
              <strong>Important:</strong> After logging in, you will be redirected to create your permanent password. Do not share this password with anyone.
            </p>
          </div>
        </div>
        <p style="color:#9ca3af;font-size:12px;text-align:center;margin:0;">
          This is an automated message from ParentConnect - Santiago Elementary School.<br/>Please do not reply.
        </p>
      </div>`,
  });
}

export async function sendPrincipalTempPasswordEmail({
  principalEmail,
  principalName,
  tempPassword,
  effectiveDate,
}: {
  principalEmail: string;
  principalName: string;
  tempPassword: string;
  effectiveDate?: string;
}) {
  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: principalEmail,
    subject: "Your Principal Account Has Been Created - Temporary Password",
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f8fafc;padding:32px;border-radius:16px;">
        <div style="background:#6d28d9;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px;">
          <h1 style="color:white;margin:0;font-size:22px;">ParentConnect</h1>
          <p style="color:#ede9fe;margin:6px 0 0;font-size:13px;">Santiago Elementary School - Principal Portal</p>
        </div>
        <div style="background:white;border-radius:12px;padding:24px;margin-bottom:16px;border:1px solid #e2e8f0;">
          <p style="color:#374151;font-size:15px;margin:0 0 12px;">Hello, <strong>${principalName}</strong>,</p>
          <p style="color:#6b7280;font-size:14px;margin:0 0 16px;line-height:1.6;">
            Your Principal account has been created through Principal Succession${effectiveDate ? ` effective <strong>${effectiveDate}</strong>` : ""}.
            Use the credentials below to log in. You will be asked to create a permanent password on your first login.
          </p>
          <div style="background:#f5f3ff;border:1px solid #ddd6fe;border-radius:10px;padding:20px;margin:16px 0;">
            <p style="margin:0 0 8px;font-size:12px;font-weight:700;color:#5b21b6;text-transform:uppercase;">Your Login Credentials</p>
            <table style="width:100%;font-size:14px;">
              <tr>
                <td style="color:#6b7280;padding:4px 0;width:160px;">Email:</td>
                <td style="color:#111827;font-weight:600;">${principalEmail}</td>
              </tr>
              <tr>
                <td style="color:#6b7280;padding:4px 0;">Temporary Password:</td>
                <td>
                  <span style="font-family:monospace;font-size:18px;font-weight:700;color:#5b21b6;background:#ede9fe;padding:4px 10px;border-radius:6px;letter-spacing:2px;">
                    ${tempPassword}
                  </span>
                </td>
              </tr>
            </table>
          </div>
          <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px 16px;margin-top:12px;">
            <p style="margin:0;font-size:12px;color:#92400e;">
              <strong>Important:</strong> After logging in, you will be redirected to create your permanent password. Do not share this password with anyone.
            </p>
          </div>
        </div>
        <p style="color:#9ca3af;font-size:12px;text-align:center;margin:0;">
          This is an automated message from ParentConnect - Santiago Elementary School.<br/>Please do not reply.
        </p>
      </div>`,
  });
}

export async function sendIctTempPasswordEmail({
  ictEmail,
  ictName,
  tempPassword,
}: {
  ictEmail: string;
  ictName: string;
  tempPassword: string;
}) {
  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: ictEmail,
    subject: "Your ICT Admin Account Has Been Created - Temporary Password",
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f8fafc;padding:32px;border-radius:16px;">
        <div style="background:#274e13;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px;">
          <h1 style="color:white;margin:0;font-size:22px;">ParentConnect</h1>
          <p style="color:#dcfce7;margin:6px 0 0;font-size:13px;">Santiago Elementary School - ICT Portal</p>
        </div>
        <div style="background:white;border-radius:12px;padding:24px;margin-bottom:16px;border:1px solid #e2e8f0;">
          <p style="color:#374151;font-size:15px;margin:0 0 12px;">Hello, <strong>${ictName}</strong>,</p>
          <p style="color:#6b7280;font-size:14px;margin:0 0 16px;line-height:1.6;">
            Your ICT Admin account has been created. Use the credentials below to log in.
            You will be asked to create a permanent password on your first login.
          </p>
          <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:20px;margin:16px 0;">
            <p style="margin:0 0 8px;font-size:12px;font-weight:700;color:#166534;text-transform:uppercase;">Your Login Credentials</p>
            <table style="width:100%;font-size:14px;">
              <tr>
                <td style="color:#6b7280;padding:4px 0;width:160px;">Email:</td>
                <td style="color:#111827;font-weight:600;">${ictEmail}</td>
              </tr>
              <tr>
                <td style="color:#6b7280;padding:4px 0;">Temporary Password:</td>
                <td>
                  <span style="font-family:monospace;font-size:18px;font-weight:700;color:#166534;background:#dcfce7;padding:4px 10px;border-radius:6px;letter-spacing:2px;">
                    ${tempPassword}
                  </span>
                </td>
              </tr>
            </table>
          </div>
          <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px 16px;margin-top:12px;">
            <p style="margin:0;font-size:12px;color:#92400e;">
              <strong>Important:</strong> After logging in, you will be redirected to create your permanent password. Do not share this password with anyone.
            </p>
          </div>
        </div>
        <p style="color:#9ca3af;font-size:12px;text-align:center;margin:0;">
          This is an automated message from ParentConnect - Santiago Elementary School.<br/>Please do not reply.
        </p>
      </div>`,
  });
}

export async function sendStudentConcernParentNotificationEmail({
  parentEmail,
  parentName,
  studentName,
  adviserName,
  subject,
  concern,
  message,
}: {
  parentEmail: string;
  parentName: string;
  studentName: string;
  adviserName: string;
  subject: string;
  concern?: string | null;
  message?: string | null;
}) {
  const safeParentName = parentName || "";
  const safeStudentName = studentName || "";
  const safeAdviserName = adviserName || "Your child's adviser";
  const safeSubject = subject || "Student Concern";
  const safeConcern = concern || message || "";

  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: parentEmail,
    subject: `Student Concern Notification - ${safeStudentName}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f8fafc;padding:32px;border-radius:16px;">
        <div style="background:#2563eb;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px;">
          <h1 style="color:white;margin:0;font-size:22px;">ParentConnect</h1>
          <p style="color:#dbeafe;margin:6px 0 0;font-size:13px;">Santiago Elementary School</p>
        </div>
        <div style="background:white;border-radius:12px;padding:24px;margin-bottom:16px;border:1px solid #e2e8f0;">
          <p style="color:#374151;font-size:15px;margin:0 0 12px;">Hello, <strong>${safeParentName}</strong>,</p>
          <p style="color:#6b7280;font-size:14px;margin:0 0 16px;line-height:1.6;">
            ${safeAdviserName} has notified you about a concern involving <strong>${safeStudentName}</strong>.
            You can view and reply to this message in your Parent Reports dashboard.
          </p>
          <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:16px;margin:16px 0;">
            <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#1d4ed8;">${safeSubject}</p>
            <p style="margin:0 0 8px;font-size:12px;font-weight:700;color:#1d4ed8;text-transform:uppercase;">Concern</p>
            <p style="margin:0;color:#334155;font-size:14px;line-height:1.6;white-space:pre-wrap;">${safeConcern}</p>
          </div>
        </div>
        <p style="color:#9ca3af;font-size:12px;text-align:center;margin:0;">
          This is an automated message from ParentConnect - Santiago Elementary School.
        </p>
      </div>`,
  });
}

export async function sendParentReportAdviserEmail({
  adviserEmail,
  adviserName,
  parentName,
  studentName,
  subject,
  categories,
  message,
  hasAttachments = false,
}: {
  adviserEmail: string;
  adviserName: string;
  parentName: string;
  studentName: string;
  subject: string;
  categories: string[];
  message: string;
  hasAttachments?: boolean;
}) {
  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: adviserEmail,
    subject: `New Parent Report - ${studentName}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f8fafc;padding:32px;border-radius:16px;">
        <div style="background:#f59e0b;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px;">
          <h1 style="color:white;margin:0;font-size:22px;">ParentConnect</h1>
          <p style="color:#fffbeb;margin:6px 0 0;font-size:13px;">Santiago Elementary School - Adviser Portal</p>
        </div>
        <div style="background:white;border-radius:12px;padding:24px;margin-bottom:16px;border:1px solid #e2e8f0;">
          <p style="color:#374151;font-size:15px;margin:0 0 12px;">Hello, <strong>${adviserName}</strong>,</p>
          <p style="color:#6b7280;font-size:14px;margin:0 0 16px;line-height:1.6;">
            <strong>${parentName}</strong> submitted a new report/concern for <strong>${studentName}</strong>.
            Please review it in your Adviser Reports dashboard.
          </p>
          ${hasAttachments ? `
          <p style="color:#6b7280;font-size:14px;margin:0 0 16px;line-height:1.6;">
            The parent included attachments. Please check the portal to view them.
          </p>` : ""}
          <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:16px;margin:16px 0;">
            <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#b45309;">${subject}</p>
            <p style="margin:0 0 10px;color:#64748b;font-size:12px;">${categories.join(", ")}</p>
            <p style="margin:0;color:#334155;font-size:14px;line-height:1.6;white-space:pre-wrap;">${message}</p>
          </div>
        </div>
        <p style="color:#9ca3af;font-size:12px;text-align:center;margin:0;">
          This is an automated message from ParentConnect - Santiago Elementary School.
        </p>
      </div>`,
  });
}

export async function sendStudentReportAdviserEmail({
  adviserEmail,
  adviserName,
  studentName,
  grade,
  section,
  description,
  contact,
}: {
  adviserEmail: string;
  adviserName: string;
  studentName: string;
  grade: string;
  section: string;
  description: string;
  contact?: string | null;
}) {
  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: adviserEmail,
    subject: `New Student Report - ${studentName}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f8fafc;padding:32px;border-radius:16px;">
        <div style="background:#f59e0b;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px;">
          <h1 style="color:white;margin:0;font-size:22px;">ParentConnect</h1>
          <p style="color:#fffbeb;margin:6px 0 0;font-size:13px;">Santiago Elementary School - Adviser Portal</p>
        </div>
        <div style="background:white;border-radius:12px;padding:24px;margin-bottom:16px;border:1px solid #e2e8f0;">
          <p style="color:#374151;font-size:15px;margin:0 0 12px;">Hello, <strong>${adviserName}</strong>,</p>
          <p style="color:#6b7280;font-size:14px;margin:0 0 16px;line-height:1.6;">
            A student from your advisory class submitted a new report/concern.
            Please review it in your Adviser Reports dashboard.
          </p>
          <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:16px;margin:16px 0;">
            <p style="margin:0 0 10px;font-size:12px;font-weight:700;color:#b45309;text-transform:uppercase;">Student Details</p>
            <table style="width:100%;font-size:14px;margin-bottom:12px;">
              <tr><td style="color:#6b7280;padding:4px 0;width:130px;">Student</td><td style="color:#111827;font-weight:600;">${studentName}</td></tr>
              <tr><td style="color:#6b7280;padding:4px 0;">Class</td><td style="color:#111827;font-weight:600;">${grade} - ${section}</td></tr>
              ${contact ? `<tr><td style="color:#6b7280;padding:4px 0;">Contact</td><td style="color:#111827;font-weight:600;">${contact}</td></tr>` : ""}
            </table>
            <p style="margin:0 0 8px;font-size:12px;font-weight:700;color:#b45309;text-transform:uppercase;">Concern</p>
            <p style="margin:0;color:#334155;font-size:14px;line-height:1.6;white-space:pre-wrap;">${description}</p>
          </div>
        </div>
        <p style="color:#9ca3af;font-size:12px;text-align:center;margin:0;">
          This is an automated message from ParentConnect - Santiago Elementary School.
        </p>
      </div>`,
  });
}

export async function sendAdviserParentMessageEmail({
  parentEmail,
  parentName,
  studentName,
  adviserName,
  subject,
  message,
  hasAttachments = false,
}: {
  parentEmail: string;
  parentName: string;
  studentName: string;
  adviserName: string;
  subject: string;
  message: string;
  hasAttachments?: boolean;
}) {
  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: parentEmail,
    subject: `Adviser Message - ${studentName}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f8fafc;padding:32px;border-radius:16px;">
        <div style="background:#10b981;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px;">
          <h1 style="color:white;margin:0;font-size:22px;">ParentConnect</h1>
          <p style="color:#d1fae5;margin:6px 0 0;font-size:13px;">Santiago Elementary School</p>
        </div>
        <div style="background:white;border-radius:12px;padding:24px;margin-bottom:16px;border:1px solid #e2e8f0;">
          <p style="color:#374151;font-size:15px;margin:0 0 12px;">Hello, <strong>${parentName}</strong>,</p>
          <p style="color:#6b7280;font-size:14px;margin:0 0 16px;line-height:1.6;">
            <strong>${adviserName}</strong> sent you a message regarding <strong>${studentName}</strong>.
            You can view and reply to this message in your Parent Reports dashboard.
          </p>
          ${hasAttachments ? `
          <p style="color:#6b7280;font-size:14px;margin:0 0 16px;line-height:1.6;">
            To see the attachments, please check your Parent Portal.
          </p>` : ""}
          <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px;margin:16px 0;">
            <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#047857;">${subject}</p>
            <p style="margin:0;color:#334155;font-size:14px;line-height:1.6;white-space:pre-wrap;">${message}</p>
          </div>
        </div>
        <p style="color:#9ca3af;font-size:12px;text-align:center;margin:0;">
          This is an automated message from ParentConnect - Santiago Elementary School.
        </p>
      </div>`,
  });
}

export async function sendPrincipalParentMessageEmail({
  parentEmail,
  parentName,
  studentName,
  principalName,
  subject,
  message,
  hasAttachments = false,
}: {
  parentEmail: string;
  parentName: string;
  studentName: string;
  principalName: string;
  subject: string;
  message: string;
  hasAttachments?: boolean;
}) {
  void principalName;
  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: parentEmail,
    subject: `Principal Message - ${studentName}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f8fafc;padding:32px;border-radius:16px;">
        <div style="background:#7c3aed;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px;">
          <h1 style="color:white;margin:0;font-size:22px;">ParentConnect</h1>
          <p style="color:#ede9fe;margin:6px 0 0;font-size:13px;">Santiago Elementary School</p>
        </div>
        <div style="background:white;border-radius:12px;padding:24px;margin-bottom:16px;border:1px solid #e2e8f0;">
          <p style="color:#374151;font-size:15px;margin:0 0 12px;">Hello, <strong>${parentName}</strong>,</p>
          <p style="color:#6b7280;font-size:14px;margin:0 0 16px;line-height:1.6;">
            Principal sent you a message regarding <strong>${studentName}</strong>.
            You can view and reply to this message in your Parent Reports dashboard.
          </p>
          ${hasAttachments ? `
          <p style="color:#6b7280;font-size:14px;margin:0 0 16px;line-height:1.6;">
            To see the attachments, please check your Parent Portal.
          </p>` : ""}
          <div style="background:#f5f3ff;border:1px solid #ddd6fe;border-radius:10px;padding:16px;margin:16px 0;">
            <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#6d28d9;">${subject}</p>
            <p style="margin:0;color:#334155;font-size:14px;line-height:1.6;white-space:pre-wrap;">${message}</p>
          </div>
        </div>
        <p style="color:#9ca3af;font-size:12px;text-align:center;margin:0;">
          This is an automated message from ParentConnect - Santiago Elementary School.
        </p>
      </div>`,
  });
}

export async function sendPrincipalStaffMessageEmail({
  staffEmail,
  staffName,
  staffRole,
  principalName,
  subject,
  categories,
  message,
  hasAttachments = false,
}: {
  staffEmail: string;
  staffName: string;
  staffRole: string;
  principalName: string;
  subject: string;
  categories: string[];
  message: string;
  hasAttachments?: boolean;
}) {
  void principalName;
  void staffRole;
  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: staffEmail,
    subject: `Principal Message - ${subject}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f8fafc;padding:32px;border-radius:16px;">
        <div style="background:#7c3aed;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px;">
          <h1 style="color:white;margin:0;font-size:22px;">ParentConnect</h1>
          <p style="color:#ede9fe;margin:6px 0 0;font-size:13px;">Santiago Elementary School</p>
        </div>
        <div style="background:white;border-radius:12px;padding:24px;margin-bottom:16px;border:1px solid #e2e8f0;">
          <p style="color:#374151;font-size:15px;margin:0 0 12px;">Hello, <strong>${staffName}</strong>,</p>
          <p style="color:#6b7280;font-size:14px;margin:0 0 16px;line-height:1.6;">
            Principal sent you a message.
          </p>
          ${hasAttachments ? `
          <p style="color:#6b7280;font-size:14px;margin:0 0 16px;line-height:1.6;">
            Please check your portal to access the attachments.
          </p>` : ""}
          <div style="background:#f5f3ff;border:1px solid #ddd6fe;border-radius:10px;padding:16px;margin:16px 0;">
            <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#6d28d9;">${subject}</p>
            <p style="margin:0 0 10px;color:#64748b;font-size:12px;">${categories.join(", ")}</p>
            <p style="margin:0;color:#334155;font-size:14px;line-height:1.6;white-space:pre-wrap;">${message}</p>
          </div>
        </div>
        <p style="color:#9ca3af;font-size:12px;text-align:center;margin:0;">
          This is an automated message from ParentConnect - Santiago Elementary School.
        </p>
      </div>`,
  });
}

export async function sendAdviserPrincipalMessageEmail({
  principalEmail,
  principalName,
  adviserName,
  subject,
  categories,
  message,
  hasAttachments = false,
}: {
  principalEmail: string;
  principalName: string;
  adviserName: string;
  subject: string;
  categories: string[];
  message: string;
  hasAttachments?: boolean;
}) {
  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: principalEmail,
    subject: `Adviser Message - ${subject}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f8fafc;padding:32px;border-radius:16px;">
        <div style="background:#10b981;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px;">
          <h1 style="color:white;margin:0;font-size:22px;">ParentConnect</h1>
          <p style="color:#d1fae5;margin:6px 0 0;font-size:13px;">Santiago Elementary School</p>
        </div>
        <div style="background:white;border-radius:12px;padding:24px;margin-bottom:16px;border:1px solid #e2e8f0;">
          <p style="color:#374151;font-size:15px;margin:0 0 12px;">Hello, <strong>${principalName}</strong>,</p>
          <p style="color:#6b7280;font-size:14px;margin:0 0 16px;line-height:1.6;">
            <strong>${adviserName}</strong> sent you a message.
          </p>
          ${hasAttachments ? `
          <p style="color:#6b7280;font-size:14px;margin:0 0 16px;line-height:1.6;">
            Please check your portal to access the attachments.
          </p>` : ""}
          <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px;margin:16px 0;">
            <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#047857;">${subject}</p>
            <p style="margin:0 0 10px;color:#64748b;font-size:12px;">${categories.join(", ")}</p>
            <p style="margin:0;color:#334155;font-size:14px;line-height:1.6;white-space:pre-wrap;">${message}</p>
          </div>
        </div>
        <p style="color:#9ca3af;font-size:12px;text-align:center;margin:0;">
          This is an automated message from ParentConnect - Santiago Elementary School.
        </p>
      </div>`,
  });
}

export async function sendGuidanceEscalationEmail({
  guidanceEmail,
  guidanceName,
  adviserName,
  parentName,
  studentName,
  subject,
  concern,
}: {
  guidanceEmail: string;
  guidanceName?: string | null;
  adviserName?: string | null;
  parentName?: string | null;
  studentName?: string | null;
  subject?: string | null;
  concern?: string | null;
}) {
  const safeGuidanceName = guidanceName || "Guidance Counselor";
  const safeAdviserName = adviserName || "An adviser";
  const safeStudentName = studentName || "a student";
  const safeSubject = subject || "Escalated Concern";
  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: guidanceEmail,
    subject: `Escalated Report - ${safeStudentName}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f8fafc;padding:32px;border-radius:16px;">
        <div style="background:#0ea5e9;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px;">
          <h1 style="color:white;margin:0;font-size:22px;">ParentConnect</h1>
          <p style="color:#e0f2fe;margin:6px 0 0;font-size:13px;">Santiago Elementary School - Guidance Office</p>
        </div>
        <div style="background:white;border-radius:12px;padding:24px;margin-bottom:16px;border:1px solid #e2e8f0;">
          <p style="color:#374151;font-size:15px;margin:0 0 12px;">Hello, <strong>${safeGuidanceName}</strong>,</p>
          <p style="color:#6b7280;font-size:14px;margin:0 0 16px;line-height:1.6;">
            <strong>${safeAdviserName}</strong> escalated a parent report/concern to Guidance.
          </p>
          <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:10px;padding:16px;margin:16px 0;">
            <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#0369a1;">${safeSubject}</p>
            ${parentName ? `<p style="margin:0 0 6px;color:#64748b;font-size:12px;">Parent: ${parentName}</p>` : ""}
            <p style="margin:0 0 10px;color:#64748b;font-size:12px;">Student: ${safeStudentName}</p>
            ${concern ? `<p style="margin:0;color:#334155;font-size:14px;line-height:1.6;white-space:pre-wrap;">${concern}</p>` : ""}
          </div>
        </div>
        <p style="color:#9ca3af;font-size:12px;text-align:center;margin:0;">This is an automated message from ParentConnect - Santiago Elementary School.</p>
      </div>`,
  });
}

export async function sendGuidancePrincipalEscalationEmail({
  principalEmail,
  principalName,
  guidanceName,
  parentName,
  studentName,
  subject,
  concern,
}: {
  principalEmail: string;
  principalName?: string | null;
  guidanceName?: string | null;
  parentName?: string | null;
  studentName?: string | null;
  subject?: string | null;
  concern?: string | null;
}) {
  const safePrincipalName = principalName || "Principal";
  const safeGuidanceName = guidanceName || "Guidance Counselor";
  const safeStudentName = studentName || "a student";
  const safeSubject = subject || "Escalated Report";
  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: principalEmail,
    subject: `Guidance Escalated Report - ${safeStudentName}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f8fafc;padding:32px;border-radius:16px;">
        <div style="background:#7c3aed;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px;">
          <h1 style="color:white;margin:0;font-size:22px;">ParentConnect</h1>
          <p style="color:#ede9fe;margin:6px 0 0;font-size:13px;">Santiago Elementary School - Principal Office</p>
        </div>
        <div style="background:white;border-radius:12px;padding:24px;margin-bottom:16px;border:1px solid #e2e8f0;">
          <p style="color:#374151;font-size:15px;margin:0 0 12px;">Hello, <strong>${safePrincipalName}</strong>,</p>
          <p style="color:#6b7280;font-size:14px;margin:0 0 16px;line-height:1.6;">
            <strong>${safeGuidanceName}</strong> escalated to you about this Report/Concern.
          </p>
          <div style="background:#f5f3ff;border:1px solid #ddd6fe;border-radius:10px;padding:16px;margin:16px 0;">
            <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#6d28d9;">${safeSubject}</p>
            ${parentName ? `<p style="margin:0 0 6px;color:#64748b;font-size:12px;">Parent: ${parentName}</p>` : ""}
            <p style="margin:0 0 10px;color:#64748b;font-size:12px;">Student: ${safeStudentName}</p>
            ${concern ? `<p style="margin:0;color:#334155;font-size:14px;line-height:1.6;white-space:pre-wrap;">${concern}</p>` : ""}
          </div>
        </div>
        <p style="color:#9ca3af;font-size:12px;text-align:center;margin:0;">This is an automated message from ParentConnect - Santiago Elementary School.</p>
      </div>`,
  });
}

export async function sendGuidanceMessageEmail({
  recipientEmail,
  recipientName,
  recipientRole,
  guidanceName,
  subject,
  message,
  hasAttachments = false,
}: {
  recipientEmail: string;
  recipientName?: string | null;
  recipientRole?: string | null;
  guidanceName?: string | null;
  subject?: string | null;
  message?: string | null;
  hasAttachments?: boolean;
}) {
  const safeRecipientName = recipientName || recipientRole || "there";
  const safeGuidanceName = guidanceName || "Guidance Counselor";
  const safeSubject = subject || "Guidance Message";
  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: recipientEmail,
    subject: `Guidance Message - ${safeSubject}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f8fafc;padding:32px;border-radius:16px;">
        <div style="background:#0ea5e9;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px;">
          <h1 style="color:white;margin:0;font-size:22px;">ParentConnect</h1>
          <p style="color:#e0f2fe;margin:6px 0 0;font-size:13px;">Santiago Elementary School</p>
        </div>
        <div style="background:white;border-radius:12px;padding:24px;margin-bottom:16px;border:1px solid #e2e8f0;">
          <p style="color:#374151;font-size:15px;margin:0 0 12px;">Hello, <strong>${safeRecipientName}</strong>,</p>
          <p style="color:#6b7280;font-size:14px;margin:0 0 16px;line-height:1.6;">
            <strong>${safeGuidanceName}</strong> sent you a message.
          </p>
          ${hasAttachments ? `<p style="color:#6b7280;font-size:14px;margin:0 0 16px;line-height:1.6;">Please check your portal to view the attachments.</p>` : ""}
          <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:10px;padding:16px;margin:16px 0;">
            <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#0369a1;">${safeSubject}</p>
            ${message ? `<p style="margin:0;color:#334155;font-size:14px;line-height:1.6;white-space:pre-wrap;">${message}</p>` : ""}
          </div>
        </div>
        <p style="color:#9ca3af;font-size:12px;text-align:center;margin:0;">This is an automated message from ParentConnect - Santiago Elementary School.</p>
      </div>`,
  });
}

export async function sendStaffMessageEmail({
  recipientEmail,
  recipientName,
  senderName,
  senderRole,
  subject,
  message,
  hasAttachments = false,
}: {
  recipientEmail: string;
  recipientName?: string | null;
  senderName?: string | null;
  senderRole?: string | null;
  subject?: string | null;
  message?: string | null;
  hasAttachments?: boolean;
}) {
  const safeRecipientName = recipientName || "there";
  const safeSenderName = senderName || "School staff";
  const safeSenderRole = senderRole || "Staff";
  const safeSubject = subject || "Staff Message";
  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: recipientEmail,
    subject: `${safeSenderRole} Message - ${safeSubject}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f8fafc;padding:32px;border-radius:16px;">
        <div style="background:#10b981;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px;">
          <h1 style="color:white;margin:0;font-size:22px;">ParentConnect</h1>
          <p style="color:#d1fae5;margin:6px 0 0;font-size:13px;">Santiago Elementary School</p>
        </div>
        <div style="background:white;border-radius:12px;padding:24px;margin-bottom:16px;border:1px solid #e2e8f0;">
          <p style="color:#374151;font-size:15px;margin:0 0 12px;">Hello, <strong>${safeRecipientName}</strong>,</p>
          <p style="color:#6b7280;font-size:14px;margin:0 0 16px;line-height:1.6;">
            <strong>${safeSenderName}</strong> sent you a message.
          </p>
          ${hasAttachments ? `<p style="color:#6b7280;font-size:14px;margin:0 0 16px;line-height:1.6;">Please check your portal to view the attachments.</p>` : ""}
          <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px;margin:16px 0;">
            <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#047857;">${safeSubject}</p>
            ${message ? `<p style="margin:0;color:#334155;font-size:14px;line-height:1.6;white-space:pre-wrap;">${message}</p>` : ""}
          </div>
        </div>
        <p style="color:#9ca3af;font-size:12px;text-align:center;margin:0;">This is an automated message from ParentConnect - Santiago Elementary School.</p>
      </div>`,
  });
}

// ── Adviser: new excuse letter submitted by parent ────────────────────────────
export async function sendExcuseLetterToAdviserEmail({
  adviserEmail,
  adviserName,
  parentName,
  studentName,
  dateFrom,
  dateTo,
  message,
}: {
  adviserEmail: string;
  adviserName: string;
  parentName: string;
  studentName: string;
  dateFrom: string;
  dateTo: string;
  message: string;
}) {
  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: adviserEmail,
    subject: `Excuse Letter Submitted — ${studentName}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f8fafc;padding:32px;border-radius:16px;">
        <div style="background:#2563eb;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px;">
          <h1 style="color:white;margin:0;font-size:22px;">ParentConnect</h1>
          <p style="color:#dbeafe;margin:6px 0 0;font-size:13px;">Santiago Elementary School — Adviser Portal</p>
        </div>
        <div style="background:white;border-radius:12px;padding:24px;margin-bottom:16px;border:1px solid #e2e8f0;">
          <p style="color:#374151;font-size:15px;margin:0 0 12px;">Hello, <strong>${adviserName}</strong>,</p>
          <p style="color:#6b7280;font-size:14px;margin:0 0 16px;line-height:1.6;">
            <strong>${parentName}</strong> submitted an excuse letter for <strong>${studentName}</strong>.
            Please review it in your Attendance dashboard under <strong>Excuse Approval</strong>.
          </p>
          <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:20px;margin:16px 0;">
            <p style="margin:0 0 10px;font-size:12px;font-weight:700;color:#1d4ed8;text-transform:uppercase;">Excuse Details</p>
            <table style="width:100%;font-size:14px;">
              <tr><td style="color:#6b7280;padding:4px 0;width:130px;">Student:</td><td style="color:#111827;font-weight:600;">${studentName}</td></tr>
              <tr><td style="color:#6b7280;padding:4px 0;">Date From:</td><td style="color:#111827;font-weight:600;">${dateFrom}</td></tr>
              <tr><td style="color:#6b7280;padding:4px 0;">Date To:</td><td style="color:#111827;font-weight:600;">${dateTo}</td></tr>
            </table>
            <p style="margin:12px 0 4px;font-size:12px;font-weight:700;color:#1d4ed8;text-transform:uppercase;">Message</p>
            <p style="margin:0;color:#334155;font-size:14px;line-height:1.6;white-space:pre-wrap;">${message}</p>
          </div>
        </div>
        <p style="color:#9ca3af;font-size:12px;text-align:center;margin:0;">This is an automated message from ParentConnect · Santiago Elementary School.<br/>Please do not reply.</p>
      </div>`,
  });
}

// ── Parent: excuse letter status update (approved or declined) ────────────────
export async function sendExcuseLetterStatusEmail({
  parentEmail,
  parentName,
  studentName,
  dateFrom,
  dateTo,
  status,
  declineReason,
}: {
  parentEmail: string;
  parentName: string;
  studentName: string;
  dateFrom: string;
  dateTo: string;
  status: "Approved" | "Declined";
  declineReason?: string;
}) {
  const isApproved = status === "Approved";
  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: parentEmail,
    subject: `Excuse Letter ${status} — ${studentName}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f8fafc;padding:32px;border-radius:16px;">
        <div style="background:${isApproved ? "#10b981" : "#ef4444"};border-radius:12px;padding:24px;text-align:center;margin-bottom:24px;">
          <h1 style="color:white;margin:0;font-size:22px;">ParentConnect</h1>
          <p style="color:${isApproved ? "#d1fae5" : "#fecaca"};margin:6px 0 0;font-size:13px;">Santiago Elementary School</p>
        </div>
        <div style="background:white;border-radius:12px;padding:24px;margin-bottom:16px;border:1px solid #e2e8f0;">
          <p style="color:#374151;font-size:15px;margin:0 0 12px;">Hello, <strong>${parentName}</strong>,</p>
          <p style="color:#6b7280;font-size:14px;margin:0 0 16px;line-height:1.6;">
            The excuse letter you submitted for <strong>${studentName}</strong> has been
            <strong style="color:${isApproved ? "#059669" : "#dc2626"};">${status}</strong>.
          </p>
          <div style="background:${isApproved ? "#f0fdf4" : "#fef2f2"};border:1px solid ${isApproved ? "#bbf7d0" : "#fecaca"};border-radius:10px;padding:20px;margin:16px 0;">
            <p style="margin:0 0 10px;font-size:12px;font-weight:700;color:${isApproved ? "#065f46" : "#991b1b"};text-transform:uppercase;">Excuse Details</p>
            <table style="width:100%;font-size:14px;">
              <tr><td style="color:#6b7280;padding:4px 0;width:130px;">Student:</td><td style="color:#111827;font-weight:600;">${studentName}</td></tr>
              <tr><td style="color:#6b7280;padding:4px 0;">Date From:</td><td style="color:#111827;font-weight:600;">${dateFrom}</td></tr>
              <tr><td style="color:#6b7280;padding:4px 0;">Date To:</td><td style="color:#111827;font-weight:600;">${dateTo}</td></tr>
              <tr><td style="color:#6b7280;padding:4px 0;">Status:</td><td style="font-weight:700;color:${isApproved ? "#059669" : "#dc2626"};">${status}</td></tr>
            </table>
            ${!isApproved && declineReason ? `
            <p style="margin:12px 0 4px;font-size:12px;font-weight:700;color:#991b1b;text-transform:uppercase;">Reason for Declining</p>
            <p style="margin:0;color:#334155;font-size:14px;line-height:1.6;white-space:pre-wrap;">${declineReason}</p>` : ""}
          </div>
          ${isApproved ? `
          <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px 16px;">
            <p style="margin:0;font-size:12px;color:#92400e;">The excused dates have been automatically marked in the attendance records.</p>
          </div>` : ""}
        </div>
        <p style="color:#9ca3af;font-size:12px;text-align:center;margin:0;">This is an automated message from ParentConnect · Santiago Elementary School.<br/>Please do not reply.</p>
      </div>`,
  });
}
export async function sendPrincipalAnnouncementEmail({
  recipientEmail,
  recipientName,
  principalName,
  title,
  message,
  audience,
}: {
  recipientEmail: string;
  recipientName: string;
  principalName: string;
  title: string;
  message: string;
  audience: string;
}) {
  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: recipientEmail,
    subject: `📢 New Announcement from the Principal — ${title}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f8fafc;padding:32px;border-radius:16px;">
        <div style="background:#522081;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px;">
          <h1 style="color:white;margin:0;font-size:22px;">ParentConnect</h1>
          <p style="color:#ede9fe;margin:6px 0 0;font-size:13px;">Santiago Elementary School — Principal's Office</p>
        </div>
        <div style="background:white;border-radius:12px;padding:24px;margin-bottom:16px;border:1px solid #e2e8f0;">
          <p style="color:#374151;font-size:15px;margin:0 0 12px;">Hello, <strong>${recipientName}</strong>,</p>
          <p style="color:#6b7280;font-size:14px;margin:0 0 16px;line-height:1.6;">
            <strong>${principalName}</strong> posted a new announcement for <strong>${audience}</strong>.
          </p>
          <div style="background:#f5f3ff;border:1px solid #ddd6fe;border-radius:10px;padding:20px;margin:16px 0;">
            <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#6d28d9;">${title}</p>
            <p style="margin:0;color:#334155;font-size:14px;line-height:1.7;white-space:pre-wrap;">${message}</p>
          </div>
        </div>
        <p style="color:#9ca3af;font-size:12px;text-align:center;margin:0;">
          This is an automated message from ParentConnect · Santiago Elementary School.<br/>Please do not reply.
        </p>
      </div>`,
  });
}
export async function sendGuidanceAnnouncementEmail({
  recipientEmail,
  recipientName,
  guidanceName,
  title,
  message,
  audience,
}: {
  recipientEmail: string;
  recipientName: string;
  guidanceName: string;
  title: string;
  message: string;
  audience: string;
}) {
  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: recipientEmail,
    subject: `📢 New Announcement from Guidance — ${title}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f8fafc;padding:32px;border-radius:16px;">
        <div style="background:#0ea5e9;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px;">
          <h1 style="color:white;margin:0;font-size:22px;">ParentConnect</h1>
          <p style="color:#e0f2fe;margin:6px 0 0;font-size:13px;">Santiago Elementary School — Guidance Office</p>
        </div>
        <div style="background:white;border-radius:12px;padding:24px;margin-bottom:16px;border:1px solid #e2e8f0;">
          <p style="color:#374151;font-size:15px;margin:0 0 12px;">Hello, <strong>${recipientName}</strong>,</p>
          <p style="color:#6b7280;font-size:14px;margin:0 0 16px;line-height:1.6;">
            <strong>${guidanceName}</strong> posted a new announcement for <strong>${audience}</strong>.
          </p>
          <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:10px;padding:20px;margin:16px 0;">
            <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#0369a1;">${title}</p>
            <p style="margin:0;color:#334155;font-size:14px;line-height:1.7;white-space:pre-wrap;">${message}</p>
          </div>
        </div>
        <p style="color:#9ca3af;font-size:12px;text-align:center;margin:0;">
          This is an automated message from ParentConnect · Santiago Elementary School.<br/>Please do not reply.
        </p>
      </div>`,
  });
}
export async function sendAdviserAnnouncementEmail({
  recipientEmail,
  recipientName,
  adviserName,
  message,
  grade,
  sections,
}: {
  recipientEmail: string;
  recipientName: string;
  adviserName: string;
  message: string;
  grade: string;
  sections: string[];
}) {
  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: recipientEmail,
    subject: `📢 Announcement from Your Child's Class Adviser`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f8fafc;padding:32px;border-radius:16px;">
        <div style="background:#10b981;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px;">
          <h1 style="color:white;margin:0;font-size:22px;">ParentConnect</h1>
          <p style="color:#d1fae5;margin:6px 0 0;font-size:13px;">Santiago Elementary School — Adviser Portal</p>
        </div>
        <div style="background:white;border-radius:12px;padding:24px;margin-bottom:16px;border:1px solid #e2e8f0;">
          <p style="color:#374151;font-size:15px;margin:0 0 12px;">Hello, <strong>${recipientName}</strong>,</p>
          <p style="color:#6b7280;font-size:14px;margin:0 0 16px;line-height:1.6;">
            <strong>${adviserName}</strong>, class adviser for <strong>Grade ${grade} — ${sections.join(", ")}</strong>, sent you an announcement.
          </p>
          <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:20px;margin:16px 0;">
            <p style="margin:0;color:#334155;font-size:14px;line-height:1.7;white-space:pre-wrap;">${message}</p>
          </div>
        </div>
        <p style="color:#9ca3af;font-size:12px;text-align:center;margin:0;">
          This is an automated message from ParentConnect · Santiago Elementary School.<br/>Please do not reply.
        </p>
      </div>`,
  });
}
export async function sendIctAnnouncementEmail({
  recipientEmail,
  recipientName,
  senderName,
  title,
  message,
  audience,
}: {
  recipientEmail: string;
  recipientName: string;
  senderName: string;
  title: string;
  message: string;
  audience: string[];
}) {
  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: recipientEmail,
    subject: `📢 New Announcement from ICT Office — ${title}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f8fafc;padding:32px;border-radius:16px;">
        <div style="background:#1a3a0a;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px;">
          <h1 style="color:white;margin:0;font-size:22px;">ParentConnect</h1>
          <p style="color:#dcfce7;margin:6px 0 0;font-size:13px;">Santiago Elementary School — ICT Office</p>
        </div>
        <div style="background:white;border-radius:12px;padding:24px;margin-bottom:16px;border:1px solid #e2e8f0;">
          <p style="color:#374151;font-size:15px;margin:0 0 12px;">Hello, <strong>${recipientName}</strong>,</p>
          <p style="color:#6b7280;font-size:14px;margin:0 0 16px;line-height:1.6;">
            <strong>${senderName}</strong> posted a new announcement for <strong>${audience.join(", ")}</strong>.
          </p>
          <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:20px;margin:16px 0;">
            <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#166534;">${title}</p>
            <p style="margin:0;color:#334155;font-size:14px;line-height:1.7;white-space:pre-wrap;">${message}</p>
          </div>
        </div>
        <p style="color:#9ca3af;font-size:12px;text-align:center;margin:0;">
          This is an automated message from ParentConnect · Santiago Elementary School.<br/>Please do not reply.
        </p>
      </div>`,
  });
}
