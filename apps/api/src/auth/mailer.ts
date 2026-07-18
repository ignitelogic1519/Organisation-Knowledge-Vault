import { randomBytes } from "node:crypto";
import nodemailer from "nodemailer";
import { db } from "../db.js";
import { env } from "../env.js";
import { hashToken } from "./tokens.js";

const VERIFY_TTL_HOURS = 48;

// v1 email policy (docs/structure.md §7): only verification + deletion mails, sent from the
// platform Gmail. Without SMTP credentials the link is logged instead — dev-friendly, and the
// API keeps working if mail is down.
const transport =
  env.smtp.user && env.smtp.pass
    ? nodemailer.createTransport({
        service: "gmail",
        auth: { user: env.smtp.user, pass: env.smtp.pass },
      })
    : null;

export async function sendVerificationEmail(profileId: string, email: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  await db.emailToken.create({
    data: {
      profileId,
      purpose: "verify_email",
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + VERIFY_TTL_HOURS * 3600 * 1000),
    },
  });

  const link = `${env.webUrl}/verify?token=${token}`;
  if (!transport) {
    console.info(`[mailer] SMTP not configured — verification link for ${email}: ${link}`);
    return;
  }
  await transport.sendMail({
    from: `"Knowledge Vault" <${env.smtp.user}>`,
    to: email,
    subject: "Verify your Knowledge Vault email",
    text: `Welcome to Knowledge Vault!\n\nVerify your email by opening this link:\n${link}\n\nThe link expires in ${VERIFY_TTL_HOURS} hours. If you didn't create this account, ignore this mail.`,
  });
}

export async function consumeVerificationToken(token: string): Promise<boolean> {
  const row = await db.emailToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!row || row.purpose !== "verify_email" || row.usedAt || row.expiresAt < new Date()) {
    return false;
  }
  await db.$transaction([
    db.emailToken.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
    db.profile.update({ where: { id: row.profileId }, data: { emailVerifiedAt: new Date() } }),
  ]);
  return true;
}
