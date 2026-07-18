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
        // Google shows app passwords in groups of 4 — strip any pasted spaces
        auth: { user: env.smtp.user, pass: env.smtp.pass.replace(/\s+/g, "") },
      })
    : null;

// Mail must NEVER break the request that triggered it — failures are logged with the SMTP
// error (visible in Render Logs, search "[mailer]") and the fallback link is printed too.
async function sendSafely(
  options: {
    to: string;
    subject: string;
    text: string;
    attachments?: { filename: string; content: Buffer }[];
  },
  fallbackLog: string,
): Promise<void> {
  if (!transport) {
    console.info(`[mailer] SMTP not configured — ${fallbackLog}`);
    return;
  }
  try {
    await transport.sendMail({
      from: `"Knowledge Vault" <${env.smtp.user}>`,
      ...options,
    });
    console.info(`[mailer] sent "${options.subject}" to ${options.to}`);
  } catch (err) {
    console.error(
      `[mailer] SEND FAILED to ${options.to}: ${err instanceof Error ? err.message : err} — ${fallbackLog}`,
    );
  }
}

/** Emails the encrypted .main file to the owner as an attachment (docs/structure.md §2.3). */
export async function sendMainFileEmail(
  email: string,
  orgName: string,
  file: Buffer,
): Promise<void> {
  await sendSafely(
    {
      to: email,
      subject: `Your .main file for ${orgName}`,
      text: `Attached is the encrypted .main existence file for "${orgName}".\n\nKeep it somewhere safe and share copies with trusted colleagues as you see fit. It can only be decrypted with the organization's Supreme password — which nobody, including Knowledge Vault, can recover. Together, file + password can revive the organization at any time after deletion.`,
      attachments: [{ filename: `${orgName.replace(/[^\w-]/g, "_")}.main`, content: file }],
    },
    `.main copy for ${email} (${orgName}, ${file.length} bytes)`,
  );
}

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
  await sendSafely(
    {
      to: email,
      subject: "Verify your Knowledge Vault email",
      text: `Welcome to Knowledge Vault!\n\nVerify your email by opening this link:\n${link}\n\nThe link expires in ${VERIFY_TTL_HOURS} hours. If you didn't create this account, ignore this mail.`,
    },
    `verification link for ${email}: ${link}`,
  );
}

export async function sendInviteEmail(email: string, orgName: string, roleName: string): Promise<void> {
  const link = `${env.webUrl}/register`;
  await sendSafely(
    {
      to: email,
      subject: `You've been added to ${orgName} on Knowledge Vault`,
      text: `You've been given the role "${roleName}" in ${orgName}.\n\nCreate your profile with this email address to join:\n${link}\n\nIf you weren't expecting this, you can ignore this mail.`,
    },
    `invite for ${email} (${orgName}/${roleName}): ${link}`,
  );
}

export async function sendDeletionEmail(email: string, orgName: string): Promise<void> {
  const text = `The organization "${orgName}" on Knowledge Vault has been deleted.\n\nIts data is retained for 30 days — sign in and use Undelete to change your mind. After that, only the downloaded .main file (with its Supreme password) can revive it.`;
  await sendSafely(
    { to: email, subject: `Organization deleted: ${orgName}`, text },
    `deletion notice for ${email}: ${orgName}`,
  );
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
