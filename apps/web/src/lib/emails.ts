// Emails go to people whose language we do not store yet, so every message carries both languages
// (Spanish first, the default). When user preferences exist, pick one language here.
export function signInLinkEmail(url: string): { subject: string; text: string } {
  return {
    subject: 'Tu enlace para iniciar sesión / Your sign-in link',
    text: [
      `Usa este enlace para iniciar sesión. Caduca pronto y solo sirve una vez:\n\n${url}\n\nSi no lo pediste, ignora este mensaje.`,
      `Use this link to sign in. It expires soon and works only once:\n\n${url}\n\nIf you did not request it, ignore this message.`,
    ].join('\n\n---\n\n'),
  };
}

export function twoStepResetEmail(): { subject: string; text: string } {
  return {
    subject: 'Se restableció tu verificación en dos pasos / Your two-step verification was reset',
    text: [
      'Un dueño de tu organización restableció tu verificación en dos pasos. Debes iniciar sesión de nuevo y configurarla otra vez. Si no esperabas este cambio, avisa a tu administrador.',
      'An owner of your organization reset your two-step verification. You must sign in again and set it up again. If you did not expect this change, tell your administrator.',
    ].join('\n\n---\n\n'),
  };
}

export function deletionScheduledEmail(date: string): { subject: string; text: string } {
  return {
    subject: 'Tu cuenta se eliminará / Your account will be deleted',
    text: [
      `Pediste eliminar tu cuenta. Se eliminará por completo el ${date}. Si no fuiste tú, o cambiaste de opinión, inicia sesión antes de esa fecha y cancela la eliminación.`,
      `You asked to delete your account. It will be fully deleted on ${date}. If it was not you, or you changed your mind, sign in before that date and cancel the deletion.`,
    ].join('\n\n---\n\n'),
  };
}

