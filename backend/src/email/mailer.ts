import { Resend } from "resend";

const apiKey = process.env.RESEND_API_KEY;

if (!apiKey) {
  throw new Error("RESEND_API_KEY environment variable is not set");
}

const resend = new Resend(apiKey);

const EMAIL_FROM =
  process.env.EMAIL_FROM || "Rentia <notifications@rentia.online>";
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

interface SendArgs {
  to: string;
  subject: string;
  html: string;
  text: string;
}

async function sendEmail({ to, subject, html, text }: SendArgs): Promise<void> {
  const { error } = await resend.emails.send({
    from: EMAIL_FROM,
    to,
    subject,
    html,
    text,
  });

  if (error) {
    throw new Error(`Resend email send failed: ${error.message}`);
  }
}

export async function sendLoginOtpEmail(
  email: string,
  codigo: string,
): Promise<void> {
  await sendEmail({
    to: email,
    subject: "Tu código de acceso a Rentia",
    html: `
      <p>Hola,</p>
      <p>Tu código para iniciar sesión en Rentia es:</p>
      <p><strong style="font-size: 24px; letter-spacing: 2px;">${codigo}</strong></p>
      <p>Este código expira en 5 minutos. Si no solicitaste este código, puedes ignorar este correo.</p>
      <p>— El equipo de Rentia</p>
    `,
    text: `Tu código para iniciar sesión en Rentia es: ${codigo}. Expira en 5 minutos.`,
  });
}

export async function sendAccountRecoveryOtpEmail(
  email: string,
  codigo: string,
): Promise<void> {
  await sendEmail({
    to: email,
    subject: "Recupera tu cuenta en Rentia",
    html: `
      <p>Hola,</p>
      <p>Recibimos una solicitud para reactivar tu cuenta en Rentia. Tu código de recuperación es:</p>
      <p><strong style="font-size: 24px; letter-spacing: 2px;">${codigo}</strong></p>
      <p>Este código expira en 5 minutos. Si no solicitaste recuperar tu cuenta, puedes ignorar este correo.</p>
      <p>— El equipo de Rentia</p>
    `,
    text: `Tu código de recuperación de cuenta en Rentia es: ${codigo}. Expira en 5 minutos.`,
  });
}

export async function sendAccountDeletionScheduledEmail(
  email: string,
  eliminacionProgramadaEn: Date,
  recoveryUrl: string,
): Promise<void> {
  const fecha = eliminacionProgramadaEn.toLocaleString("es", {
    dateStyle: "long",
    timeStyle: "short",
  });

  await sendEmail({
    to: email,
    subject: "Tu cuenta en Rentia está programada para eliminarse",
    html: `
      <p>Hola,</p>
      <p>Tu cuenta en Rentia fue marcada para eliminarse el <strong>${fecha}</strong>.</p>
      <p>Si cambiaste de opinión, puedes reactivarla antes de esa fecha usando el siguiente enlace:</p>
      <p><a href="${recoveryUrl}">${recoveryUrl}</a></p>
      <p>Si no solicitaste esta eliminación, te recomendamos recuperar tu cuenta lo antes posible.</p>
      <p>— El equipo de Rentia</p>
    `,
    text: `Tu cuenta en Rentia fue marcada para eliminarse el ${fecha}. Para reactivarla antes de esa fecha, visita: ${recoveryUrl}`,
  });
}

export async function sendAccountReactivatedEmail(
  email: string,
): Promise<void> {
  const loginUrl = `${FRONTEND_URL}`;

  await sendEmail({
    to: email,
    subject: "Tu cuenta en Rentia fue reactivada",
    html: `
      <p>Hola,</p>
      <p>Tu cuenta en Rentia ha sido reactivada correctamente. Ya puedes volver a iniciar sesión:</p>
      <p><a href="${loginUrl}">${loginUrl}</a></p>
      <p>Si no fuiste tú quien recuperó la cuenta, contáctanos de inmediato.</p>
      <p>— El equipo de Rentia</p>
    `,
    text: `Tu cuenta en Rentia fue reactivada correctamente. Puedes iniciar sesión en: ${loginUrl}`,
  });
}