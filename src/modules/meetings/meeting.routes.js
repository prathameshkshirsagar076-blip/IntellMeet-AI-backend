import { MeetingController } from './meeting.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import {
  createMeetingSchema,
  listMeetingsSchema,
  meetingIdParamSchema,
  updateMeetingSchema,
  joinMeetingSchema,
  sendMessageSchema,
  editMessageSchema,
  searchMessagesSchema
} from './meeting.schema.js';

export async function meetingRoutes(fastify) {
  // All meeting endpoints require JWT authentication
  fastify.addHook('preHandler', authenticate);

  // 1. Create meeting
  fastify.post('/meetings', { schema: createMeetingSchema }, MeetingController.create);

  // 2. List meetings
  fastify.get('/meetings', { schema: listMeetingsSchema }, MeetingController.list);

  // 3. Meeting History (must be before /meetings/:meetingId)
  fastify.get('/meetings/history', MeetingController.getHistory);

  // 4. Get meeting details
  fastify.get('/meetings/:meetingId', { schema: meetingIdParamSchema }, MeetingController.getById);

  // 5. Update meeting
  fastify.patch('/meetings/:meetingId', { schema: updateMeetingSchema }, MeetingController.update);

  // 6. Delete meeting (soft delete)
  fastify.delete('/meetings/:meetingId', { schema: meetingIdParamSchema }, MeetingController.delete);

  // 7. Cancel meeting
  fastify.post('/meetings/:meetingId/cancel', { schema: meetingIdParamSchema }, MeetingController.cancel);

  // 8. End meeting for all
  fastify.post('/meetings/:meetingId/end', { schema: meetingIdParamSchema }, MeetingController.end);

  // 9. Join meeting
  fastify.post('/meetings/:meetingId/join', { schema: joinMeetingSchema }, MeetingController.join);

  // 10. Leave meeting
  fastify.post('/meetings/:meetingId/leave', { schema: meetingIdParamSchema }, MeetingController.leave);

  // 11. Get join info (ICE servers / credentials)
  fastify.get('/meetings/:meetingId/join-info', { schema: meetingIdParamSchema }, MeetingController.getJoinInfo);

  // 12. Get meeting participants
  fastify.get('/meetings/:meetingId/participants', { schema: meetingIdParamSchema }, MeetingController.getParticipants);

  // 13. Participant moderation: remove, update role, mute
  fastify.post('/meetings/:meetingId/participants/:userId/remove', MeetingController.removeParticipant);
  fastify.patch('/meetings/:meetingId/participants/:userId/role', MeetingController.updateParticipantRole);
  fastify.post('/meetings/:meetingId/participants/:userId/mute', MeetingController.muteParticipant);

  // 14. Meeting Chat
  fastify.get('/meetings/:meetingId/messages', { schema: meetingIdParamSchema }, MeetingController.getMessages);
  fastify.post('/meetings/:meetingId/messages', { schema: sendMessageSchema }, MeetingController.sendMessage);
  fastify.get('/meetings/:meetingId/messages/search', { schema: searchMessagesSchema }, MeetingController.searchMessages);
  fastify.patch('/meetings/:meetingId/messages/:messageId', { schema: editMessageSchema }, MeetingController.editMessage);
  fastify.delete('/meetings/:meetingId/messages/:messageId', MeetingController.deleteMessage);

  // 15. Meeting Invite
  fastify.post('/meetings/:meetingId/invite', { schema: meetingIdParamSchema }, MeetingController.generateInvite);

  // 16. Meeting Recordings
  fastify.get('/meetings/:meetingId/recordings', { schema: meetingIdParamSchema }, MeetingController.getRecordings);

  // 17. Meeting Status
  fastify.get('/meetings/:meetingId/status', { schema: meetingIdParamSchema }, MeetingController.getStatus);
}
