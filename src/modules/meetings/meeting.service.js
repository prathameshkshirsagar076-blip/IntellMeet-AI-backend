import mongoose from 'mongoose';
import crypto from 'crypto';
import { Meeting } from './meeting.model.js';
import { MeetingParticipant } from './participant.model.js';
import { MeetingMessage } from './meeting-message.model.js';
import { User } from '../users/user.model.js';
import { env } from '../../config/env.js';
import {
  sendMeetingInvitationEmail,
  sendMeetingRescheduledEmail,
  sendMeetingCancellationEmail
} from '../../utils/email.js';

export class MeetingService {
  static isValidObjectId(id) {
    return mongoose.isValidObjectId(id);
  }

  static formatMeetingDateTime(dateObj, timezone = 'UTC') {
    if (!dateObj || isNaN(new Date(dateObj).getTime())) return { date: '', startTime: '' };
    const d = new Date(dateObj);
    try {
      const tz = timezone && timezone !== 'UTC' ? timezone : 'UTC';
      const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
      const parts = formatter.formatToParts(d);
      const getPart = (type) => parts.find((p) => p.type === type)?.value || '';
      const date = `${getPart('year')}-${getPart('month')}-${getPart('day')}`;
      const startTime = `${getPart('hour')}:${getPart('minute')}`;
      return { date, startTime };
    } catch {
      const iso = d.toISOString();
      return {
        date: iso.slice(0, 10),
        startTime: iso.slice(11, 16)
      };
    }
  }

  /**
   * Generates a unique, unguessable meeting code formatted as itm-xxx-xxx
   */
  static async generateMeetingCode() {
    let code;
    let exists = true;
    let attempts = 0;

    while (exists && attempts < 10) {
      attempts++;
      const rand1 = Math.floor(100 + Math.random() * 900);
      const rand2 = Math.floor(100 + Math.random() * 900);
      code = `itm-${rand1}-${rand2}`;
      const found = await Meeting.findOne({ meetingCode: code });
      if (!found) {
        exists = false;
      }
    }

    if (exists) {
      code = `itm-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
    }

    return code;
  }

  /**
   * Helper to resolve meeting by Mongo _id OR meetingCode
   */
  static async resolveMeeting(meetingIdentifier) {
    if (!meetingIdentifier) return null;

    const trimmed = meetingIdentifier.toString().trim();
    const query = { deletedAt: null };

    if (this.isValidObjectId(trimmed)) {
      query.$or = [{ _id: trimmed }, { meetingCode: trimmed.toLowerCase() }];
    } else {
      query.meetingCode = trimmed.toLowerCase();
    }

    return await Meeting.findOne(query).populate('organizerId', '_id name email avatar role');
  }

  /**
   * Create a new meeting
   */
  /**
   * Create a new meeting (scheduled or instant)
   */
  static async createMeeting(data, organizerId) {
    if (!data.title || !data.title.trim()) {
      const err = new Error('Meeting title is required');
      err.statusCode = 400;
      err.code = 'TITLE_REQUIRED';
      throw err;
    }

    const meetingCode = await this.generateMeetingCode();
    const passcode = data.passcode ? data.passcode.trim() : crypto.randomBytes(3).toString('hex').toUpperCase();

    const isInstant = Boolean(data.isInstant);
    const timezone = data.timezone ? data.timezone.trim() : 'UTC';

    let scheduledStartAt;
    if (data.scheduledStartAt) {
      scheduledStartAt = new Date(data.scheduledStartAt);
    } else if (data.date && data.startTime) {
      scheduledStartAt = new Date(`${data.date}T${data.startTime}:00`);
    } else {
      scheduledStartAt = new Date();
    }

    if (isNaN(scheduledStartAt.getTime())) {
      const err = new Error('Invalid scheduled start date or time format');
      err.statusCode = 400;
      err.code = 'INVALID_DATE_TIME';
      throw err;
    }

    // Server-side authoritative validation: Cannot schedule a meeting in the past
    if (!isInstant) {
      const now = Date.now();
      // Allow 2-minute clock skew grace period
      if (scheduledStartAt.getTime() < now - 2 * 60 * 1000) {
        const err = new Error('Cannot schedule a meeting in the past. Please choose a future date and time.');
        err.statusCode = 400;
        err.code = 'PAST_START_TIME';
        throw err;
      }
    }

    const durationMinutes = Math.max(5, Number(data.durationMinutes) || 45);
    let scheduledEndAt;
    if (data.scheduledEndAt) {
      scheduledEndAt = new Date(data.scheduledEndAt);
    } else {
      scheduledEndAt = new Date(scheduledStartAt.getTime() + durationMinutes * 60000);
    }

    if (scheduledEndAt.getTime() <= scheduledStartAt.getTime()) {
      const err = new Error('Meeting end time must be after start time');
      err.statusCode = 400;
      err.code = 'INVALID_END_TIME';
      throw err;
    }

    const status = isInstant ? 'live' : 'upcoming';

    const meeting = await Meeting.create({
      meetingCode,
      title: data.title.trim(),
      description: data.description ? data.description.trim() : '',
      organizerId,
      status,
      scheduledStartAt,
      scheduledEndAt,
      actualStartedAt: isInstant ? new Date() : null,
      durationMinutes,
      passcode,
      timezone,
      settings: {
        allowChat: data.settings?.allowChat !== false,
        allowScreenShare: data.settings?.allowScreenShare !== false,
        waitingRoom: Boolean(data.settings?.waitingRoom),
        isMutedOnEntry: Boolean(data.settings?.isMutedOnEntry),
        isVideoOffOnEntry: Boolean(data.settings?.isVideoOffOnEntry)
      },
      participantLimit: data.participantLimit ? Number(data.participantLimit) : 100,
      isInstant
    });

    // Register organizer as host participant
    await MeetingParticipant.create({
      meetingId: meeting._id,
      userId: organizerId,
      role: 'host',
      status: isInstant ? 'joined' : 'accepted',
      joinedAt: isInstant ? new Date() : null,
      respondedAt: new Date()
    });

    // Fetch organizer info for invitation emails
    const organizer = await User.findById(organizerId).select('name email');
    const organizerEmail = organizer?.email?.toLowerCase();

    // Collect multiple invitees (emails & userIds)
    const inviteeList = [];
    const seenEmails = new Set();
    const seenUserIds = new Set();
    if (organizerEmail) seenEmails.add(organizerEmail);
    seenUserIds.add(organizerId.toString());

    if (Array.isArray(data.participantUserIds)) {
      for (const uId of data.participantUserIds) {
        if (!uId || seenUserIds.has(uId.toString())) continue;
        const u = await User.findById(uId).select('name email');
        if (u) {
          seenUserIds.add(u._id.toString());
          const emailLower = u.email ? u.email.toLowerCase() : '';
          if (emailLower) seenEmails.add(emailLower);
          inviteeList.push({
            userId: u._id,
            email: emailLower,
            name: u.name || ''
          });
        }
      }
    }

    if (Array.isArray(data.participantEmails)) {
      for (const rawEmail of data.participantEmails) {
        if (typeof rawEmail !== 'string') continue;
        const cleanEmail = rawEmail.trim().toLowerCase();
        if (!cleanEmail || seenEmails.has(cleanEmail)) continue;

        seenEmails.add(cleanEmail);
        const u = await User.findOne({
          $or: [{ normalizedEmail: cleanEmail }, { email: cleanEmail }]
        }).select('name email');

        if (u) {
          seenUserIds.add(u._id.toString());
          inviteeList.push({
            userId: u._id,
            email: cleanEmail,
            name: u.name || ''
          });
        } else {
          inviteeList.push({
            userId: null,
            email: cleanEmail,
            name: cleanEmail.split('@')[0]
          });
        }
      }
    }

    // Process invitations and send emails
    const origin = env.FRONTEND_URL || 'http://localhost:3000';
    const meetingLink = `${origin}/meeting/${meeting.meetingCode}`;

    for (const invitee of inviteeList) {
      let deliveryStatus = 'not_sent';
      let deliveryError = null;

      if (invitee.email && !isInstant) {
        try {
          const emailRes = await sendMeetingInvitationEmail({
            to: invitee.email,
            inviteeName: invitee.name || 'Participant',
            hostName: organizer?.name || 'Workspace Host',
            hostEmail: organizer?.email || 'no-reply@intellmeet.com',
            title: meeting.title,
            description: meeting.description,
            scheduledStartAt: meeting.scheduledStartAt,
            scheduledEndAt: meeting.scheduledEndAt,
            timezone: meeting.timezone,
            durationMinutes: meeting.durationMinutes,
            meetingCode: meeting.meetingCode,
            meetingLink,
            passcode: meeting.passcode
          });
          deliveryStatus = emailRes?.success ? (emailRes.delivered ? 'delivered' : 'sent') : 'failed';
          if (!emailRes?.success) deliveryError = emailRes?.error || 'Send failed';
        } catch (mailErr) {
          deliveryStatus = 'failed';
          deliveryError = mailErr.message;
        }
      }

      const query = invitee.userId
        ? { meetingId: meeting._id, userId: invitee.userId }
        : { meetingId: meeting._id, email: invitee.email };

      await MeetingParticipant.findOneAndUpdate(
        query,
        {
          meetingId: meeting._id,
          userId: invitee.userId,
          email: invitee.email,
          name: invitee.name,
          role: 'attendee',
          status: 'pending',
          invitationSentAt: new Date(),
          invitationDeliveryStatus: deliveryStatus,
          invitationError: deliveryError
        },
        { upsert: true, new: true }
      );
    }

    const populatedMeeting = await Meeting.findById(meeting._id).populate(
      'organizerId',
      '_id name email avatar role'
    );

    const obj = populatedMeeting.toObject();
    const dt = MeetingService.formatMeetingDateTime(obj.scheduledStartAt, obj.timezone);
    obj.date = dt.date;
    obj.startTime = dt.startTime;
    obj.meetingLink = meetingLink;

    return obj;
  }

  /**
   * List meetings accessible to the user
   */
  static async listMeetings({ userId, status, type, page = 1, limit = 20, search, date }) {
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const skip = (pageNum - 1) * limitNum;

    const user = await User.findById(userId).select('email normalizedEmail');
    const userEmail = user?.email?.toLowerCase();

    // Auto-link any invitation records with this user's email that have not been linked to userId
    if (userEmail) {
      await MeetingParticipant.updateMany(
        { email: userEmail, userId: null },
        { userId }
      );
    }

    // Find all meetings where user is either organizer OR a participant
    const participantMatches = await MeetingParticipant.find({
      $or: [
        { userId },
        ...(userEmail ? [{ email: userEmail }] : [])
      ]
    }).select('meetingId status role');

    const participantMeetings = participantMatches.map((p) => p.meetingId);

    const filter = {
      deletedAt: null,
      $or: [{ organizerId: userId }, { _id: { $in: participantMeetings } }]
    };

    if (type === 'upcoming') {
      filter.status = { $in: ['upcoming', 'live'] };
    } else if (type === 'past') {
      filter.$or = [
        { status: 'completed' },
        { scheduledEndAt: { $lt: new Date() } }
      ];
    } else if (type === 'invitations') {
      const invitedMeetingIds = participantMatches
        .filter((p) => ['invited', 'pending'].includes(p.status))
        .map((p) => p.meetingId);
      delete filter.$or;
      filter._id = { $in: invitedMeetingIds };
    } else if (status && ['upcoming', 'live', 'completed', 'cancelled'].includes(status)) {
      filter.status = status;
    }

    if (search) {
      filter.$and = filter.$and || [];
      filter.$and.push({
        $or: [
          { title: { $regex: search, $options: 'i' } },
          { meetingCode: { $regex: search, $options: 'i' } }
        ]
      });
    }

    if (date) {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      filter.scheduledStartAt = { $gte: startOfDay, $lte: endOfDay };
    }

    const [meetings, total] = await Promise.all([
      Meeting.find(filter)
        .populate('organizerId', '_id name email avatar role')
        .sort({ createdAt: -1, scheduledStartAt: -1 })
        .skip(skip)
        .limit(limitNum),
      Meeting.countDocuments(filter)
    ]);

    const meetingIds = meetings.map((m) => m._id);
    const [participantCounts, myParticipations] = await Promise.all([
      MeetingParticipant.aggregate([
        { $match: { meetingId: { $in: meetingIds } } },
        { $group: { _id: '$meetingId', count: { $sum: 1 } } }
      ]),
      MeetingParticipant.find({
        meetingId: { $in: meetingIds },
        $or: [{ userId }, ...(userEmail ? [{ email: userEmail }] : [])]
      })
    ]);

    const countMap = new Map(participantCounts.map((pc) => [pc._id.toString(), pc.count]));
    const myStatusMap = new Map(myParticipations.map((p) => [p.meetingId.toString(), p.status]));
    const myRoleMap = new Map(myParticipations.map((p) => [p.meetingId.toString(), p.role]));

    const origin = env.FRONTEND_URL || 'http://localhost:3000';

    const formatted = meetings.map((m) => {
      const obj = m.toObject();
      const mId = m._id.toString();
      const isOrganizer = obj.organizerId?._id?.toString() === userId.toString();

      obj.participantCount = countMap.get(mId) || 1;
      obj.myInvitationStatus = myStatusMap.get(mId) || (isOrganizer ? 'accepted' : 'none');
      obj.myRole = myRoleMap.get(mId) || (isOrganizer ? 'host' : 'attendee');

      const dt = MeetingService.formatMeetingDateTime(obj.scheduledStartAt, obj.timezone);
      obj.date = dt.date;
      obj.startTime = dt.startTime;
      obj.meetingLink = `${origin}/meeting/${obj.meetingCode}`;

      return obj;
    });

    return {
      meetings: formatted,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum) || 1
    };
  }

  /**
   * Get meeting details by ID or code
   */
  static async getMeetingDetails(meetingIdentifier, userId) {
    const meeting = await this.resolveMeeting(meetingIdentifier);
    if (!meeting) {
      const err = new Error('Meeting not found');
      err.statusCode = 404;
      err.code = 'MEETING_NOT_FOUND';
      throw err;
    }

    const participants = await MeetingParticipant.find({ meetingId: meeting._id })
      .populate('userId', '_id name email avatar role')
      .sort({ createdAt: 1 });

    const obj = meeting.toObject();
    obj.participants = participants.map((p) => ({
      id: p.userId?._id || p.userId || p._id,
      participantId: p._id,
      name: p.userId?.name || p.name || 'Participant',
      email: p.userId?.email || p.email || '',
      avatar: p.userId?.avatar || '',
      role: p.role,
      status: p.status,
      joinedAt: p.joinedAt,
      leftAt: p.leftAt,
      invitationSentAt: p.invitationSentAt,
      invitationDeliveryStatus: p.invitationDeliveryStatus,
      invitationError: p.invitationError,
      respondedAt: p.respondedAt
    }));
    obj.participantCount = participants.length;

    const user = await User.findById(userId).select('email');
    const userEmail = user?.email?.toLowerCase();
    const myParticipant = participants.find(
      (p) => (p.userId?._id?.toString() === userId.toString()) || (userEmail && p.email?.toLowerCase() === userEmail)
    );
    obj.myInvitationStatus = myParticipant ? myParticipant.status : (obj.organizerId?._id?.toString() === userId.toString() ? 'accepted' : 'none');
    obj.myRole = myParticipant ? myParticipant.role : (obj.organizerId?._id?.toString() === userId.toString() ? 'host' : 'attendee');

    const dt = MeetingService.formatMeetingDateTime(obj.scheduledStartAt, obj.timezone);
    obj.date = dt.date;
    obj.startTime = dt.startTime;
    obj.meetingLink = `${env.FRONTEND_URL || 'http://localhost:3000'}/meeting/${obj.meetingCode}`;

    return obj;
  }

  /**
   * Update meeting
   */
  static async updateMeeting(meetingIdentifier, userId, updateData) {
    const meeting = await this.resolveMeeting(meetingIdentifier);
    if (!meeting) {
      const err = new Error('Meeting not found');
      err.statusCode = 404;
      err.code = 'MEETING_NOT_FOUND';
      throw err;
    }

    if (meeting.organizerId._id.toString() !== userId.toString()) {
      const err = new Error('Only the meeting organizer can modify meeting details');
      err.statusCode = 403;
      err.code = 'FORBIDDEN';
      throw err;
    }

    if (updateData.title) meeting.title = updateData.title.trim();
    if (updateData.description !== undefined) meeting.description = updateData.description.trim();
    if (updateData.durationMinutes) meeting.durationMinutes = Number(updateData.durationMinutes);
    if (updateData.passcode !== undefined) meeting.passcode = updateData.passcode.trim();
    if (updateData.timezone) meeting.timezone = updateData.timezone.trim();

    let timeChanged = false;
    if (updateData.scheduledStartAt) {
      const newStart = new Date(updateData.scheduledStartAt);
      if (!isNaN(newStart.getTime())) {
        meeting.scheduledStartAt = newStart;
        meeting.scheduledEndAt = new Date(meeting.scheduledStartAt.getTime() + meeting.durationMinutes * 60000);
        timeChanged = true;
      }
    } else if (updateData.date && updateData.startTime) {
      const newStart = new Date(`${updateData.date}T${updateData.startTime}:00`);
      if (!isNaN(newStart.getTime())) {
        meeting.scheduledStartAt = newStart;
        meeting.scheduledEndAt = new Date(meeting.scheduledStartAt.getTime() + meeting.durationMinutes * 60000);
        timeChanged = true;
      }
    }

    if (updateData.settings) {
      meeting.settings = {
        ...meeting.settings,
        ...updateData.settings
      };
    }

    await meeting.save();

    // If time was rescheduled, notify all attendees by email
    if (timeChanged) {
      const participants = await MeetingParticipant.find({
        meetingId: meeting._id,
        role: 'attendee'
      }).populate('userId', 'email name');

      const origin = env.FRONTEND_URL || 'http://localhost:3000';
      const meetingLink = `${origin}/meeting/${meeting.meetingCode}`;

      for (const p of participants) {
        const email = p.email || p.userId?.email;
        if (email) {
          sendMeetingRescheduledEmail({
            to: email,
            inviteeName: p.name || p.userId?.name || 'Participant',
            hostName: meeting.organizerId.name || 'Workspace Host',
            title: meeting.title,
            description: meeting.description,
            scheduledStartAt: meeting.scheduledStartAt,
            scheduledEndAt: meeting.scheduledEndAt,
            timezone: meeting.timezone || 'UTC',
            durationMinutes: meeting.durationMinutes,
            meetingCode: meeting.meetingCode,
            meetingLink,
            passcode: meeting.passcode
          }).catch(() => {});
        }
      }
    }

    return await this.getMeetingDetails(meeting._id, userId);
  }

  /**
   * Cancel meeting
   */
  static async cancelMeeting(meetingIdentifier, userId) {
    const meeting = await this.resolveMeeting(meetingIdentifier);
    if (!meeting) {
      const err = new Error('Meeting not found');
      err.statusCode = 404;
      err.code = 'MEETING_NOT_FOUND';
      throw err;
    }

    if (meeting.organizerId._id.toString() !== userId.toString()) {
      const err = new Error('Only the meeting organizer can cancel this meeting');
      err.statusCode = 403;
      err.code = 'FORBIDDEN';
      throw err;
    }

    meeting.status = 'cancelled';
    meeting.actualEndedAt = new Date();
    await meeting.save();

    // Notify participants by email
    const participants = await MeetingParticipant.find({
      meetingId: meeting._id,
      role: 'attendee'
    }).populate('userId', 'email name');

    for (const p of participants) {
      const email = p.email || p.userId?.email;
      if (email) {
        sendMeetingCancellationEmail({
          to: email,
          inviteeName: p.name || p.userId?.name || 'Participant',
          hostName: meeting.organizerId.name || 'Workspace Host',
          title: meeting.title,
          meetingCode: meeting.meetingCode
        }).catch(() => {});
      }
    }

    return meeting;
  }

  /**
   * Respond to meeting invitation (accept / decline / tentative)
   */
  static async respondToInvitation({ meetingId, userId, action }) {
    const meeting = await this.resolveMeeting(meetingId);
    if (!meeting) {
      const err = new Error('Meeting not found');
      err.statusCode = 404;
      err.code = 'MEETING_NOT_FOUND';
      throw err;
    }

    const user = await User.findById(userId).select('email name');
    const userEmail = user?.email?.toLowerCase();

    const participant = await MeetingParticipant.findOne({
      meetingId: meeting._id,
      $or: [
        { userId },
        ...(userEmail ? [{ email: userEmail }] : [])
      ]
    });

    if (!participant) {
      const err = new Error('Invitation record not found for this user');
      err.statusCode = 404;
      err.code = 'INVITATION_NOT_FOUND';
      throw err;
    }

    const normalizedAction = (action || '').toLowerCase().trim();
    let newStatus = 'pending';
    if (['accept', 'accepted'].includes(normalizedAction)) {
      newStatus = 'accepted';
    } else if (['decline', 'declined'].includes(normalizedAction)) {
      newStatus = 'declined';
    } else if (['tentative'].includes(normalizedAction)) {
      newStatus = 'tentative';
    } else {
      const err = new Error('Invalid invitation response action. Supported: accept, decline, tentative');
      err.statusCode = 400;
      err.code = 'INVALID_ACTION';
      throw err;
    }

    participant.status = newStatus;
    participant.respondedAt = new Date();
    if (!participant.userId) participant.userId = userId;
    await participant.save();

    return {
      success: true,
      meetingId: meeting._id,
      meetingCode: meeting.meetingCode,
      status: participant.status,
      respondedAt: participant.respondedAt
    };
  }

  /**
   * Get all invitations for a specific meeting
   */
  static async getMeetingInvitations(meetingIdentifier, userId) {
    const meeting = await this.resolveMeeting(meetingIdentifier);
    if (!meeting) {
      const err = new Error('Meeting not found');
      err.statusCode = 404;
      err.code = 'MEETING_NOT_FOUND';
      throw err;
    }

    const participants = await MeetingParticipant.find({ meetingId: meeting._id })
      .populate('userId', '_id name email avatar role')
      .sort({ createdAt: 1 });

    return {
      meetingId: meeting._id,
      meetingCode: meeting.meetingCode,
      title: meeting.title,
      scheduledStartAt: meeting.scheduledStartAt,
      invitations: participants.map((p) => ({
        id: p._id,
        participantId: p._id,
        userId: p.userId?._id || p.userId || null,
        name: p.userId?.name || p.name || 'Participant',
        email: p.userId?.email || p.email || '',
        avatar: p.userId?.avatar || '',
        role: p.role,
        status: p.status,
        invitationSentAt: p.invitationSentAt,
        invitationDeliveryStatus: p.invitationDeliveryStatus,
        invitationError: p.invitationError,
        respondedAt: p.respondedAt
      }))
    };
  }

  /**
   * Get invitations received by the current user
   */
  static async getUserInvitations(userId, statusFilter) {
    const user = await User.findById(userId).select('email');
    const userEmail = user?.email?.toLowerCase();

    if (userEmail) {
      await MeetingParticipant.updateMany(
        { email: userEmail, userId: null },
        { userId }
      );
    }

    const query = {
      $or: [
        { userId },
        ...(userEmail ? [{ email: userEmail }] : [])
      ],
      role: 'attendee'
    };

    if (statusFilter) {
      query.status = statusFilter;
    }

    const participations = await MeetingParticipant.find(query)
      .populate({
        path: 'meetingId',
        match: { deletedAt: null },
        populate: { path: 'organizerId', select: '_id name email avatar role' }
      })
      .sort({ createdAt: -1 });

    const invitations = participations
      .filter((p) => p.meetingId)
      .map((p) => {
        const m = p.meetingId;
        const dt = MeetingService.formatMeetingDateTime(m.scheduledStartAt, m.timezone);
        return {
          id: p._id,
          invitationId: p._id,
          status: p.status,
          role: p.role,
          respondedAt: p.respondedAt,
          invitationSentAt: p.invitationSentAt,
          meeting: {
            id: m._id,
            meetingCode: m.meetingCode,
            title: m.title,
            description: m.description,
            date: dt.date,
            startTime: dt.startTime,
            scheduledStartAt: m.scheduledStartAt,
            scheduledEndAt: m.scheduledEndAt,
            durationMinutes: m.durationMinutes,
            status: m.status,
            timezone: m.timezone || 'UTC',
            organizer: m.organizerId
          }
        };
      });

    return { invitations, total: invitations.length };
  }

  /**
   * Resend invitation email
   */
  static async resendInvitation({ meetingId, invitationId, hostUserId }) {
    const meeting = await this.resolveMeeting(meetingId);
    if (!meeting) {
      const err = new Error('Meeting not found');
      err.statusCode = 404;
      err.code = 'MEETING_NOT_FOUND';
      throw err;
    }

    if (meeting.organizerId._id.toString() !== hostUserId.toString()) {
      const err = new Error('Only the meeting organizer can resend invitations');
      err.statusCode = 403;
      err.code = 'FORBIDDEN';
      throw err;
    }

    const participant = await MeetingParticipant.findById(invitationId).populate('userId', 'email name');
    if (!participant || participant.meetingId.toString() !== meeting._id.toString()) {
      const err = new Error('Invitation record not found');
      err.statusCode = 404;
      err.code = 'INVITATION_NOT_FOUND';
      throw err;
    }

    const email = participant.email || participant.userId?.email;
    if (!email) {
      const err = new Error('Participant does not have a valid email address');
      err.statusCode = 400;
      err.code = 'NO_EMAIL';
      throw err;
    }

    const origin = env.FRONTEND_URL || 'http://localhost:3000';
    const meetingLink = `${origin}/meeting/${meeting.meetingCode}`;

    let deliveryStatus = 'sent';
    let deliveryError = null;

    try {
      const emailRes = await sendMeetingInvitationEmail({
        to: email,
        inviteeName: participant.name || participant.userId?.name || 'Participant',
        hostName: meeting.organizerId.name || 'Workspace Host',
        hostEmail: meeting.organizerId.email || 'no-reply@intellmeet.com',
        title: meeting.title,
        description: meeting.description,
        scheduledStartAt: meeting.scheduledStartAt,
        scheduledEndAt: meeting.scheduledEndAt,
        timezone: meeting.timezone || 'UTC',
        durationMinutes: meeting.durationMinutes,
        meetingCode: meeting.meetingCode,
        meetingLink,
        passcode: meeting.passcode
      });
      deliveryStatus = emailRes?.success ? (emailRes.delivered ? 'delivered' : 'sent') : 'failed';
      if (!emailRes?.success) deliveryError = emailRes?.error || 'Send failed';
    } catch (mailErr) {
      deliveryStatus = 'failed';
      deliveryError = mailErr.message;
    }

    participant.invitationSentAt = new Date();
    participant.invitationDeliveryStatus = deliveryStatus;
    participant.invitationError = deliveryError;
    await participant.save();

    return {
      success: deliveryStatus !== 'failed',
      invitationId: participant._id,
      deliveryStatus,
      deliveryError
    };
  }

  static async getUpcomingMeetings({ userId, page = 1, limit = 20, search }) {
    return this.listMeetings({ userId, type: 'upcoming', page, limit, search });
  }

  static async getPastMeetings({ userId, page = 1, limit = 20, search }) {
    return this.listMeetings({ userId, type: 'past', page, limit, search });
  }

  /**
   * Delete meeting (soft-delete)
   */
  static async deleteMeeting(meetingIdentifier, userId) {
    const meeting = await this.resolveMeeting(meetingIdentifier);
    if (!meeting) {
      const err = new Error('Meeting not found');
      err.statusCode = 404;
      err.code = 'MEETING_NOT_FOUND';
      throw err;
    }

    if (meeting.organizerId._id.toString() !== userId.toString()) {
      const err = new Error('Only the meeting organizer can delete this meeting');
      err.statusCode = 403;
      err.code = 'FORBIDDEN';
      throw err;
    }

    meeting.deletedAt = new Date();
    await meeting.save();

    return { success: true, message: 'Meeting deleted successfully' };
  }

  /**
   * End meeting for all participants
   */
  static async endMeeting(meetingIdentifier, userId) {
    const meeting = await this.resolveMeeting(meetingIdentifier);
    if (!meeting) {
      const err = new Error('Meeting not found');
      err.statusCode = 404;
      err.code = 'MEETING_NOT_FOUND';
      throw err;
    }

    if (meeting.organizerId._id.toString() !== userId.toString()) {
      const err = new Error('Only the meeting organizer can end this meeting');
      err.statusCode = 403;
      err.code = 'FORBIDDEN';
      throw err;
    }

    meeting.status = 'completed';
    meeting.actualEndedAt = new Date();
    await meeting.save();

    // Mark all active participants as left
    await MeetingParticipant.updateMany(
      { meetingId: meeting._id, status: 'joined' },
      { status: 'left', leftAt: new Date() }
    );

    return meeting;
  }

  /**
   * Join meeting
   */
  static async joinMeeting(meetingIdentifier, user, passcode = null) {
    const meeting = await this.resolveMeeting(meetingIdentifier);
    if (!meeting) {
      const err = new Error('Meeting not found or invalid meeting code');
      err.statusCode = 404;
      err.code = 'MEETING_NOT_FOUND';
      throw err;
    }

    if (meeting.status === 'cancelled') {
      const err = new Error('This meeting has been cancelled');
      err.statusCode = 410;
      err.code = 'MEETING_CANCELLED';
      throw err;
    }

    if (meeting.status === 'completed') {
      const err = new Error('This meeting has already ended');
      err.statusCode = 410;
      err.code = 'MEETING_ENDED';
      throw err;
    }

    const isOrganizer = meeting.organizerId._id.toString() === user.userId.toString();

    // Check if user is an authorized participant (organizer, or explicitly invited/accepted participant)
    let userEmail = user.email ? user.email.toLowerCase() : null;
    if (!userEmail) {
      const uDoc = await User.findById(user.userId).select('email');
      if (uDoc?.email) userEmail = uDoc.email.toLowerCase();
    }

    const existingParticipant = await MeetingParticipant.findOne({
      meetingId: meeting._id,
      $or: [
        { userId: user.userId },
        ...(userEmail ? [{ email: userEmail }] : [])
      ]
    });

    const isAuthorizedInvitee = existingParticipant && ['accepted', 'pending', 'invited', 'joined'].includes(existingParticipant.status);

    if (meeting.passcode && !isOrganizer && !isAuthorizedInvitee) {
      if (!passcode || meeting.passcode.trim() !== passcode.trim()) {
        const err = new Error('Invalid meeting passcode');
        err.statusCode = 403;
        err.code = 'INVALID_PASSCODE';
        throw err;
      }
    }

    // Check capacity
    const currentActiveCount = await MeetingParticipant.countDocuments({
      meetingId: meeting._id,
      status: 'joined'
    });

    if (currentActiveCount >= (meeting.participantLimit || 100)) {
      const err = new Error('Meeting has reached maximum capacity');
      err.statusCode = 403;
      err.code = 'MEETING_CAPACITY_REACHED';
      throw err;
    }

    // If meeting was upcoming, transition to live
    if (meeting.status === 'upcoming' && isOrganizer) {
      meeting.status = 'live';
      meeting.actualStartedAt = new Date();
      await meeting.save();
    }

    // Upsert participant record
    const participant = await MeetingParticipant.findOneAndUpdate(
      { meetingId: meeting._id, userId: user.userId },
      {
        meetingId: meeting._id,
        userId: user.userId,
        role: isOrganizer ? 'host' : 'attendee',
        status: 'joined',
        joinedAt: new Date(),
        lastSeenAt: new Date()
      },
      { upsert: true, new: true }
    );

    const joinInfo = await this.getJoinInfo(meeting._id, user.userId);

    return {
      meeting: {
        id: meeting._id,
        meetingCode: meeting.meetingCode,
        title: meeting.title,
        status: meeting.status,
        settings: meeting.settings,
        organizer: meeting.organizerId
      },
      participant: {
        userId: user.userId,
        role: participant.role,
        status: participant.status,
        joinedAt: participant.joinedAt
      },
      iceServers: joinInfo.iceServers
    };
  }

  /**
   * Leave meeting
   */
  static async leaveMeeting(meetingIdentifier, userId) {
    const meeting = await this.resolveMeeting(meetingIdentifier);
    if (!meeting) {
      return { success: true };
    }

    await MeetingParticipant.findOneAndUpdate(
      { meetingId: meeting._id, userId },
      { status: 'left', leftAt: new Date(), socketId: null }
    );

    return { success: true };
  }

  /**
   * Get participants of a meeting
   */
  static async getMeetingParticipants(meetingIdentifier, userId) {
    const meeting = await this.resolveMeeting(meetingIdentifier);
    if (!meeting) {
      const err = new Error('Meeting not found');
      err.statusCode = 404;
      err.code = 'MEETING_NOT_FOUND';
      throw err;
    }

    const participants = await MeetingParticipant.find({ meetingId: meeting._id })
      .populate('userId', '_id name email avatar role')
      .sort({ joinedAt: 1 });

    return participants.map((p) => ({
      id: p.userId?._id || p.userId,
      name: p.userId?.name || 'Participant',
      email: p.userId?.email || '',
      avatar: p.userId?.avatar || '',
      role: p.role,
      status: p.status,
      joinedAt: p.joinedAt,
      leftAt: p.leftAt
    }));
  }

  /**
   * Get past meeting history
   */
  static async getMeetingHistory({ userId, page = 1, limit = 20, search }) {
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const skip = (pageNum - 1) * limitNum;

    const participantMeetings = await MeetingParticipant.find({ userId }).distinct('meetingId');

    const filter = {
      deletedAt: null,
      $or: [{ organizerId: userId }, { _id: { $in: participantMeetings } }],
      status: { $in: ['completed', 'cancelled'] }
    };

    if (search) {
      filter.$and = filter.$and || [];
      filter.$and.push({
        $or: [
          { title: { $regex: search, $options: 'i' } },
          { meetingCode: { $regex: search, $options: 'i' } }
        ]
      });
    }

    const [meetings, total] = await Promise.all([
      Meeting.find(filter)
        .populate('organizerId', '_id name email avatar role')
        .sort({ actualEndedAt: -1, scheduledStartAt: -1 })
        .skip(skip)
        .limit(limitNum),
      Meeting.countDocuments(filter)
    ]);

    return {
      meetings,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum) || 1
    };
  }

  /**
   * Get ICE / STUN / TURN credentials for WebRTC
   */
  static async getJoinInfo(meetingIdentifier, userId) {
    const meeting = await this.resolveMeeting(meetingIdentifier);
    if (!meeting) {
      const err = new Error('Meeting not found');
      err.statusCode = 404;
      err.code = 'MEETING_NOT_FOUND';
      throw err;
    }

    const iceServers = [];

    // 1. STUN Servers (public / fallback)
    const stunUrls = env.WEBRTC?.STUN_SERVERS || [
      'stun:stun.l.google.com:19302',
      'stun:stun1.l.google.com:19302'
    ];
    iceServers.push({
      urls: stunUrls
    });

    // 2. TURN Server (if configured)
    if (env.WEBRTC?.TURN_SERVER_URL) {
      const turnServer = { urls: env.WEBRTC.TURN_SERVER_URL };

      if (env.WEBRTC.TURN_SECRET) {
        // Ephemeral time-limited credentials (standard coturn format)
        const ttl = env.WEBRTC.TURN_TTL_SECONDS || 86400;
        const expiry = Math.floor(Date.now() / 1000) + ttl;
        const username = `${expiry}:${userId}`;
        const credential = crypto
          .createHmac('sha1', env.WEBRTC.TURN_SECRET)
          .update(username)
          .digest('base64');

        turnServer.username = username;
        turnServer.credential = credential;
      } else if (env.WEBRTC.TURN_USERNAME && env.WEBRTC.TURN_CREDENTIAL) {
        turnServer.username = env.WEBRTC.TURN_USERNAME;
        turnServer.credential = env.WEBRTC.TURN_CREDENTIAL;
      }

      iceServers.push(turnServer);
    }

    return {
      meetingId: meeting._id,
      meetingCode: meeting.meetingCode,
      title: meeting.title,
      iceServers
    };
  }

  /**
   * Live meeting chat: Get message history
   */
  static async getMeetingMessages(meetingIdentifier, userId, { limit = 50, page = 1, before }) {
    const meeting = await this.resolveMeeting(meetingIdentifier);
    if (!meeting) {
      const err = new Error('Meeting not found');
      err.statusCode = 404;
      err.code = 'MEETING_NOT_FOUND';
      throw err;
    }

    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const filter = {
      meetingId: meeting._id,
      isDeleted: false
    };

    if (before && !isNaN(new Date(before).getTime())) {
      filter.createdAt = { $lt: new Date(before) };
    }

    const messages = await MeetingMessage.find(filter)
      .populate('senderId', '_id name email avatar role')
      .sort({ createdAt: 1 })
      .limit(limitNum);

    return messages.map((m) => ({
      id: m._id,
      meetingId: m.meetingId,
      senderId: m.senderId?._id || m.senderId,
      sender: {
        id: m.senderId?._id || m.senderId,
        name: m.senderId?.name || 'User',
        email: m.senderId?.email || '',
        avatar: m.senderId?.avatar || ''
      },
      content: m.content,
      clientMessageId: m.clientMessageId,
      messageType: m.messageType,
      isEdited: m.isEdited,
      editedAt: m.editedAt,
      createdAt: m.createdAt
    }));
  }

  /**
   * Live meeting chat: Send message
   */
  static async sendMeetingMessage({ meetingId, senderId, content, clientMessageId, messageType = 'text' }) {
    if (!content || !content.trim()) {
      const err = new Error('Message content cannot be empty');
      err.statusCode = 400;
      err.code = 'VALIDATION_ERROR';
      throw err;
    }

    // Check duplicate clientMessageId
    if (clientMessageId) {
      const existing = await MeetingMessage.findOne({
        meetingId,
        clientMessageId
      }).populate('senderId', '_id name email avatar role');

      if (existing) {
        return {
          message: {
            id: existing._id,
            meetingId: existing.meetingId,
            senderId: existing.senderId?._id || existing.senderId,
            sender: {
              id: existing.senderId?._id || existing.senderId,
              name: existing.senderId?.name || 'User',
              email: existing.senderId?.email || '',
              avatar: existing.senderId?.avatar || ''
            },
            content: existing.content,
            clientMessageId: existing.clientMessageId,
            messageType: existing.messageType,
            createdAt: existing.createdAt
          },
          isDuplicate: true
        };
      }
    }

    const message = await MeetingMessage.create({
      meetingId,
      senderId,
      content: content.trim(),
      clientMessageId,
      messageType
    });

    const populated = await MeetingMessage.findById(message._id).populate(
      'senderId',
      '_id name email avatar role'
    );

    return {
      message: {
        id: populated._id,
        meetingId: populated.meetingId,
        senderId: populated.senderId?._id || populated.senderId,
        sender: {
          id: populated.senderId?._id || populated.senderId,
          name: populated.senderId?.name || 'User',
          email: populated.senderId?.email || '',
          avatar: populated.senderId?.avatar || ''
        },
        content: populated.content,
        clientMessageId: populated.clientMessageId,
        messageType: populated.messageType,
        createdAt: populated.createdAt
      },
      isDuplicate: false
    };
  }

  /**
   * Live meeting chat: Edit message
   */
  static async editMeetingMessage(meetingIdentifier, messageId, userId, newContent) {
    if (!newContent || !newContent.trim()) {
      const err = new Error('Message content cannot be empty');
      err.statusCode = 400;
      err.code = 'VALIDATION_ERROR';
      throw err;
    }

    const message = await MeetingMessage.findById(messageId);
    if (!message || message.isDeleted) {
      const err = new Error('Message not found');
      err.statusCode = 404;
      err.code = 'MESSAGE_NOT_FOUND';
      throw err;
    }

    if (message.senderId.toString() !== userId.toString()) {
      const err = new Error('You can only edit your own messages');
      err.statusCode = 403;
      err.code = 'FORBIDDEN';
      throw err;
    }

    message.content = newContent.trim();
    message.isEdited = true;
    message.editedAt = new Date();
    await message.save();

    return {
      id: message._id,
      meetingId: message.meetingId,
      content: message.content,
      isEdited: message.isEdited,
      editedAt: message.editedAt
    };
  }

  /**
   * Live meeting chat: Delete message (soft delete)
   */
  static async deleteMeetingMessage(meetingIdentifier, messageId, userId) {
    const meeting = await this.resolveMeeting(meetingIdentifier);
    const message = await MeetingMessage.findById(messageId);

    if (!message || message.isDeleted) {
      const err = new Error('Message not found');
      err.statusCode = 404;
      err.code = 'MESSAGE_NOT_FOUND';
      throw err;
    }

    const isAuthor = message.senderId.toString() === userId.toString();
    const isHost = meeting && meeting.organizerId._id.toString() === userId.toString();

    if (!isAuthor && !isHost) {
      const err = new Error('You do not have permission to delete this message');
      err.statusCode = 403;
      err.code = 'FORBIDDEN';
      throw err;
    }

    message.isDeleted = true;
    message.deletedAt = new Date();
    message.content = 'This message was deleted';
    await message.save();

    return {
      id: message._id,
      meetingId: message.meetingId,
      isDeleted: true,
      deletedAt: message.deletedAt
    };
  }

  /**
   * Search messages within a meeting
   */
  static async searchMeetingMessages(meetingIdentifier, userId, { query, limit = 20 }) {
    const meeting = await this.resolveMeeting(meetingIdentifier);
    if (!meeting) {
      const err = new Error('Meeting not found');
      err.statusCode = 404;
      err.code = 'MEETING_NOT_FOUND';
      throw err;
    }

    if (!query || !query.trim()) {
      return [];
    }

    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10)));
    const messages = await MeetingMessage.find({
      meetingId: meeting._id,
      isDeleted: false,
      content: { $regex: query.trim(), $options: 'i' }
    })
      .populate('senderId', '_id name email avatar role')
      .sort({ createdAt: 1 })
      .limit(limitNum);

    return messages.map((m) => ({
      id: m._id,
      meetingId: m.meetingId,
      sender: {
        id: m.senderId?._id || m.senderId,
        name: m.senderId?.name || 'User',
        email: m.senderId?.email || '',
        avatar: m.senderId?.avatar || ''
      },
      content: m.content,
      createdAt: m.createdAt
    }));
  }

  /**
   * Invite generator
   */
  static async generateInvite(meetingIdentifier, userId) {
    const meeting = await this.resolveMeeting(meetingIdentifier);
    if (!meeting) {
      const err = new Error('Meeting not found');
      err.statusCode = 404;
      err.code = 'MEETING_NOT_FOUND';
      throw err;
    }

    const baseUrl = env.FRONTEND_URL || 'http://localhost:3000';
    return {
      meetingId: meeting._id,
      meetingCode: meeting.meetingCode,
      passcode: meeting.passcode,
      title: meeting.title,
      inviteUrl: `${baseUrl}/meeting/${meeting.meetingCode}`
    };
  }

  /**
   * Remove participant by host
   */
  static async removeParticipant(meetingIdentifier, targetUserId, requesterId) {
    const meeting = await this.resolveMeeting(meetingIdentifier);
    if (!meeting) {
      const err = new Error('Meeting not found');
      err.statusCode = 404;
      err.code = 'MEETING_NOT_FOUND';
      throw err;
    }

    if (meeting.organizerId._id.toString() !== requesterId.toString()) {
      const err = new Error('Only the meeting host can remove participants');
      err.statusCode = 403;
      err.code = 'FORBIDDEN';
      throw err;
    }

    await MeetingParticipant.findOneAndUpdate(
      { meetingId: meeting._id, userId: targetUserId },
      { status: 'left', leftAt: new Date(), socketId: null }
    );

    return { success: true };
  }

  /**
   * Update participant role by host
   */
  static async updateParticipantRole(meetingIdentifier, targetUserId, newRole, requesterId) {
    const meeting = await this.resolveMeeting(meetingIdentifier);
    if (!meeting) {
      const err = new Error('Meeting not found');
      err.statusCode = 404;
      err.code = 'MEETING_NOT_FOUND';
      throw err;
    }

    if (meeting.organizerId._id.toString() !== requesterId.toString()) {
      const err = new Error('Only the meeting host can change participant roles');
      err.statusCode = 403;
      err.code = 'FORBIDDEN';
      throw err;
    }

    if (!['host', 'co-host', 'attendee'].includes(newRole)) {
      const err = new Error('Invalid role');
      err.statusCode = 400;
      err.code = 'VALIDATION_ERROR';
      throw err;
    }

    const updated = await MeetingParticipant.findOneAndUpdate(
      { meetingId: meeting._id, userId: targetUserId },
      { role: newRole },
      { new: true }
    );

    return updated;
  }
}
