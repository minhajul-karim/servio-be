import nodemailer from "nodemailer";
import { env } from "../../env";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: env.GMAIL_USER,
    pass: env.GMAIL_APP_PASSWORD,
  },
});

export function sendMail(to: string, subject: string, html: string): Promise<void> {
  return transporter.sendMail({ from: env.GMAIL_USER, to, subject, html }).then(() => undefined);
}
