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

// ── Existing: temp password email ─────────────────────────────────────────────
export async function sendTempPasswordEmail({
  parentEmail,
  parentName,
  studentName,
  tempPassword,
}: {
  parentEmail:  string;
  parentName:   string;
  studentName:  string;
  tempPassword: string;
}) {
  await transporter.sendMail({
    from:    process.env.SMTP_FROM,
    to:      parentEmail,
    subject: "🎓 Student Account Registered — Your Temporary Password",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f8fafc; padding: 32px; border-radius: 16px;">
        <div style="background: #10b981; border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 24px;">
          <h1 style="color: white; margin: 0; font-size: 22px;">ParentConnect</h1>
          <p style="color: #d1fae5; margin: 6px 0 0; font-size: 13px;">Santiago Elementary School</p>
        </div>

        <div style="background: white; border-radius: 12px; padding: 24px; margin-bottom: 16px; border: 1px solid #e2e8f0;">
          <p style="color: #374151; font-size: 15px; margin: 0 0 12px;">Hello, <strong>${parentName}</strong>,</p>
          <p style="color: #6b7280; font-size: 14px; margin: 0 0 16px;">
            Your child <strong style="color: #111827;">${studentName}</strong> has been successfully registered in the system.
            Below are the login credentials for your ParentConnect account.
          </p>

          <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 10px; padding: 20px; margin: 16px 0;">
            <p style="margin: 0 0 8px; font-size: 12px; font-weight: 700; color: #065f46; text-transform: uppercase; letter-spacing: 0.5px;">Your Login Credentials</p>
            <table style="width: 100%; font-size: 14px;">
              <tr>
                <td style="color: #6b7280; padding: 4px 0; width: 140px;">Email:</td>
                <td style="color: #111827; font-weight: 600;">${parentEmail}</td>
              </tr>
              <tr>
                <td style="color: #6b7280; padding: 4px 0;">Temporary Password:</td>
                <td>
                  <span style="font-family: monospace; font-size: 18px; font-weight: 700; color: #047857; background: #d1fae5; padding: 4px 10px; border-radius: 6px; letter-spacing: 2px;">
                    ${tempPassword}
                  </span>
                </td>
              </tr>
            </table>
          </div>

          <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 12px 16px; margin-top: 12px;">
            <p style="margin: 0; font-size: 12px; color: #92400e;">
              ⚠️ <strong>Important:</strong> You will be asked to create a new password on your first login. Please keep this temporary password safe and do not share it with others.
            </p>
          </div>
        </div>

        <p style="color: #9ca3af; font-size: 12px; text-align: center; margin: 0;">
          This is an automated message from ParentConnect. Please do not reply to this email.
        </p>
      </div>
    `,
  });
}

// ── New: student deletion notification email ──────────────────────────────────
export async function sendDeletionEmail({
  parentEmail,
  parentName,
  studentName,
  grade,
  section,
  studentId,
  reason,
  adviserName,
  deletedAt,
}: {
  parentEmail:  string;
  parentName:   string;
  studentName:  string;
  grade:        string;
  section:      string;
  studentId:    string;
  reason:       string;
  adviserName:  string;
  deletedAt:    string;
}) {
  await transporter.sendMail({
    from:    process.env.SMTP_FROM,
    to:      parentEmail,
    subject: "📋 Student Record Removed — ParentConnect Notification",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f8fafc; padding: 32px; border-radius: 16px;">

        <!-- Header -->
        <div style="background: #ef4444; border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 24px;">
          <h1 style="color: white; margin: 0; font-size: 22px;">ParentConnect</h1>
          <p style="color: #fecaca; margin: 6px 0 0; font-size: 13px;">Santiago Elementary School</p>
        </div>

        <!-- Body -->
        <div style="background: white; border-radius: 12px; padding: 24px; margin-bottom: 16px; border: 1px solid #e2e8f0;">
          <p style="color: #374151; font-size: 15px; margin: 0 0 12px;">
            Dear <strong>${parentName}</strong>,
          </p>
          <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin: 0 0 20px;">
            We would like to inform you that the student record for
            <strong style="color: #111827;">${studentName}</strong>
            has been removed from the ParentConnect system. Please review the details below.
          </p>

          <!-- Student info -->
          <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 10px; padding: 20px; margin-bottom: 20px;">
            <p style="margin: 0 0 12px; font-size: 12px; font-weight: 700; color: #991b1b; text-transform: uppercase; letter-spacing: 0.5px;">
              Student Details
            </p>
            <table style="width: 100%; font-size: 14px; border-collapse: collapse;">
              <tr>
                <td style="color: #6b7280; padding: 5px 0; width: 160px;">Student Name</td>
                <td style="color: #111827; font-weight: 600;">${studentName}</td>
              </tr>
              <tr>
                <td style="color: #6b7280; padding: 5px 0;">Student ID</td>
                <td style="color: #111827; font-weight: 600;">${studentId}</td>
              </tr>
              <tr>
                <td style="color: #6b7280; padding: 5px 0;">Grade &amp; Section</td>
                <td style="color: #111827; font-weight: 600;">${grade} · ${section}</td>
              </tr>
              <tr>
                <td style="color: #6b7280; padding: 5px 0;">Removed By</td>
                <td style="color: #111827; font-weight: 600;">${adviserName}</td>
              </tr>
              <tr>
                <td style="color: #6b7280; padding: 5px 0;">Date &amp; Time</td>
                <td style="color: #111827; font-weight: 600;">${deletedAt}</td>
              </tr>
            </table>
          </div>

          <!-- Reason box -->
          <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 10px; padding: 20px;">
            <p style="margin: 0 0 10px; font-size: 12px; font-weight: 700; color: #92400e; text-transform: uppercase; letter-spacing: 0.5px;">
              Reason for Removal
            </p>
            <p style="margin: 0; font-size: 14px; color: #374151; line-height: 1.7; white-space: pre-wrap;">${reason}</p>
          </div>
        </div>

        <!-- Note -->
        <div style="background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 10px; padding: 16px; margin-bottom: 16px;">
          <p style="margin: 0; font-size: 13px; color: #0c4a6e; line-height: 1.6;">
            <strong>Note:</strong> Your ParentConnect account access has been deactivated. If you believe this was done in error or have any questions, please contact the school office directly.
          </p>
        </div>

        <p style="color: #9ca3af; font-size: 12px; text-align: center; margin: 0;">
          This is an automated message from ParentConnect · Santiago Elementary School.<br/>
          Please do not reply to this email.
        </p>
      </div>
    `,
  });
}