import { MeetingService } from '../meeting.service.js';
import { MeetingParticipant } from '../participant.model.js';

// Global in-memory room tracker for active WebRTC peers
// Map<meetingId, Map<socketId, participantInfo>>
const activeMeetingPeers = new Map();

export function getActivePeersForMeeting(meetingId) {
  const roomPeers = activeMeetingPeers.get(meetingId.toString());
  if (!roomPeers) return [];
  return Array.from(roomPeers.values());
}

export function registerMeetingSocketHandlers(io, socket) {
  const userId = socket.user?.userId;
  const userName = socket.user?.name || 'User';
  const userEmail = socket.user?.email || '';
  const userRole = socket.user?.role || 'attendee';

  // Track meetings this socket has joined
  const joinedMeetings = new Set();

  /**
   * Event: meeting:join
   */
  socket.on('meeting:join', async (payload, callback) => {
    try {
      const meetingIdentifier = payload?.meetingId;
      if (!meetingIdentifier) {
        const errPayload = { code: 'INVALID_MEETING_ID', message: 'meetingId is required' };
        socket.emit('meeting:error', errPayload);
        if (typeof callback === 'function') callback({ success: false, error: errPayload });
        return;
      }

      const meeting = await MeetingService.resolveMeeting(meetingIdentifier);
      if (!meeting) {
        const errPayload = { code: 'MEETING_NOT_FOUND', message: 'Meeting not found' };
        socket.emit('meeting:error', errPayload);
        if (typeof callback === 'function') callback({ success: false, error: errPayload });
        return;
      }

      if (meeting.status === 'cancelled') {
        const errPayload = { code: 'MEETING_CANCELLED', message: 'This meeting was cancelled' };
        socket.emit('meeting:error', errPayload);
        if (typeof callback === 'function') callback({ success: false, error: errPayload });
        return;
      }

      if (meeting.status === 'completed') {
        const errPayload = { code: 'MEETING_ENDED', message: 'This meeting has ended' };
        socket.emit('meeting:error', errPayload);
        if (typeof callback === 'function') callback({ success: false, error: errPayload });
        return;
      }

      const meetingIdStr = meeting._id.toString();
      const roomName = `meeting:${meetingIdStr}`;
      const isHost = meeting.organizerId._id.toString() === userId.toString();

      // Check passcode authorization if meeting has passcode and user is not host
      if (meeting.passcode && !isHost) {
        const participantRecord = await MeetingParticipant.findOne({ meetingId: meeting._id, userId });
        const hasValidParticipantStatus = participantRecord && (participantRecord.status === 'joined' || participantRecord.status === 'invited');
        const passcodeMatches = payload.passcode && payload.passcode.trim() === meeting.passcode.trim();

        if (!hasValidParticipantStatus && !passcodeMatches) {
          const errPayload = { code: 'INVALID_PASSCODE', message: 'Invalid or missing meeting passcode' };
          socket.emit('meeting:error', errPayload);
          if (typeof callback === 'function') callback({ success: false, error: errPayload });
          return;
        }
      }

      // Join socket room
      socket.join(roomName);
      joinedMeetings.add(meetingIdStr);

      // Register or update participant in DB
      await MeetingParticipant.findOneAndUpdate(
        { meetingId: meeting._id, userId },
        {
          meetingId: meeting._id,
          userId,
          socketId: socket.id,
          role: isHost ? 'host' : 'attendee',
          status: 'joined',
          joinedAt: new Date(),
          lastSeenAt: new Date()
        },
        { upsert: true }
      );

      // Track active peer
      if (!activeMeetingPeers.has(meetingIdStr)) {
        activeMeetingPeers.set(meetingIdStr, new Map());
      }
      const roomPeersMap = activeMeetingPeers.get(meetingIdStr);

      // Existing peers in the room before this user joins
      const existingPeers = Array.from(roomPeersMap.values()).filter(
        (p) => p.socketId !== socket.id
      );

      const participantInfo = {
        userId,
        socketId: socket.id,
        name: userName,
        email: userEmail,
        role: isHost ? 'host' : 'attendee'
      };

      roomPeersMap.set(socket.id, participantInfo);

      // Notify other participants in the room
      socket.to(roomName).emit('meeting:participant:joined', {
        participant: participantInfo
      });

      // Send ack to joining client with existing peers so it can initiate/await WebRTC
      const joinResponse = {
        success: true,
        meetingId: meetingIdStr,
        meetingCode: meeting.meetingCode,
        isHost,
        peers: existingPeers
      };

      socket.emit('meeting:joined', joinResponse);
      if (typeof callback === 'function') callback(joinResponse);
    } catch (err) {
      const errPayload = { code: 'JOIN_ERROR', message: err.message };
      socket.emit('meeting:error', errPayload);
      if (typeof callback === 'function') callback({ success: false, error: errPayload });
    }
  });

  /**
   * Event: meeting:leave
   */
  socket.on('meeting:leave', async (payload, callback) => {
    try {
      const meetingIdentifier = payload?.meetingId;
      if (!meetingIdentifier) return;

      const meeting = await MeetingService.resolveMeeting(meetingIdentifier);
      const meetingIdStr = meeting ? meeting._id.toString() : meetingIdentifier.toString();
      const roomName = `meeting:${meetingIdStr}`;

      socket.leave(roomName);
      joinedMeetings.delete(meetingIdStr);

      const roomPeersMap = activeMeetingPeers.get(meetingIdStr);
      if (roomPeersMap) {
        roomPeersMap.delete(socket.id);
        if (roomPeersMap.size === 0) {
          activeMeetingPeers.delete(meetingIdStr);
        }
      }

      socket.to(roomName).emit('meeting:participant:left', {
        userId,
        socketId: socket.id
      });

      if (meeting) {
        await MeetingParticipant.findOneAndUpdate(
          { meetingId: meeting._id, userId },
          { status: 'left', leftAt: new Date(), socketId: null }
        );
      }

      if (typeof callback === 'function') callback({ success: true });
    } catch (err) {
      if (typeof callback === 'function') callback({ success: false, error: err.message });
    }
  });

  /**
   * WebRTC Signaling: Offer
   */
  socket.on('meeting:signal:offer', (payload) => {
    const { meetingId, targetSocketId, offer } = payload || {};
    if (!meetingId || !targetSocketId || !offer) return;

    // Relay to target peer with sender metadata
    io.to(targetSocketId).emit('meeting:signal:offer', {
      meetingId,
      senderSocketId: socket.id,
      senderUserId: userId,
      senderName: userName,
      senderEmail: userEmail,
      senderRole: userRole,
      offer
    });
  });

  /**
   * WebRTC Signaling: Answer
   */
  socket.on('meeting:signal:answer', (payload) => {
    const { meetingId, targetSocketId, answer } = payload || {};
    if (!meetingId || !targetSocketId || !answer) return;

    // Relay to target peer
    io.to(targetSocketId).emit('meeting:signal:answer', {
      meetingId,
      senderSocketId: socket.id,
      senderUserId: userId,
      answer
    });
  });

  /**
   * WebRTC Signaling: ICE Candidate
   */
  socket.on('meeting:signal:ice-candidate', (payload) => {
    const { meetingId, targetSocketId, candidate } = payload || {};
    if (!meetingId || !targetSocketId || !candidate) return;

    io.to(targetSocketId).emit('meeting:signal:ice-candidate', {
      meetingId,
      senderSocketId: socket.id,
      senderUserId: userId,
      candidate
    });
  });

  /**
   * WebRTC Signaling: Renegotiate
   */
  socket.on('meeting:signal:renegotiate', (payload) => {
    const { meetingId, targetSocketId } = payload || {};
    if (!meetingId || !targetSocketId) return;

    io.to(targetSocketId).emit('meeting:signal:renegotiate', {
      meetingId,
      senderSocketId: socket.id,
      senderUserId: userId
    });
  });

  /**
   * Live In-Meeting Chat: Send Message
   */
  socket.on('meeting:chat:send', async (payload, callback) => {
    const clientMessageId = payload?.clientMessageId;
    try {
      const { meetingId, content, messageType } = payload || {};
      if (!meetingId || !content) {
        const errorPayload = {
          success: false,
          clientMessageId,
          error: { code: 'VALIDATION_ERROR', message: 'meetingId and content are required' }
        };
        socket.emit('meeting:chat:error', errorPayload);
        if (typeof callback === 'function') callback(errorPayload);
        return;
      }

      const meeting = await MeetingService.resolveMeeting(meetingId);
      if (!meeting) {
        const errorPayload = {
          success: false,
          clientMessageId,
          error: { code: 'MEETING_NOT_FOUND', message: 'Meeting not found' }
        };
        socket.emit('meeting:chat:error', errorPayload);
        if (typeof callback === 'function') callback(errorPayload);
        return;
      }

      const result = await MeetingService.sendMeetingMessage({
        meetingId: meeting._id,
        senderId: userId,
        content,
        clientMessageId,
        messageType: messageType || 'text'
      });

      const ackPayload = {
        success: true,
        clientMessageId,
        message: result.message,
        isDuplicate: result.isDuplicate
      };

      // Broadcast to room
      io.to(`meeting:${meeting._id}`).emit('meeting:chat:new', {
        message: result.message
      });

      socket.emit('meeting:chat:ack', ackPayload);
      if (typeof callback === 'function') callback(ackPayload);
    } catch (err) {
      const errorPayload = {
        success: false,
        clientMessageId,
        error: { code: err.code || 'MESSAGE_SEND_FAILED', message: err.message }
      };
      socket.emit('meeting:chat:error', errorPayload);
      if (typeof callback === 'function') callback(errorPayload);
    }
  });

  /**
   * Live In-Meeting Chat: Edit Message
   */
  socket.on('meeting:chat:edit', async (payload, callback) => {
    try {
      const { meetingId, messageId, content } = payload || {};
      if (!meetingId || !messageId || !content) return;

      const meeting = await MeetingService.resolveMeeting(meetingId);
      if (!meeting) return;

      const updated = await MeetingService.editMeetingMessage(meeting._id, messageId, userId, content);

      io.to(`meeting:${meeting._id}`).emit('meeting:chat:edited', updated);
      if (typeof callback === 'function') callback({ success: true, message: updated });
    } catch (err) {
      if (typeof callback === 'function') callback({ success: false, error: err.message });
    }
  });

  /**
   * Live In-Meeting Chat: Delete Message
   */
  socket.on('meeting:chat:delete', async (payload, callback) => {
    try {
      const { meetingId, messageId } = payload || {};
      if (!meetingId || !messageId) return;

      const meeting = await MeetingService.resolveMeeting(meetingId);
      if (!meeting) return;

      const deleted = await MeetingService.deleteMeetingMessage(meeting._id, messageId, userId);

      io.to(`meeting:${meeting._id}`).emit('meeting:chat:deleted', deleted);
      if (typeof callback === 'function') callback({ success: true, message: deleted });
    } catch (err) {
      if (typeof callback === 'function') callback({ success: false, error: err.message });
    }
  });

  /**
   * Live In-Meeting Chat: Typing indicator
   */
  socket.on('meeting:chat:typing', (payload) => {
    const { meetingId, isTyping } = payload || {};
    if (!meetingId) return;

    socket.to(`meeting:${meetingId}`).emit('meeting:chat:typing', {
      meetingId,
      userId,
      name: userName,
      isTyping: Boolean(isTyping)
    });
  });

  /**
   * Participant Media State: Mute / Video / ScreenShare / HandRaise
   */
  socket.on('meeting:media:state', (payload) => {
    const { meetingId, isAudioMuted, isVideoOn, isScreenSharing, isHandRaised } = payload || {};
    if (!meetingId) return;

    socket.to(`meeting:${meetingId}`).emit('meeting:media:update', {
      meetingId,
      userId,
      socketId: socket.id,
      isAudioMuted: Boolean(isAudioMuted),
      isVideoOn: Boolean(isVideoOn),
      isScreenSharing: Boolean(isScreenSharing),
      isHandRaised: Boolean(isHandRaised)
    });
  });

  /**
   * Host Action: End Meeting
   */
  socket.on('meeting:end', async (payload, callback) => {
    try {
      const { meetingId } = payload || {};
      if (!meetingId) return;

      const meeting = await MeetingService.resolveMeeting(meetingId);
      if (!meeting) return;

      if (meeting.organizerId._id.toString() !== userId.toString()) {
        if (typeof callback === 'function') {
          callback({ success: false, error: 'Only the meeting host can end the meeting' });
        }
        return;
      }

      await MeetingService.endMeeting(meeting._id, userId);

      io.to(`meeting:${meeting._id}`).emit('meeting:ended', { meetingId: meeting._id });
      if (typeof callback === 'function') callback({ success: true });
    } catch (err) {
      if (typeof callback === 'function') callback({ success: false, error: err.message });
    }
  });

  /**
   * Host Action: Kick participant
   */
  socket.on('meeting:participant:remove', async (payload, callback) => {
    try {
      const { meetingId, targetUserId } = payload || {};
      if (!meetingId || !targetUserId) return;

      const meeting = await MeetingService.resolveMeeting(meetingId);
      if (!meeting) return;

      if (meeting.organizerId._id.toString() !== userId.toString()) {
        if (typeof callback === 'function') {
          callback({ success: false, error: 'Only the meeting host can remove participants' });
        }
        return;
      }

      await MeetingService.removeParticipant(meeting._id, targetUserId, userId);

      io.to(`meeting:${meeting._id}`).emit('meeting:participant:removed', {
        userId: targetUserId
      });

      if (typeof callback === 'function') callback({ success: true });
    } catch (err) {
      if (typeof callback === 'function') callback({ success: false, error: err.message });
    }
  });

  /**
   * Host Action: Mute participant
   */
  socket.on('meeting:participant:mute', async (payload, callback) => {
    try {
      const { meetingId, targetUserId } = payload || {};
      if (!meetingId || !targetUserId) return;

      const meeting = await MeetingService.resolveMeeting(meetingId);
      if (!meeting) return;

      if (meeting.organizerId._id.toString() !== userId.toString()) {
        if (typeof callback === 'function') {
          callback({ success: false, error: 'Only the meeting host can mute participants' });
        }
        return;
      }

      io.to(`meeting:${meeting._id}`).emit('meeting:participant:muted', {
        userId: targetUserId
      });

      if (typeof callback === 'function') callback({ success: true });
    } catch (err) {
      if (typeof callback === 'function') callback({ success: false, error: err.message });
    }
  });

  /**
   * Disconnect cleanup for meetings
   */
  socket.on('disconnect', async () => {
    for (const meetingIdStr of joinedMeetings) {
      const roomName = `meeting:${meetingIdStr}`;

      const roomPeersMap = activeMeetingPeers.get(meetingIdStr);
      if (roomPeersMap) {
        roomPeersMap.delete(socket.id);
        if (roomPeersMap.size === 0) {
          activeMeetingPeers.delete(meetingIdStr);
        }
      }

      socket.to(roomName).emit('meeting:participant:left', {
        userId,
        socketId: socket.id
      });

      try {
        // If user has no more sockets in this meeting, mark as left in DB
        const remainingSockets = roomPeersMap
          ? Array.from(roomPeersMap.values()).filter((p) => p.userId === userId)
          : [];
        if (remainingSockets.length === 0) {
          await MeetingParticipant.findOneAndUpdate(
            { meetingId: meetingIdStr, userId },
            { status: 'left', leftAt: new Date(), socketId: null }
          );
        }
      } catch (err) {
        // Ignore disconnect DB cleanup error
      }
    }
  });
}
