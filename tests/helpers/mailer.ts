export interface SentMail {
  to: string;
  subject: string;
  html: string;
}

export const outbox: SentMail[] = [];

let sendingFails = false;

let onSend: (() => Promise<void>) | null = null;

export function setOnSend(hook: (() => Promise<void>) | null): void {
  onSend = hook;
}

export async function runOnSend(): Promise<void> {
  await onSend?.();
}

export function setSendingFails(value: boolean): void {
  sendingFails = value;
}

export function isSendingFailing(): boolean {
  return sendingFails;
}

export function clearOutbox(): void {
  outbox.length = 0;
}

export function lastEmailTo(email: string): SentMail | undefined {
  return [...outbox].reverse().find((mail) => mail.to === email);
}

export function lastOtpFor(email: string): string | undefined {
  const mail = lastEmailTo(email);
  return mail?.html.match(/<strong>(\d{6})<\/strong>/)?.[1];
}

export function lastLinkFor(email: string): string | undefined {
  const mail = lastEmailTo(email);
  return mail?.html.match(/href="([^"]+)"/)?.[1];
}

export function tokenFromLink(link: string): string | null {
  return new URL(link).searchParams.get("token");
}
