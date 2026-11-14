export interface SentMail {
  to: string;
  subject: string;
  html: string;
}

export const outbox: SentMail[] = [];

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
