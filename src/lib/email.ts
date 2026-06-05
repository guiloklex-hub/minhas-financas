import nodemailer from "nodemailer";

export type EmailInput = { subject: string; html: string; to?: string };

/**
 * Envia e-mail via SMTP (best-effort). Retorna false (no-op) se as variáveis
 * SMTP_* não estiverem configuradas. Nunca lança.
 */
export async function sendEmail(input: EmailInput): Promise<boolean> {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const to = input.to || process.env.NOTIFY_EMAIL_TO || user;

  if (!host || !user || !pass || !to) return false;

  try {
    const transporter = nodemailer.createTransport({
      host,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === "true",
      auth: { user, pass },
    });
    await transporter.sendMail({
      from: process.env.SMTP_FROM || user,
      to,
      subject: input.subject,
      html: input.html,
    });
    return true;
  } catch (e) {
    console.error("Falha ao enviar e-mail:", e);
    return false;
  }
}
