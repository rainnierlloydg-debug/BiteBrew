import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import nodemailer from 'nodemailer';
import { z } from 'zod';
import { db } from '../db.js';
import { config } from '../config.js';
import { hashPassword } from '../lib/password.js';
import { fail } from '../lib/errors.js';
import { smtpSettings } from '../lib/smtp-settings.js';

const details = z.object({ name: z.string().trim().min(1).max(120), contact: z.string().trim().max(40).default(''), email: z.email().max(190).transform(value => value.toLowerCase().trim()), password: z.string().min(12).max(128), confirmPassword: z.string().min(12).max(128) }).strict().refine(value => value.password === value.confirmPassword, { path: ['confirmPassword'], message: 'Passwords do not match.' });
const tokenSchema = z.string().regex(/^[a-f0-9]{64}$/);
const tokenHash = token => createHash('sha256').update(token).digest('hex');
const codeHash = (token, code) => createHmac('sha256', config.secret).update(token + ':' + code).digest('hex');
const cooldown = 60_000, lifetime = 10 * 60_000;

export async function sendConfirmation({ email, code }) {
  const mail = smtpSettings();
  if (!mail.configured) fail(503, 'EMAIL_UNAVAILABLE', 'Email verification is temporarily unavailable. Please contact the administrator.');
  const transport = nodemailer.createTransport(mail.options);
  try {
    const result = await transport.sendMail({ from: mail.from, to: email, subject: 'Bite & Brew confirmation code', text: `Your Bite & Brew confirmation code is ${code}.\n\nThis code expires in 10 minutes. Do not share it. If you did not request an account, ignore this email.` });
    if (!result.accepted?.length) throw new Error('Recipient rejected');
  } catch { fail(503, 'EMAIL_UNAVAILABLE', 'We could not send your confirmation code. Please try again later.'); }
  finally { transport.close(); }
}

export function registrationService({ send = sendConfirmation, now = () => Date.now() } = {}) {
  async function available(email, client = db) {
    if (await client.user.findUnique({ where: { email }, select: { id: true } }) || await client.customerAccount.findUnique({ where: { email }, select: { id: true } })) fail(409, 'EMAIL_REGISTERED', 'This email is already registered. Sign in or use another email.');
  }
  async function issue(data, existing) {
    const time = now();
    if (existing && existing.sentAt.getTime() > time - cooldown) fail(429, 'CODE_COOLDOWN', 'Wait 60 seconds before requesting another code.');
    await available(data.email);
    const token = randomBytes(32).toString('hex'), code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const record = { ...data, tokenHash: tokenHash(token), codeHash: codeHash(token, code), attempts: 0, sentAt: new Date(time), expiresAt: new Date(time + lifetime) };
    if (existing) {
      const updated = await db.customerVerification.updateMany({ where: { id: existing.id, tokenHash: existing.tokenHash, sentAt: { lte: new Date(time - cooldown) } }, data: record });
      if (!updated.count) fail(429, 'CODE_COOLDOWN', 'A newer code was already requested. Please try again later.');
    } else {
      try { await db.customerVerification.create({ data: record }); }
      catch (error) { if (error.code === 'P2002') fail(429, 'CODE_COOLDOWN', 'A code was already requested. Wait 60 seconds and try again.'); throw error; }
    }
    try { await send({ email: data.email, code }); }
    catch (error) { await db.customerVerification.deleteMany({ where: { tokenHash: record.tokenHash } }); throw error; }
    return { verificationRequired: true, token, email: data.email, expiresAt: record.expiresAt.toISOString(), resendAt: new Date(time + cooldown).toISOString() };
  }
  return {
    async start(body) {
      const data = details.parse(body), existing = await db.customerVerification.findUnique({ where: { email: data.email } });
      if (existing && existing.sentAt.getTime() > now() - cooldown) fail(429, 'CODE_COOLDOWN', 'Wait 60 seconds before requesting another code.');
      return issue({ name: data.name, contact: data.contact, email: data.email, passwordHash: await hashPassword(data.password) }, existing);
    },
    async resend(body) {
      const { token } = z.object({ token: tokenSchema }).strict().parse(body);
      const existing = await db.customerVerification.findUnique({ where: { tokenHash: tokenHash(token) } });
      if (!existing || existing.expiresAt.getTime() <= now()) fail(422, 'CODE_EXPIRED', 'Your code expired. Return to Create Account and try again.');
      return issue({ name: existing.name, contact: existing.contact, email: existing.email, passwordHash: existing.passwordHash }, existing);
    },
    async verify(body) {
      const { token, code } = z.object({ token: tokenSchema, code: z.string().regex(/^\d{6}$/) }).strict().parse(body);
      const result = await db.$transaction(async tx => {
        // Atomic attempt reservation locks this challenge until verification completes.
        const claimed = await tx.customerVerification.updateMany({ where: { tokenHash: tokenHash(token), expiresAt: { gt: new Date(now()) }, attempts: { lt: 5 } }, data: { attempts: { increment: 1 } } });
        if (!claimed.count) return { error: 'The code expired or reached its attempt limit. Return to Create Account and request a new code.' };
        const pending = await tx.customerVerification.findUnique({ where: { tokenHash: tokenHash(token) } });
        if (!timingSafeEqual(Buffer.from(pending.codeHash, 'hex'), Buffer.from(codeHash(token, code), 'hex'))) return { error: 'Incorrect confirmation code. Check your email and try again.' };
        await available(pending.email, tx);
        const account = await tx.customerAccount.create({ data: { email: pending.email, passwordHash: pending.passwordHash, customer: { create: { name: pending.name, contact: pending.contact || null } } }, include: { customer: true } });
        await tx.customerVerification.delete({ where: { id: pending.id } });
        return { account };
      });
      if (result.error) fail(422, 'CODE_INVALID', result.error);
      return result.account;
    },
  };
}
