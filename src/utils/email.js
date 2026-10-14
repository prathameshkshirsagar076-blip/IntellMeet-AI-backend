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

function formatIcsDate(date) {
  const d = new Date(date);
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function createIcsContent({ title, description, startAt, endAt, location, organizerName, organizerEmail, meetingCode }) {
  const dtStart = formatIcsDate(startAt);
  const dtEnd = formatIcsDate(endAt);
  const dtStamp = formatIcsDate(new Date());
  const uid = `${meetingCode || 'mtg'}-${Date.now()}@intellmeet.com`;

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//IntellMeet Enterprise//Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${title || 'Scheduled Meeting'}`,
    `DESCRIPTION:${(description || '').replace(/\n/g, '\\n')}`,
    `LOCATION:${location || ''}`,
    `ORGANIZER;CN=${organizerName || 'IntellMeet Host'}:mailto:${organizerEmail || 'no-reply@intellmeet.com'}`,
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');
}

export async function sendMeetingInvitationEmail({
  to,
  inviteeName = 'Participant',
  hostName = 'Workspace Host',
  hostEmail = 'no-reply@intellmeet.com',
  title,
  description = '',
  scheduledStartAt,
  scheduledEndAt,
  timezone = 'UTC',
  durationMinutes = 45,
  meetingCode,
  meetingLink,
  passcode = ''
}) {
  const startObj = new Date(scheduledStartAt);
  const dateFormatted = startObj.toLocaleString('en-US', {
    timeZone: timezone === 'UTC' ? 'UTC' : timezone,
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short'
  });

  const fullJoinUrl = meetingLink || `${env.FRONTEND_URL}/meeting/${meetingCode}`;
  const detailsUrl = `${env.FRONTEND_URL}/meetings/${meetingCode}`;

  const ics = createIcsContent({
    title,
    description: `${description}\n\nJoin Link: ${fullJoinUrl}\nPasscode: ${passcode || 'None'}`,
    startAt: scheduledStartAt,
    endAt: scheduledEndAt || new Date(new Date(scheduledStartAt).getTime() + durationMinutes * 60000),
    location: fullJoinUrl,
    organizerName: hostName,
    organizerEmail: hostEmail,
    meetingCode
  });

  const mailOptions = {
    from: env.SMTP.FROM || 'IntellMeet Enterprise <no-reply@intellmeet.com>',
    to,
    subject: `Meeting Invitation: ${title} — ${dateFormatted}`,
    text: `Hello ${inviteeName},\n\n${hostName} has invited you to a scheduled meeting on IntellMeet.\n\nMeeting: ${title}\nWhen: ${dateFormatted} (${durationMinutes} mins)\nTimezone: ${timezone}\n${description ? `Agenda: ${description}\n` : ''}\nJoin Meeting: ${fullJoinUrl}\nMeeting Code: ${meetingCode}\n${passcode ? `Passcode: ${passcode}\n` : ''}\nView in IntellMeet: ${detailsUrl}\n\nBest regards,\nIntellMeet Team`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
        <div style="border-bottom: 2px solid #2563eb; padding-bottom: 16px; margin-bottom: 20px;">
          <h2 style="color: #1e293b; margin: 0 0 4px 0; font-size: 22px;">IntellMeet Enterprise</h2>
          <span style="color: #64748b; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600;">Meeting Invitation</span>
        </div>
        <p style="color: #334155; font-size: 15px; margin-top: 0;">Hello <strong>${inviteeName}</strong>,</p>
        <p style="color: #334155; font-size: 15px;"><strong>${hostName}</strong> has invited you to join a scheduled meeting:</p>
        
        <div style="background-color: #f8fafc; border-left: 4px solid #2563eb; padding: 16px 20px; border-radius: 6px; margin: 20px 0;">
          <h3 style="color: #0f172a; margin: 0 0 10px 0; font-size: 18px;">${title}</h3>
          ${description ? `<p style="color: #475569; font-size: 14px; margin: 0 0 12px 0;">${description}</p>` : ''}
          <table style="width: 100%; border-collapse: collapse; font-size: 14px; color: #334155;">
            <tr>
              <td style="padding: 4px 0; width: 110px; color: #64748b; font-weight: 500;">When:</td>
              <td style="padding: 4px 0; font-weight: 600;">${dateFormatted}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #64748b; font-weight: 500;">Duration:</td>
              <td style="padding: 4px 0;">${durationMinutes} minutes</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #64748b; font-weight: 500;">Meeting Code:</td>
              <td style="padding: 4px 0; font-family: monospace; font-size: 15px; color: #2563eb; font-weight: 700;">${meetingCode}</td>
            </tr>
            ${passcode ? `
            <tr>
              <td style="padding: 4px 0; color: #64748b; font-weight: 500;">Passcode:</td>
              <td style="padding: 4px 0; font-family: monospace; font-size: 14px; font-weight: 600;">${passcode}</td>
            </tr>` : ''}
          </table>
        </div>

        <div style="margin: 28px 0; text-align: center;">
          <a href="${fullJoinUrl}" style="background-color: #2563eb; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block; font-size: 16px; box-shadow: 0 4px 6px -1px rgba(37, 99, 235, 0.2);">Join Meeting</a>
          <div style="margin-top: 14px;">
            <a href="${detailsUrl}" style="color: #475569; font-size: 13px; text-decoration: underline;">View details and respond in IntellMeet</a>
          </div>
        </div>

        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
        <p style="color: #94a3b8; font-size: 12px; margin: 0; text-align: center;">
          IntellMeet Enterprise Video Collaboration • A calendar invitation (.ics) is attached to this email.
        </p>
      </div>
    `,
    icalEvent: {
      filename: 'invitation.ics',
      method: 'request',
      content: ics
    }
  };

  if (transporter) {
    try {
      await transporter.sendMail(mailOptions);
      console.log(`Meeting invitation email delivered to ${to}`);
      return { success: true, delivered: true };
    } catch (err) {
      console.error(`Failed to send meeting invitation email to ${to}:`, err.message);
      return { success: false, delivered: false, error: err.message };
    }
  } else {
    console.log(`[SMTP Not Configured] Meeting invitation email simulated for ${to}. Join URL: ${fullJoinUrl}`);
    return { success: true, delivered: false, simulated: true };
  }
}

export async function sendMeetingRescheduledEmail({
  to,
  inviteeName = 'Participant',
  hostName = 'Workspace Host',
  title,
  description = '',
  scheduledStartAt,
  scheduledEndAt,
  timezone = 'UTC',
  durationMinutes = 45,
  meetingCode,
  meetingLink,
  passcode = ''
}) {
  const startObj = new Date(scheduledStartAt);
  const dateFormatted = startObj.toLocaleString('en-US', {
    timeZone: timezone === 'UTC' ? 'UTC' : timezone,
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short'
  });

  const fullJoinUrl = meetingLink || `${env.FRONTEND_URL}/meeting/${meetingCode}`;

  const mailOptions = {
    from: env.SMTP.FROM || 'IntellMeet Enterprise <no-reply@intellmeet.com>',
    to,
    subject: `Rescheduled: ${title} — New Time: ${dateFormatted}`,
    text: `Hello ${inviteeName},\n\nThe scheduled meeting "${title}" has been rescheduled by ${hostName}.\n\nNew Time: ${dateFormatted} (${durationMinutes} mins)\nTimezone: ${timezone}\nJoin Meeting: ${fullJoinUrl}\nMeeting Code: ${meetingCode}\n${passcode ? `Passcode: ${passcode}\n` : ''}\n\nBest regards,\nIntellMeet Team`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
        <div style="border-bottom: 2px solid #f59e0b; padding-bottom: 16px; margin-bottom: 20px;">
          <h2 style="color: #1e293b; margin: 0 0 4px 0; font-size: 22px;">IntellMeet Enterprise</h2>
          <span style="color: #d97706; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600;">Meeting Rescheduled</span>
        </div>
        <p style="color: #334155; font-size: 15px; margin-top: 0;">Hello <strong>${inviteeName}</strong>,</p>
        <p style="color: #334155; font-size: 15px;">The meeting <strong>"${title}"</strong> has been rescheduled by ${hostName} to a new date and time:</p>
        
        <div style="background-color: #fffbeb; border-left: 4px solid #f59e0b; padding: 16px 20px; border-radius: 6px; margin: 20px 0;">
          <p style="margin: 0 0 8px 0; color: #b45309; font-weight: 700; font-size: 16px;">New Scheduled Time:</p>
          <p style="margin: 0; color: #1e293b; font-weight: 600; font-size: 15px;">${dateFormatted}</p>
          <p style="margin: 6px 0 0 0; color: #64748b; font-size: 13px;">Duration: ${durationMinutes} minutes | Timezone: ${timezone}</p>
        </div>

        <div style="margin: 28px 0; text-align: center;">
          <a href="${fullJoinUrl}" style="background-color: #2563eb; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block; font-size: 16px;">Join Meeting</a>
        </div>
      </div>
    `
  };

  if (transporter) {
    try {
      await transporter.sendMail(mailOptions);
      return { success: true };
    } catch (err) {
      console.error(`Failed to send reschedule email to ${to}:`, err.message);
      return { success: false, error: err.message };
    }
  } else {
    console.log(`[SMTP Not Configured] Meeting reschedule email simulated for ${to}.`);
    return { success: true, simulated: true };
  }
}

export async function sendMeetingCancellationEmail({
  to,
  inviteeName = 'Participant',
  hostName = 'Workspace Host',
  title,
  meetingCode
}) {
  const mailOptions = {
    from: env.SMTP.FROM || 'IntellMeet Enterprise <no-reply@intellmeet.com>',
    to,
    subject: `Cancelled: ${title}`,
    text: `Hello ${inviteeName},\n\nThe scheduled meeting "${title}" (Code: ${meetingCode}) has been cancelled by the organizer (${hostName}).\n\nNo further action is required.\n\nBest regards,\nIntellMeet Team`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
        <div style="border-bottom: 2px solid #ef4444; padding-bottom: 16px; margin-bottom: 20px;">
          <h2 style="color: #1e293b; margin: 0 0 4px 0; font-size: 22px;">IntellMeet Enterprise</h2>
          <span style="color: #dc2626; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600;">Meeting Cancelled</span>
        </div>
        <p style="color: #334155; font-size: 15px;">Hello <strong>${inviteeName}</strong>,</p>
        <p style="color: #334155; font-size: 15px;">Please note that the meeting <strong>"${title}"</strong> has been cancelled by ${hostName}.</p>
        <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 14px 18px; border-radius: 6px; margin: 20px 0; color: #991b1b; font-size: 14px;">
          This event has been removed from your active schedule.
        </div>
      </div>
    `
  };

  if (transporter) {
    try {
      await transporter.sendMail(mailOptions);
      return { success: true };
    } catch (err) {
      console.error(`Failed to send cancellation email to ${to}:`, err.message);
      return { success: false, error: err.message };
    }
  } else {
    console.log(`[SMTP Not Configured] Meeting cancellation email simulated for ${to}.`);
    return { success: true, simulated: true };
  }
}
