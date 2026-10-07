type BrevoEmailMessage = {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string;
};

const BREVO_SEND_URL = "https://api.brevo.com/v3/smtp/email";

function getBrevoConfig() {
  const apiKey = process.env.BREVO_API_KEY?.trim();
  const fromEmail = process.env.BREVO_FROM_EMAIL?.trim();
  const fromName = process.env.BREVO_FROM_NAME?.trim() || "ParentConnect";

  if (!apiKey || !fromEmail) {
    throw new Error("BREVO_API_KEY and BREVO_FROM_EMAIL must be configured.");
  }

  return { apiKey, fromEmail, fromName };
}

/** True only when Brevo has all settings required to send transactional mail. */
export function isBrevoConfigured() {
  return Boolean(process.env.BREVO_API_KEY?.trim() && process.env.BREVO_FROM_EMAIL?.trim());
}

/** Sends system mail through Brevo's HTTPS transactional-email API. */
export async function sendWithBrevo(message: BrevoEmailMessage) {
  const { apiKey, fromEmail, fromName } = getBrevoConfig();
  const recipients = (Array.isArray(message.to) ? message.to : [message.to])
    .map((email) => email.trim())
    .filter(Boolean)
    .map((email) => ({ email }));

  if (recipients.length === 0) {
    throw new Error("An email recipient is required.");
  }

  const response = await fetch(BREVO_SEND_URL, {
    method: "POST",
    headers: {
      accept: "application/json",
      "api-key": apiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      // Brevo always uses its verified sender address.
      sender: { email: fromEmail, name: fromName },
      to: recipients,
      subject: message.subject,
      ...(message.html ? { htmlContent: message.html } : { textContent: message.text ?? "" }),
      ...(message.replyTo ? { replyTo: { email: message.replyTo.trim() } } : {}),
    }),
    cache: "no-store",
  });

  const data = await response.json().catch(() => null) as {
    messageId?: string;
    code?: string;
    message?: string;
  } | null;

  if (!response.ok) {
    throw new Error(data?.message || data?.code || "Brevo could not send the email.");
  }

  return data;
}
