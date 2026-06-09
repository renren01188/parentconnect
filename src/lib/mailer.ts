import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST,
  port:   Number(process.env.SMTP_PORT),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

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