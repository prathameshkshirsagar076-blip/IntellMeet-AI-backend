import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

let transporter = null;

if (env.SMTP.HOST) {
  transporter = nodemailer.createTransport({
    host: env.SMTP.HOST,
    port: env.SMTP.PORT,
    secure: env.SMTP.PORT === 465,
    auth: {
      user: env.SMTP.USER,
      pass: env.SMTP.PASS
    }
  });
}

export async function sendPasswordResetEmail({ to, resetToken, resetUrl }) {
  const fullResetUrl = `${resetUrl}?token=${resetToken}`;
  const mailOptions = {
    from: env.SMTP.FROM,
    to,
    subject: 'IntellMeet Enterprise — Password Reset Request',
    text: `Hello,\n\nYou requested a password reset for your IntellMeet account.\n\nPlease click the link below or copy it into your browser to reset your password:\n${fullResetUrl}\n\nThis link will expire in 15 minutes.\nIf you did not request this, please ignore this email.\n\nBest regards,\nIntellMeet Security Team`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; rounded-corner: 8px;">
        <h2 style="color: #1a365d;">IntellMeet Enterprise</h2>
        <p>Hello,</p>
        <p>You requested a password reset for your IntellMeet Workspace account.</p>
        <p style="margin: 25px 0;">
          <a href="${fullResetUrl}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Reset Password</a>
        </p>
        <p style="color: #666; font-size: 13px;">This reset link expires in 15 minutes and can only be used once.</p>
        <p style="color: #666; font-size: 13px;">If you did not request a password reset, please ignore this email.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
        <p style="color: #999; font-size: 12px;">IntellMeet Enterprise Workspace Security</p>
      </div>
    `
  };

  if (transporter) {
    try {
      await transporter.sendMail(mailOptions);
      console.log(`Password reset email sent to ${to}`);
      return true;
    } catch (err) {
      console.error('Failed to send email via SMTP:', err.message);
      return false;
    }
  } else {
    // Development fallback when SMTP is not configured
    console.log(`[SMTP Not Configured] Password reset email simulated for ${to}. Reset URL target generated.`);
    return true;
  }
}
