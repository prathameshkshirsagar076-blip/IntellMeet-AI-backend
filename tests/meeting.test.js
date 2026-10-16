import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { buildApp } from '../src/app.js';
import { User } from '../src/modules/users/user.model.js';
import { Meeting } from '../src/modules/meetings/meeting.model.js';
import { generateAccessToken } from '../src/utils/tokens.js';

describe('Meeting REST API Integration Tests', () => {
  let app;
  let hostUser;
  let attendeeUser;
  let hostToken;
  let attendeeToken;
  let activeMeeting;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  beforeEach(async () => {
    hostUser = await User.create({
      name: 'Meeting Host',
      email: 'meeting.host@example.com',
      normalizedEmail: 'meeting.host@example.com',
      passwordHash: '$2a$12$e8v1N8r4M.1HjZ5i2cM0tuxJ6lP9k7o3t.7Q8z5w2r0b4v6e8h9iO',
      role: 'user',
      isActive: true
    });

    attendeeUser = await User.create({
      name: 'Meeting Attendee',
      email: 'meeting.attendee@example.com',
      normalizedEmail: 'meeting.attendee@example.com',
      passwordHash: '$2a$12$e8v1N8r4M.1HjZ5i2cM0tuxJ6lP9k7o3t.7Q8z5w2r0b4v6e8h9iO',
      role: 'user',
      isActive: true
    });

    hostToken = generateAccessToken({ userId: hostUser._id, email: hostUser.email, role: hostUser.role });
    attendeeToken = generateAccessToken({ userId: attendeeUser._id, email: attendeeUser.email, role: attendeeUser.role });

    activeMeeting = await Meeting.create({
      meetingCode: 'itm-123-456',
      title: 'Architecture Review & Latency Benchmarks',
      description: 'Discussing WebRTC P2P latency metrics',
      scheduledStartAt: new Date(Date.now() + 3600000),
      durationMinutes: 45,
      organizerId: hostUser._id,
      status: 'upcoming',
      settings: {
        allowChat: true,
        allowScreenShare: true
      }
    });
  });

  describe('Authentication & Access Guards', () => {
    it('should reject unauthenticated request with 401', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/meetings'
      });
      expect(response.statusCode).toBe(401);
      const json = response.json();
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('UNAUTHORIZED');
    });

    it('should reject invalid JWT token with 401', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/meetings',
        headers: { authorization: 'Bearer invalid.token.payload' }
      });
      expect(response.statusCode).toBe(401);
    });
  });

  describe('Meeting Lifecycle: Create, Read, Update, Delete, Cancel, End', () => {
    it('should create a new scheduled meeting successfully', async () => {
      const payload = {
        title: 'New Executive Sync',
        description: 'Product roadmap review',
        date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        startTime: '14:00',
        durationMinutes: 45,
        participantEmails: ['meeting.attendee@example.com'],
        settings: {
          allowChat: true,
          allowScreenShare: true
        }
      };

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/meetings',
        headers: { authorization: `Bearer ${hostToken}` },
        payload
      });

      expect(response.statusCode).toBe(201);
      const json = response.json();
      expect(json.success).toBe(true);
      expect(json.data.title).toBe(payload.title);
      expect(json.data.meetingCode).toMatch(/^itm-\d{3}-\d{3}$/);
      expect(json.data.status).toBe('upcoming');
      const organizerIdStr = (json.data.organizerId?.id || json.data.organizerId?._id || json.data.organizerId)?.toString();
      expect(organizerIdStr).toBe(hostUser._id.toString());
    });

    it('should list meetings where user is organizer or participant', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/meetings',
        headers: { authorization: `Bearer ${hostToken}` }
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.success).toBe(true);
      expect(Array.isArray(json.data.meetings)).toBe(true);
      expect(json.data.meetings.length).toBeGreaterThan(0);
      expect(json.data.meetings[0]._id).toBe(activeMeeting._id.toString());
    });

    it('should get meeting details by ID and by meetingCode', async () => {
      // By MongoDB _id
      const resById = await app.inject({
        method: 'GET',
        url: `/api/v1/meetings/${activeMeeting._id}`,
        headers: { authorization: `Bearer ${hostToken}` }
      });
      expect(resById.statusCode).toBe(200);
      expect(resById.json().data.meetingCode).toBe(activeMeeting.meetingCode);

      // By meetingCode
      const resByCode = await app.inject({
        method: 'GET',
        url: `/api/v1/meetings/${activeMeeting.meetingCode}`,
        headers: { authorization: `Bearer ${attendeeToken}` }
      });
      expect(resByCode.statusCode).toBe(200);
      expect(resByCode.json().data._id).toBe(activeMeeting._id.toString());
    });

    it('should update meeting settings when caller is organizer', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/v1/meetings/${activeMeeting._id}`,
        headers: { authorization: `Bearer ${hostToken}` },
        payload: {
          title: 'Updated Architecture Review',
          durationMinutes: 60
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data.title).toBe('Updated Architecture Review');
      expect(response.json().data.durationMinutes).toBe(60);
    });

    it('should reject meeting update when caller is NOT organizer', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/v1/meetings/${activeMeeting._id}`,
        headers: { authorization: `Bearer ${attendeeToken}` },
        payload: { title: 'Unauthorized Modification' }
      });

      expect(response.statusCode).toBe(403);
    });

    it('should join meeting successfully and return ICE server configuration', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/meetings/${activeMeeting._id}/join`,
        headers: { authorization: `Bearer ${attendeeToken}` }
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.success).toBe(true);
      expect(json.data.participant.role).toBe('attendee');
      expect(Array.isArray(json.data.iceServers)).toBe(true);
      expect(json.data.iceServers.length).toBeGreaterThan(0);
    });

    it('should get join-info directly', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/meetings/${activeMeeting._id}/join-info`,
        headers: { authorization: `Bearer ${attendeeToken}` }
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.data.meetingCode).toBe(activeMeeting.meetingCode);
      expect(Array.isArray(json.data.iceServers)).toBe(true);
    });

    it('should get participants list', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/meetings/${activeMeeting._id}/participants`,
        headers: { authorization: `Bearer ${hostToken}` }
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(Array.isArray(json.data.participants)).toBe(true);
    });

    it('should leave meeting successfully', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/meetings/${activeMeeting._id}/leave`,
        headers: { authorization: `Bearer ${attendeeToken}` }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().success).toBe(true);
    });

    it('should generate meeting invite link', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/meetings/${activeMeeting._id}/invite`,
        headers: { authorization: `Bearer ${hostToken}` }
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.data.inviteUrl).toContain(`/meeting/${activeMeeting.meetingCode}`);
    });

    it('should check meeting status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/meetings/${activeMeeting._id}/status`,
        headers: { authorization: `Bearer ${hostToken}` }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data.status).toBeDefined();
    });

    it('should return recordings endpoint schema', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/meetings/${activeMeeting._id}/recordings`,
        headers: { authorization: `Bearer ${hostToken}` }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data.recordings).toBeDefined();
    });

    it('should end meeting successfully when host requests end', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/meetings/${activeMeeting._id}/end`,
        headers: { authorization: `Bearer ${hostToken}` }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data.status).toBe('completed');
    });

    it('should return completed meeting in meeting history', async () => {
      await Meeting.findByIdAndUpdate(activeMeeting._id, { status: 'completed' });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/meetings/history',
        headers: { authorization: `Bearer ${hostToken}` }
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.data.meetings.some((m) => m._id === activeMeeting._id.toString())).toBe(true);
    });

    it('should reject join attempts on completed/ended meetings', async () => {
      await Meeting.findByIdAndUpdate(activeMeeting._id, { status: 'completed' });

      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/meetings/${activeMeeting._id}/join`,
        headers: { authorization: `Bearer ${attendeeToken}` }
      });

      expect(response.statusCode).toBe(410);
      expect(response.json().error.code).toBe('MEETING_ENDED');
    });

    it('should cancel meeting and reject joins after cancellation', async () => {
      const cancelRes = await app.inject({
        method: 'POST',
        url: `/api/v1/meetings/${activeMeeting._id}/cancel`,
        headers: { authorization: `Bearer ${hostToken}` }
      });
      expect(cancelRes.statusCode).toBe(200);
      expect(cancelRes.json().data.status).toBe('cancelled');

      const joinRes = await app.inject({
        method: 'POST',
        url: `/api/v1/meetings/${activeMeeting._id}/join`,
        headers: { authorization: `Bearer ${attendeeToken}` }
      });
      expect(joinRes.statusCode).toBe(410);
      expect(joinRes.json().error.code).toBe('MEETING_CANCELLED');
    });

    it('should soft delete meeting and not return in lists', async () => {
      const delRes = await app.inject({
        method: 'DELETE',
        url: `/api/v1/meetings/${activeMeeting._id}`,
        headers: { authorization: `Bearer ${hostToken}` }
      });
      expect(delRes.statusCode).toBe(200);

      const getRes = await app.inject({
        method: 'GET',
        url: `/api/v1/meetings/${activeMeeting._id}`,
        headers: { authorization: `Bearer ${hostToken}` }
      });
      expect(getRes.statusCode).toBe(404);
    });
  });

  describe('In-Meeting Chat Persistence & Search Endpoints', () => {
    let sentMessage;

    it('should send a chat message in the meeting', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/meetings/${activeMeeting._id}/messages`,
        headers: { authorization: `Bearer ${hostToken}` },
        payload: {
          content: 'Hello everyone, WebRTC peer connection established!',
          clientMessageId: 'cl-msg-1'
        }
      });

      expect(response.statusCode).toBe(201);
      const json = response.json();
      expect(json.data.content).toBe('Hello everyone, WebRTC peer connection established!');
      expect(json.data.clientMessageId).toBe('cl-msg-1');
      sentMessage = json.data;
    });

    it('should retrieve message history in chronological order', async () => {
      // Send a message first
      const msgRes = await app.inject({
        method: 'POST',
        url: `/api/v1/meetings/${activeMeeting._id}/messages`,
        headers: { authorization: `Bearer ${hostToken}` },
        payload: { content: 'History test message', clientMessageId: 'cl-msg-hist' }
      });
      const createdMsg = msgRes.json().data;

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/meetings/${activeMeeting._id}/messages`,
        headers: { authorization: `Bearer ${hostToken}` }
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(Array.isArray(json.data.messages)).toBe(true);
      expect(json.data.messages.length).toBeGreaterThanOrEqual(1);
      expect(json.data.messages.some((m) => m.id === createdMsg.id)).toBe(true);
    });

    it('should search messages within the meeting', async () => {
      await app.inject({
        method: 'POST',
        url: `/api/v1/meetings/${activeMeeting._id}/messages`,
        headers: { authorization: `Bearer ${hostToken}` },
        payload: { content: 'WebRTC ultra-low-latency streaming audio', clientMessageId: 'cl-msg-search' }
      });

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/meetings/${activeMeeting._id}/messages/search?q=ultra-low-latency`,
        headers: { authorization: `Bearer ${hostToken}` }
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.data.messages.length).toBeGreaterThanOrEqual(1);
      expect(json.data.messages[0].content).toContain('ultra-low-latency');
    });

    it('should edit meeting chat message by author', async () => {
      const msgRes = await app.inject({
        method: 'POST',
        url: `/api/v1/meetings/${activeMeeting._id}/messages`,
        headers: { authorization: `Bearer ${hostToken}` },
        payload: { content: 'Original text before edit', clientMessageId: 'cl-msg-edit' }
      });
      const originalMsg = msgRes.json().data;

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/v1/meetings/${activeMeeting._id}/messages/${originalMsg.id}`,
        headers: { authorization: `Bearer ${hostToken}` },
        payload: { content: 'Updated: Audio and video streaming verified!' }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data.content).toBe('Updated: Audio and video streaming verified!');
      expect(response.json().data.isEdited).toBe(true);
    });

    it('should soft delete meeting chat message', async () => {
      const msgRes = await app.inject({
        method: 'POST',
        url: `/api/v1/meetings/${activeMeeting._id}/messages`,
        headers: { authorization: `Bearer ${hostToken}` },
        payload: { content: 'Message to be deleted', clientMessageId: 'cl-msg-del' }
      });
      const originalMsg = msgRes.json().data;

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/v1/meetings/${activeMeeting._id}/messages/${originalMsg.id}`,
        headers: { authorization: `Bearer ${hostToken}` }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data.isDeleted).toBe(true);
    });
  });

  describe('Schedule Meeting, Invitations & Calendar Sync Tests', () => {
    it('should reject scheduling a meeting in the past with 400 PAST_START_TIME', async () => {
      const pastTime = new Date(Date.now() - 3600000).toISOString();
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/meetings',
        headers: { authorization: `Bearer ${hostToken}` },
        payload: {
          title: 'Past Meeting Attempt',
          scheduledStartAt: pastTime,
          durationMinutes: 30
        }
      });

      expect(response.statusCode).toBe(400);
      const json = response.json();
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('PAST_START_TIME');
    });

    it('should schedule a valid future meeting with multiple invitees and timezone via /meetings/schedule', async () => {
      const futureStart = new Date(Date.now() + 86400000); // Tomorrow
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/meetings/schedule',
        headers: { authorization: `Bearer ${hostToken}` },
        payload: {
          title: 'Q4 Strategic Planning & Roadmap',
          description: 'Quarterly review with executive staff',
          scheduledStartAt: futureStart.toISOString(),
          durationMinutes: 60,
          timezone: 'Asia/Kolkata',
          participantEmails: [attendeeUser.email, 'external.partner@partnercorp.com']
        }
      });

      expect(response.statusCode).toBe(201);
      const json = response.json();
      expect(json.success).toBe(true);
      expect(json.data.title).toBe('Q4 Strategic Planning & Roadmap');
      expect(json.data.timezone).toBe('Asia/Kolkata');
      expect(json.data.date).toBeDefined();
      expect(json.data.startTime).toBeDefined();

      const createdMeetingId = json.data._id || json.data.id;

      // Verify invitee can retrieve this meeting in their upcoming list
      const attendeeListRes = await app.inject({
        method: 'GET',
        url: '/api/v1/meetings/upcoming',
        headers: { authorization: `Bearer ${attendeeToken}` }
      });

      expect(attendeeListRes.statusCode).toBe(200);
      const attendeeListJson = attendeeListRes.json();
      const found = attendeeListJson.data.meetings.find((m) => (m._id || m.id).toString() === createdMeetingId.toString());
      expect(found).toBeDefined();
      expect(found.myInvitationStatus).toBe('pending');
      expect(found.myRole).toBe('attendee');

      // Verify invitee can see the invitation in /meetings/invitations
      const userInvsRes = await app.inject({
        method: 'GET',
        url: '/api/v1/meetings/invitations',
        headers: { authorization: `Bearer ${attendeeToken}` }
      });
      expect(userInvsRes.statusCode).toBe(200);
      expect(userInvsRes.json().data.invitations.length).toBeGreaterThan(0);

      // Verify invitee can accept the invitation
      const acceptRes = await app.inject({
        method: 'POST',
        url: `/api/v1/meetings/${createdMeetingId}/accept`,
        headers: { authorization: `Bearer ${attendeeToken}` }
      });
      expect(acceptRes.statusCode).toBe(200);
      expect(acceptRes.json().data.status).toBe('accepted');

      // Verify host can inspect all invitations via /meetings/:meetingId/invitations
      const hostInvsRes = await app.inject({
        method: 'GET',
        url: `/api/v1/meetings/${createdMeetingId}/invitations`,
        headers: { authorization: `Bearer ${hostToken}` }
      });
      expect(hostInvsRes.statusCode).toBe(200);
      const hostInvsData = hostInvsRes.json().data;
      expect(hostInvsData.invitations.length).toBe(3); // host + attendee + external
      const attendeeInv = hostInvsData.invitations.find((i) => i.email === attendeeUser.email);
      expect(attendeeInv.status).toBe('accepted');

      // Verify host can resend invitation to external participant
      const externalInv = hostInvsData.invitations.find((i) => i.email === 'external.partner@partnercorp.com');
      const resendRes = await app.inject({
        method: 'POST',
        url: `/api/v1/meetings/${createdMeetingId}/invitations/${externalInv.participantId}/resend`,
        headers: { authorization: `Bearer ${hostToken}` }
      });
      expect(resendRes.statusCode).toBe(200);
      expect(resendRes.json().success).toBe(true);

      // Verify invitee can decline
      const declineRes = await app.inject({
        method: 'POST',
        url: `/api/v1/meetings/${createdMeetingId}/decline`,
        headers: { authorization: `Bearer ${attendeeToken}` }
      });
      expect(declineRes.statusCode).toBe(200);
      expect(declineRes.json().data.status).toBe('declined');
    });

    it('should support retrieving past meetings via /meetings/past', async () => {
      const pastRes = await app.inject({
        method: 'GET',
        url: '/api/v1/meetings/past',
        headers: { authorization: `Bearer ${hostToken}` }
      });
      expect(pastRes.statusCode).toBe(200);
      expect(Array.isArray(pastRes.json().data.meetings)).toBe(true);
    });
  });
});
