import nodemailer, { type Transporter } from 'nodemailer';
import type { Handler } from './runner';

export type EmailPayload = { to: string; subject: string; text: string; html?: string };

function isEmailPayload(p: Record<string, unknown>): p is EmailPayload {
  return typeof p.to === 'string' && typeof p.subject === 'string' && typeof p.text === 'string';
}

// `server` is an SMTP URL (smtp://host:port). Tests pass a JSON transport instead.
export function createEmailHandler(options: { from: string; transport: Transporter | string }): Handler {
  const transport = typeof options.transport === 'string' ? nodemailer.createTransport(options.transport) : options.transport;
  return async (payload) => {
    if (!isEmailPayload(payload)) throw new Error('Invalid email payload');
    await transport.sendMail({ from: options.from, to: payload.to, subject: payload.subject, text: payload.text, html: payload.html });
  };
}

export const EMAIL_JOB = 'email.send';
