import { MeetingService } from './meeting.service.js';
import { ApiResponse } from '../../utils/api-response.js';

export class MeetingController {
  static async create(request, reply) {
    try {
      const userId = request.user.userId;
      const meeting = await MeetingService.createMeeting(request.body, userId);
      return ApiResponse.success(reply, 201, 'Meeting created successfully', meeting);
    } catch (err) {
      return ApiResponse.error(reply, err.statusCode || 400, err.message, err.code || 'BAD_REQUEST');
    }
  }

  static async list(request, reply) {
    try {
      const userId = request.user.userId;
      const { status, page, limit, search, date } = request.query;
      const result = await MeetingService.listMeetings({
        userId,
        status,
        page,
        limit,
        search,
        date
      });
      return ApiResponse.success(reply, 200, 'Meetings retrieved successfully', result);
    } catch (err) {
      return ApiResponse.error(reply, err.statusCode || 500, err.message, err.code || 'INTERNAL_ERROR');
    }
  }

  static async getById(request, reply) {
    try {
      const { meetingId } = request.params;
      const userId = request.user.userId;
      const meeting = await MeetingService.getMeetingDetails(meetingId, userId);
      return ApiResponse.success(reply, 200, 'Meeting retrieved successfully', meeting);
    } catch (err) {
      return ApiResponse.error(reply, err.statusCode || 404, err.message, err.code || 'MEETING_NOT_FOUND');
    }
  }

  static async update(request, reply) {
    try {
      const { meetingId } = request.params;
      const userId = request.user.userId;
      const updated = await MeetingService.updateMeeting(meetingId, userId, request.body);

      // Emit socket notification if io is available
      const io = request.server.io;
      if (io) {
        io.to(`meeting:${updated._id}`).emit('meeting:updated', { meeting: updated });
      }

      return ApiResponse.success(reply, 200, 'Meeting updated successfully', updated);
    } catch (err) {
      return ApiResponse.error(reply, err.statusCode || 400, err.message, err.code || 'BAD_REQUEST');
    }
  }

  static async cancel(request, reply) {
    try {
      const { meetingId } = request.params;
      const userId = request.user.userId;
      const cancelled = await MeetingService.cancelMeeting(meetingId, userId);

      const io = request.server.io;
      if (io) {
        io.to(`meeting:${cancelled._id}`).emit('meeting:cancelled', { meetingId: cancelled._id });
      }

      return ApiResponse.success(reply, 200, 'Meeting cancelled successfully', cancelled);
    } catch (err) {
      return ApiResponse.error(reply, err.statusCode || 400, err.message, err.code || 'BAD_REQUEST');
    }
  }

  static async delete(request, reply) {
    try {
      const { meetingId } = request.params;
      const userId = request.user.userId;
      const result = await MeetingService.deleteMeeting(meetingId, userId);
      return ApiResponse.success(reply, 200, 'Meeting deleted successfully', result);
    } catch (err) {
      return ApiResponse.error(reply, err.statusCode || 400, err.message, err.code || 'BAD_REQUEST');
    }
  }

  static async end(request, reply) {
    try {
      const { meetingId } = request.params;
      const userId = request.user.userId;
      const ended = await MeetingService.endMeeting(meetingId, userId);

      const io = request.server.io;
      if (io) {
        io.to(`meeting:${ended._id}`).emit('meeting:ended', { meetingId: ended._id });
      }

      return ApiResponse.success(reply, 200, 'Meeting ended successfully', ended);
    } catch (err) {
      return ApiResponse.error(reply, err.statusCode || 400, err.message, err.code || 'BAD_REQUEST');
    }
  }

  static async join(request, reply) {
    try {
      const { meetingId } = request.params;
      const user = request.user;
      const passcode = request.body?.passcode;
      const joinData = await MeetingService.joinMeeting(meetingId, user, passcode);
      return ApiResponse.success(reply, 200, 'Joined meeting successfully', joinData);
    } catch (err) {
      return ApiResponse.error(reply, err.statusCode || 400, err.message, err.code || 'JOIN_FAILED');
    }
  }

  static async leave(request, reply) {
    try {
      const { meetingId } = request.params;
      const userId = request.user.userId;
      const result = await MeetingService.leaveMeeting(meetingId, userId);
      return ApiResponse.success(reply, 200, 'Left meeting successfully', result);
    } catch (err) {
      return ApiResponse.error(reply, err.statusCode || 500, err.message, err.code || 'LEAVE_FAILED');
    }
  }

  static async getParticipants(request, reply) {
    try {
      const { meetingId } = request.params;
      const userId = request.user.userId;
      const participants = await MeetingService.getMeetingParticipants(meetingId, userId);
      return ApiResponse.success(reply, 200, 'Participants retrieved successfully', { participants });
    } catch (err) {
      return ApiResponse.error(reply, err.statusCode || 404, err.message, err.code || 'MEETING_NOT_FOUND');
    }
  }

  static async getHistory(request, reply) {
    try {
      const userId = request.user.userId;
      const { page, limit, search } = request.query;
      const history = await MeetingService.getMeetingHistory({ userId, page, limit, search });
      return ApiResponse.success(reply, 200, 'Meeting history retrieved successfully', history);
    } catch (err) {
      return ApiResponse.error(reply, err.statusCode || 500, err.message, err.code || 'INTERNAL_ERROR');
    }
  }

  static async getJoinInfo(request, reply) {
    try {
      const { meetingId } = request.params;
      const userId = request.user.userId;
      const joinInfo = await MeetingService.getJoinInfo(meetingId, userId);
      return ApiResponse.success(reply, 200, 'Join configuration retrieved successfully', joinInfo);
    } catch (err) {
      return ApiResponse.error(reply, err.statusCode || 404, err.message, err.code || 'MEETING_NOT_FOUND');
    }
  }

  static async getMessages(request, reply) {
    try {
      const { meetingId } = request.params;
      const userId = request.user.userId;
      const { limit, page, before } = request.query;
      const messages = await MeetingService.getMeetingMessages(meetingId, userId, {
        limit,
        page,
        before
      });
      return ApiResponse.success(reply, 200, 'Messages retrieved successfully', { messages });
    } catch (err) {
      return ApiResponse.error(reply, err.statusCode || 404, err.message, err.code || 'MEETING_NOT_FOUND');
    }
  }

  static async sendMessage(request, reply) {
    try {
      const { meetingId } = request.params;
      const userId = request.user.userId;
      const { content, clientMessageId, messageType } = request.body;
      const meeting = await MeetingService.resolveMeeting(meetingId);
      if (!meeting) {
        return ApiResponse.error(reply, 404, 'Meeting not found', 'MEETING_NOT_FOUND');
      }

      const result = await MeetingService.sendMeetingMessage({
        meetingId: meeting._id,
        senderId: userId,
        content,
        clientMessageId,
        messageType
      });

      const io = request.server.io;
      if (io) {
        io.to(`meeting:${meeting._id}`).emit('meeting:chat:new', { message: result.message });
      }

      return ApiResponse.success(reply, 201, 'Message sent successfully', result.message);
    } catch (err) {
      return ApiResponse.error(reply, err.statusCode || 400, err.message, err.code || 'BAD_REQUEST');
    }
  }

  static async editMessage(request, reply) {
    try {
      const { meetingId, messageId } = request.params;
      const userId = request.user.userId;
      const { content } = request.body;
      const updated = await MeetingService.editMeetingMessage(meetingId, messageId, userId, content);

      const io = request.server.io;
      if (io) {
        io.to(`meeting:${updated.meetingId}`).emit('meeting:chat:edited', updated);
      }

      return ApiResponse.success(reply, 200, 'Message updated successfully', updated);
    } catch (err) {
      return ApiResponse.error(reply, err.statusCode || 400, err.message, err.code || 'BAD_REQUEST');
    }
  }

  static async deleteMessage(request, reply) {
    try {
      const { meetingId, messageId } = request.params;
      const userId = request.user.userId;
      const deleted = await MeetingService.deleteMeetingMessage(meetingId, messageId, userId);

      const io = request.server.io;
      if (io) {
        io.to(`meeting:${deleted.meetingId}`).emit('meeting:chat:deleted', deleted);
      }

      return ApiResponse.success(reply, 200, 'Message deleted successfully', deleted);
    } catch (err) {
      return ApiResponse.error(reply, err.statusCode || 400, err.message, err.code || 'BAD_REQUEST');
    }
  }

  static async searchMessages(request, reply) {
    try {
      const { meetingId } = request.params;
      const userId = request.user.userId;
      const { q, limit } = request.query;
      const results = await MeetingService.searchMeetingMessages(meetingId, userId, {
        query: q,
        limit
      });
      return ApiResponse.success(reply, 200, 'Search completed successfully', { messages: results });
    } catch (err) {
      return ApiResponse.error(reply, err.statusCode || 400, err.message, err.code || 'BAD_REQUEST');
    }
  }

  static async generateInvite(request, reply) {
    try {
      const { meetingId } = request.params;
      const userId = request.user.userId;
      const invite = await MeetingService.generateInvite(meetingId, userId);
      return ApiResponse.success(reply, 200, 'Invite generated successfully', invite);
    } catch (err) {
      return ApiResponse.error(reply, err.statusCode || 404, err.message, err.code || 'MEETING_NOT_FOUND');
    }
  }

  static async getRecordings(request, reply) {
    try {
      const { meetingId } = request.params;
      const userId = request.user.userId;
      const meeting = await MeetingService.resolveMeeting(meetingId);
      if (!meeting) {
        return ApiResponse.error(reply, 404, 'Meeting not found', 'MEETING_NOT_FOUND');
      }
      // Cloud recording is documented as a future expansion in Section 3.Q
      return ApiResponse.success(reply, 200, 'Recordings retrieved successfully', {
        recordings: [],
        status: 'RECORDING_FEATURE_AVAILABLE'
      });
    } catch (err) {
      return ApiResponse.error(reply, err.statusCode || 500, err.message, err.code || 'INTERNAL_ERROR');
    }
  }

  static async getStatus(request, reply) {
    try {
      const { meetingId } = request.params;
      const meeting = await MeetingService.resolveMeeting(meetingId);
      if (!meeting) {
        return ApiResponse.error(reply, 404, 'Meeting not found', 'MEETING_NOT_FOUND');
      }
      return ApiResponse.success(reply, 200, 'Status retrieved successfully', {
        id: meeting._id,
        meetingCode: meeting.meetingCode,
        status: meeting.status,
        actualStartedAt: meeting.actualStartedAt,
        actualEndedAt: meeting.actualEndedAt
      });
    } catch (err) {
      return ApiResponse.error(reply, err.statusCode || 404, err.message, err.code || 'MEETING_NOT_FOUND');
    }
  }

  static async removeParticipant(request, reply) {
    try {
      const { meetingId, userId: targetUserId } = request.params;
      const requesterId = request.user.userId;
      const result = await MeetingService.removeParticipant(meetingId, targetUserId, requesterId);

      const io = request.server.io;
      if (io) {
        io.to(`meeting:${meetingId}`).emit('meeting:participant:removed', { userId: targetUserId });
      }

      return ApiResponse.success(reply, 200, 'Participant removed successfully', result);
    } catch (err) {
      return ApiResponse.error(reply, err.statusCode || 400, err.message, err.code || 'BAD_REQUEST');
    }
  }

  static async updateParticipantRole(request, reply) {
    try {
      const { meetingId, userId: targetUserId } = request.params;
      const requesterId = request.user.userId;
      const { role } = request.body;
      const updated = await MeetingService.updateParticipantRole(
        meetingId,
        targetUserId,
        role,
        requesterId
      );

      const io = request.server.io;
      if (io) {
        io.to(`meeting:${meetingId}`).emit('meeting:participant:role-updated', {
          userId: targetUserId,
          role
        });
      }

      return ApiResponse.success(reply, 200, 'Participant role updated successfully', updated);
    } catch (err) {
      return ApiResponse.error(reply, err.statusCode || 400, err.message, err.code || 'BAD_REQUEST');
    }
  }

  static async muteParticipant(request, reply) {
    try {
      const { meetingId, userId: targetUserId } = request.params;
      const requesterId = request.user.userId;
      const meeting = await MeetingService.resolveMeeting(meetingId);
      if (!meeting) {
        return ApiResponse.error(reply, 404, 'Meeting not found', 'MEETING_NOT_FOUND');
      }
      if (meeting.organizerId._id.toString() !== requesterId.toString()) {
        return ApiResponse.error(reply, 403, 'Only the host can mute participants', 'FORBIDDEN');
      }

      const io = request.server.io;
      if (io) {
        io.to(`meeting:${meeting._id}`).emit('meeting:participant:muted', { userId: targetUserId });
      }

      return ApiResponse.success(reply, 200, 'Participant muted successfully', { success: true });
    } catch (err) {
      return ApiResponse.error(reply, err.statusCode || 400, err.message, err.code || 'BAD_REQUEST');
    }
  }

  static async getUpcoming(request, reply) {
    try {
      const userId = request.user.userId;
      const { page, limit, search } = request.query || {};
      const result = await MeetingService.getUpcomingMeetings({ userId, page, limit, search });
      return ApiResponse.success(reply, 200, 'Upcoming meetings retrieved successfully', result);
    } catch (err) {
      return ApiResponse.error(reply, err.statusCode || 500, err.message, err.code || 'INTERNAL_ERROR');
    }
  }

  static async getPast(request, reply) {
    try {
      const userId = request.user.userId;
      const { page, limit, search } = request.query || {};
      const result = await MeetingService.getPastMeetings({ userId, page, limit, search });
      return ApiResponse.success(reply, 200, 'Past meetings retrieved successfully', result);
    } catch (err) {
      return ApiResponse.error(reply, err.statusCode || 500, err.message, err.code || 'INTERNAL_ERROR');
    }
  }

  static async getUserInvitations(request, reply) {
    try {
      const userId = request.user.userId;
      const { status } = request.query || {};
      const result = await MeetingService.getUserInvitations(userId, status);
      return ApiResponse.success(reply, 200, 'User invitations retrieved successfully', result);
    } catch (err) {
      return ApiResponse.error(reply, err.statusCode || 500, err.message, err.code || 'INTERNAL_ERROR');
    }
  }

  static async getMeetingInvitations(request, reply) {
    try {
      const { meetingId } = request.params;
      const userId = request.user.userId;
      const result = await MeetingService.getMeetingInvitations(meetingId, userId);
      return ApiResponse.success(reply, 200, 'Meeting invitations retrieved successfully', result);
    } catch (err) {
      return ApiResponse.error(reply, err.statusCode || 400, err.message, err.code || 'BAD_REQUEST');
    }
  }

  static async acceptInvitation(request, reply) {
    try {
      const { meetingId } = request.params;
      const userId = request.user.userId;
      const result = await MeetingService.respondToInvitation({ meetingId, userId, action: 'accept' });
      return ApiResponse.success(reply, 200, 'Invitation accepted successfully', result);
    } catch (err) {
      return ApiResponse.error(reply, err.statusCode || 400, err.message, err.code || 'BAD_REQUEST');
    }
  }

  static async declineInvitation(request, reply) {
    try {
      const { meetingId } = request.params;
      const userId = request.user.userId;
      const result = await MeetingService.respondToInvitation({ meetingId, userId, action: 'decline' });
      return ApiResponse.success(reply, 200, 'Invitation declined successfully', result);
    } catch (err) {
      return ApiResponse.error(reply, err.statusCode || 400, err.message, err.code || 'BAD_REQUEST');
    }
  }

  static async resendInvitation(request, reply) {
    try {
      const { meetingId, invitationId } = request.params;
      const userId = request.user.userId;
      const result = await MeetingService.resendInvitation({ meetingId, invitationId, hostUserId: userId });
      return ApiResponse.success(reply, 200, 'Invitation resent successfully', result);
    } catch (err) {
      return ApiResponse.error(reply, err.statusCode || 400, err.message, err.code || 'BAD_REQUEST');
    }
  }
}
