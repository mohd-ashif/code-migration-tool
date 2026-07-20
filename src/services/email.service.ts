import { sendEmail } from "./mail.service";
import { logger } from "../utils/logger";
import { config } from "../config";

export class EmailService {
  async sendVerificationEmail(email: string, token: string): Promise<void> {
    // Generate verification link pointing to the React frontend application (port 3000)
    const verificationLink = `http://localhost:3000/?mode=verify-email&token=${token}`;
    const subject = "Verify Your Account";
    const html = `
      <div style="font-family: sans-serif; max-width: 500px; padding: 20px; border: 1px solid #eee; border-radius: 10px; background-color: #0B0B12; color: #ffffff;">
        <h2 style="color: #7C6CFF;">Account Verification</h2>
        <p style="color: #cccccc;">Please click the button below to verify your account and activate your workspace:</p>
        <a href="${verificationLink}" style="display: inline-block; padding: 12px 24px; color: white; background-color: #7C6CFF; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 15px 0;">Verify Email</a>
        <p style="color: #888; font-size: 11px;">If the button above does not work, copy and paste this URL into your browser:</p>
        <p style="color: #888; font-size: 11px; word-break: break-all;">${verificationLink}</p>
      </div>
    `;
    const text = `Verify your account by copying and pasting this link in your browser: ${verificationLink}`;

    // Always log to console in development as a fallback
    logger.info(`[EmailService] Generated Verification Link for ${email}: ${verificationLink}`);

    if (config.SMTP_HOST && config.SMTP_USER && config.SMTP_PASS) {
      try {
        await sendEmail({ to: email, subject, html, text });
        logger.info(`[EmailService] Verification email sent successfully to ${email} via Nodemailer`);
      } catch (err: any) {
        logger.error(`[EmailService] Nodemailer verification delivery failed to ${email}: ${err.message}.`);
      }
    }
  }

  async sendPasswordResetEmail(email: string, token: string): Promise<void> {
    // Generate password reset link pointing to the React frontend application (port 3000)
    const resetLink = `http://localhost:3000/?mode=reset-password&token=${token}`;
    const subject = "Reset Your Password";
    const html = `
      <div style="font-family: sans-serif; max-width: 500px; padding: 20px; border: 1px solid #eee; border-radius: 10px; background-color: #0B0B12; color: #ffffff;">
        <h2 style="color: #7C6CFF;">Password Reset</h2>
        <p style="color: #cccccc;">You requested a password reset. Please click the button below to choose a new password:</p>
        <a href="${resetLink}" style="display: inline-block; padding: 12px 24px; color: white; background-color: #7C6CFF; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 15px 0;">Reset Password</a>
        <p style="color: #888; font-size: 11px;">If the button above does not work, copy and paste this URL into your browser:</p>
        <p style="color: #888; font-size: 11px; word-break: break-all;">${resetLink}</p>
      </div>
    `;
    const text = `Reset your password by copying and pasting this link in your browser: ${resetLink}`;

    // Always log to console in development as a fallback
    logger.info(`[EmailService] Generated Reset Link for ${email}: ${resetLink}`);

    if (config.SMTP_HOST && config.SMTP_USER && config.SMTP_PASS) {
      try {
        await sendEmail({ to: email, subject, html, text });
        logger.info(`[EmailService] Password reset email sent successfully to ${email} via Nodemailer`);
      } catch (err: any) {
        logger.error(`[EmailService] Nodemailer reset delivery failed to ${email}: ${err.message}.`);
      }
    }
  }

  async sendWorkspaceInvitationEmail(email: string, token: string, workspaceName: string, invitedBy: string): Promise<void> {
    const inviteLink = `http://localhost:3000/?mode=accept-invite&token=${token}`;
    const subject = `Join ${workspaceName} Workspace`;
    const html = `
      <div style="font-family: sans-serif; max-width: 500px; padding: 20px; border: 1px solid #eee; border-radius: 10px; background-color: #0B0B12; color: #ffffff;">
        <h2 style="color: #7C6CFF;">Workspace Invitation</h2>
        <p style="color: #cccccc;"><strong>${invitedBy}</strong> has invited you to join the <strong>${workspaceName}</strong> workspace on Code Migration Studio.</p>
        <p style="color: #cccccc;">Click the button below to accept the invitation and access the shared workspace:</p>
        <a href="${inviteLink}" style="display: inline-block; padding: 12px 24px; color: white; background-color: #7C6CFF; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 15px 0;">Accept Invitation</a>
        <p style="color: #888; font-size: 11px;">If the button above does not work, copy and paste this URL into your browser:</p>
        <p style="color: #888; font-size: 11px; word-break: break-all;">${inviteLink}</p>
      </div>
    `;
    const text = `You have been invited to join ${workspaceName} by ${invitedBy}. Accept here: ${inviteLink}`;

    logger.info(`[EmailService] Generated Invitation Link for ${email} in ${workspaceName}: ${inviteLink}`);

    if (config.SMTP_HOST && config.SMTP_USER && config.SMTP_PASS) {
      try {
        await sendEmail({ to: email, subject, html, text });
        logger.info(`[EmailService] Invitation email sent successfully to ${email} via Nodemailer`);
      } catch (err: any) {
        logger.error(`[EmailService] Nodemailer invitation delivery failed to ${email}: ${err.message}.`);
      }
    }
  }
}
