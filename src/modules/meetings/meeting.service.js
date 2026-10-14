import mongoose from 'mongoose';
import crypto from 'crypto';
import { Meeting } from './meeting.model.js';
import { MeetingParticipant } from './participant.model.js';
import { MeetingMessage } from './meeting-message.model.js';
import { User } from '../users/user.model.js';
import { env } from '../../config/env.js';

export class MeetingService {
  static isValidObjectId(id) {
    return mongoose.isValidObjectId(id);
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
  static async createMeeting(data, organizerId) {
    const meetingCode = await this.generateMeetingCode();
    const passcode = data.passcode || crypto.randomBytes(3).toString('hex').toUpperCase();

    let scheduledStartAt = data.scheduledStartAt ? new Date(data.scheduledStartAt) : new Date();
    if (data.date && data.startTime) {
      scheduledStartAt = new Date(`${data.date}T${data.startTime}:00`);
    }

    const durationMinutes = Number(data.durationMinutes) || 45;
    const scheduledEndAt = data.scheduledEndAt
      ? new Date(data.scheduledEndAt)
      : new Date(scheduledStartAt.getTime() + durationMinutes * 60000);

    const isInstant = Boolean(data.isInstant);
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
      status: isInstant ? 'joined' : 'invited',
      joinedAt: isInstant ? new Date() : null
    });

    // If invitees are specified by email, register them as invited
    if (Array.isArray(data.participantEmails) && data.participantEmails.length > 0) {
      for (const email of data.participantEmails) {
        const cleanEmail = email.trim().toLowerCase();
        if (!cleanEmail) continue;

        const invitedUser = await User.findOne({
          $or: [{ normalizedEmail: cleanEmail }, { email: cleanEmail }]
        });

        if (invitedUser && invitedUser._id.toString() !== organizerId.toString()) {
          await MeetingParticipant.findOneAndUpdate(
            { meetingId: meeting._id, userId: invitedUser._id },
            {
              meetingId: meeting._id,
              userId: invitedUser._id,
              role: 'attendee',
              status: 'invited'
            },
            { upsert: true }
          );
        }
      }
    }

    const populatedMeeting = await Meeting.findById(meeting._id).populate(
      'organizerId',
      '_id name email avatar role'
    );

    return populatedMeeting;
  }

  /**
   * List meetings accessible to the user
   */
  static async listMeetings({ userId, status, page = 1, limit = 20, search, date }) {
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const skip = (pageNum - 1) * limitNum;

    // Find all meetings where user is either organizer OR a participant
    const participantMeetings = await MeetingParticipant.find({ userId }).distinct('meetingId');

    const filter = {
      deletedAt: null,
      $or: [{ organizerId: userId }, { _id: { $in: participantMeetings } }]
    };

    if (status && ['upcoming', 'live', 'completed', 'cancelled'].includes(status)) {
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
        .sort({ scheduledStartAt: status === 'completed' ? -1 : 1 })
        .skip(skip)
        .limit(limitNum),
      Meeting.countDocuments(filter)
    ]);

    // Attach participant counts
    const meetingIds = meetings.map((m) => m._id);
    const participantCounts = await MeetingParticipant.aggregate([
      { $match: { meetingId: { $in: meetingIds } } },
      { $group: { _id: '$meetingId', count: { $sum: 1 } } }
    ]);

    const countMap = new Map(participantCounts.map((pc) => [pc._id.toString(), pc.count]));

    const formatted = meetings.map((m) => {
      const obj = m.toObject();
      obj.participantCount = countMap.get(m._id.toString()) || 1;
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
      .sort({ joinedAt: 1 });

    const obj = meeting.toObject();
    obj.participants = participants.map((p) => ({
      id: p.userId?._id || p.userId,
      name: p.userId?.name || 'Participant',
      email: p.userId?.email || '',
      avatar: p.userId?.avatar || '',
      role: p.role,
      status: p.status,
      joinedAt: p.joinedAt,
      leftAt: p.leftAt
    }));
    obj.participantCount = participants.length;

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

    if (updateData.scheduledStartAt) {
      meeting.scheduledStartAt = new Date(updateData.scheduledStartAt);
      meeting.scheduledEndAt = new Date(
        meeting.scheduledStartAt.getTime() + meeting.durationMinutes * 60000
      );
    } else if (updateData.date && updateData.startTime) {
      meeting.scheduledStartAt = new Date(`${updateData.date}T${updateData.startTime}:00`);
      meeting.scheduledEndAt = new Date(
        meeting.scheduledStartAt.getTime() + meeting.durationMinutes * 60000
      );
    }

    if (updateData.settings) {
      meeting.settings = {
        ...meeting.settings,
        ...updateData.settings
      };
    }

    await meeting.save();
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

    return meeting;
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

    if (meeting.passcode && !isOrganizer) {
      if (!passcode || meeting.passcode.trim() !== passcode.trim()) {
        const err = new Error('Invalid meeting passcode');
        err.statusCode = 401;
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
