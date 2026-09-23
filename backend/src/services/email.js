// Minimal email sender. Supports Resend and Postmark over plain HTTPS; with
// no API key configured it logs the message instead, so reminders can be
// exercised locally without an email provider.

const PLACEHOLDER_KEY = "your_email_provider_api_key";

function getProvider() {
  const key = process.env.EMAIL_API_KEY;
  if (!key || key === PLACEHOLDER_KEY) return "console";
  return (process.env.EMAIL_PROVIDER || "resend").toLowerCase();
}

async function sendViaResend({ to, subject, html, text }) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.EMAIL_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [to], subject, html, text }),
  });
  if (!response.ok) {
    throw new Error(`Resend responded ${response.status}: ${await response.text()}`);
  }
}

async function sendViaPostmark({ to, subject, html, text }) {
  const response = await fetch("https://api.postmarkapp.com/email", {
    method: "POST",
    headers: {
      "X-Postmark-Server-Token": process.env.EMAIL_API_KEY,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      From: process.env.EMAIL_FROM,
      To: to,
      Subject: subject,
      HtmlBody: html,
      TextBody: text,
      MessageStream: "outbound",
    }),
  });
  if (!response.ok) {
    throw new Error(`Postmark responded ${response.status}: ${await response.text()}`);
  }
}

async function sendEmail(message) {
  const provider = getProvider();
  if (provider === "console") {
    console.log(`[email:console] To: ${message.to}\nSubject: ${message.subject}\n\n${message.text}\n`);
    return;
  }
  if (provider === "resend") return sendViaResend(message);
  if (provider === "postmark") return sendViaPostmark(message);
  throw new Error(`Unsupported EMAIL_PROVIDER "${provider}" (use resend or postmark)`);
}

module.exports = { sendEmail, getProvider };
