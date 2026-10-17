import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { User } from '../src/modules/users/user.model.js';
import { Meeting } from '../src/modules/meetings/meeting.model.js';
import { MeetingParticipant } from '../src/modules/meetings/participant.model.js';
import { MeetingMessage } from '../src/modules/meetings/meeting-message.model.js';
import { AiConversation } from '../src/modules/ai/models/ai-conversation.model.js';
import { AiMessage } from '../src/modules/ai/models/ai-message.model.js';
import { AiMeetingSummary } from '../src/modules/ai/models/ai-meeting-summary.model.js';
import { AiMeetingNote } from '../src/modules/ai/models/ai-meeting-note.model.js';
import { AiActionItem } from '../src/modules/ai/models/ai-action-item.model.js';
import { generateAccessToken } from '../src/utils/tokens.js';
import { env } from '../src/config/env.js';
import { OpenAiService } from '../src/modules/ai/openai.service.js';

describe('AI Assistance Module — Integration & Security Tests', () => {
  let app;
  let hostUser;
  let attendeeUser;
  let outsideUser;
  let hostToken;
  let attendeeToken;
  let outsideToken;
  let testMeeting;

  let originalAiProvider;
  beforeAll(async () => {
    originalAiProvider = env.AI_PROVIDER;
    env.AI_PROVIDER = 'openai';
    app = await buildApp();
  });

  afterAll(async () => {
    env.AI_PROVIDER = originalAiProvider;
    if (app) await app.close();
  });

  beforeEach(async () => {
    // Reset collections
    await User.deleteMany({ email: /.*ai.*@example\.com/i });
    await Meeting.deleteMany({});
    await MeetingParticipant.deleteMany({});
    await MeetingMessage.deleteMany({});
    await AiConversation.deleteMany({});
    await AiMessage.deleteMany({});
    await AiMeetingSummary.deleteMany({});
    await AiMeetingNote.deleteMany({});
    await AiActionItem.deleteMany({});

    hostUser = await User.create({
      name: 'Dr. Host Organizer',
      email: 'test.ai.host@example.com',
      normalizedEmail: 'test.ai.host@example.com',
      passwordHash: '$2a$12$e8v1N8r4M.1HjZ5i2cM0tuxJ6lP9k7o3t.7Q8z5w2r0b4v6e8h9iO',
      role: 'user',
      isActive: true
    });

    attendeeUser = await User.create({
      name: 'Attendee Engineer',
      email: 'test.ai.attendee@example.com',
      normalizedEmail: 'test.ai.attendee@example.com',
      passwordHash: '$2a$12$e8v1N8r4M.1HjZ5i2cM0tuxJ6lP9k7o3t.7Q8z5w2r0b4v6e8h9iO',
      role: 'user',
      isActive: true
    });

    outsideUser = await User.create({
      name: 'Uninvited User',
      email: 'test.ai.outside@example.com',
      normalizedEmail: 'test.ai.outside@example.com',
      passwordHash: '$2a$12$e8v1N8r4M.1HjZ5i2cM0tuxJ6lP9k7o3t.7Q8z5w2r0b4v6e8h9iO',
      role: 'user',
      isActive: true
    });

    hostToken = generateAccessToken({ userId: hostUser._id, email: hostUser.email, role: hostUser.role });
    attendeeToken = generateAccessToken({ userId: attendeeUser._id, email: attendeeUser.email, role: attendeeUser.role });
    outsideToken = generateAccessToken({ userId: outsideUser._id, email: outsideUser.email, role: outsideUser.role });

    testMeeting = await Meeting.create({
      title: 'Q4 Product Roadmap & Architecture Sync',
      meetingCode: 'itm-999-ai1',
      organizerId: hostUser._id,
      status: 'completed',
      scheduledStartAt: new Date(Date.now() - 3600000),
      durationMinutes: 45
    });

    await MeetingParticipant.create({
      meetingId: testMeeting._id,
      userId: attendeeUser._id,
      email: attendeeUser.email,
      name: attendeeUser.name,
      role: 'attendee',
      status: 'joined'
    });
  });

  describe('1. Configuration & Authentication Security', () => {
    it('should reject unauthenticated requests to AI endpoints with 401', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/ai/chat',
        payload: { message: 'Hello' }
      });

      expect(res.statusCode).toBe(401);
      const body = JSON.parse(res.payload);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('should return 501 when OPENAI_API_KEY is not configured or placeholder', async () => {
      const originalKey = env.OPENAI.API_KEY;
      try {
        env.OPENAI.API_KEY = '';

        const res = await app.inject({
          method: 'POST',
          url: '/api/v1/ai/chat',
          headers: { authorization: `Bearer ${hostToken}` },
          payload: { message: 'Summarize our progress', provider: 'openai' }
        });

        expect(res.statusCode).toBe(501);
        const body = JSON.parse(res.payload);
        expect(body.success).toBe(false);
        expect(body.error.code).toBe('OPENAI_NOT_CONFIGURED');
        expect(body.message).toContain('OpenAI API key is not configured');
      } finally {
        env.OPENAI.API_KEY = originalKey;
      }
    });

    it('should return 501 when GEMINI_API_KEY is not configured or placeholder', async () => {
      const originalKey = env.GEMINI.API_KEY;
      try {
        env.GEMINI.API_KEY = '';

        const res = await app.inject({
          method: 'POST',
          url: '/api/v1/ai/chat',
          headers: { authorization: `Bearer ${hostToken}` },
          payload: { message: 'Summarize our progress', provider: 'gemini' }
        });

        expect(res.statusCode).toBe(501);
        const body = JSON.parse(res.payload);
        expect(body.success).toBe(false);
        expect(body.error.code).toBe('GEMINI_NOT_CONFIGURED');
        expect(body.message).toContain('Google Gemini API key is not configured');
      } finally {
        env.GEMINI.API_KEY = originalKey;
      }
    });
  });

  describe('2. AI Chatbot API with History & Grounding', () => {
    it('should process chat prompt and return AI answer, creating a new conversation', async () => {
      const mockChatCompletion = vi.spyOn(OpenAiService, 'chatCompletion').mockResolvedValueOnce({
        content: 'IntellMeet provides end-to-end encryption for video conferencing.',
        tokensUsed: 42,
        model: 'gpt-4o-mini',
        finishReason: 'stop'
      });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/ai/chat',
        headers: { authorization: `Bearer ${hostToken}` },
        payload: {
          message: 'What security standards does IntellMeet support?'
        }
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.success).toBe(true);
      expect(body.data.answer).toBe('IntellMeet provides end-to-end encryption for video conferencing.');
      expect(body.data.conversation).toBeDefined();
      expect(body.data.conversation.userId).toBe(hostUser._id.toString());
      expect(body.data.userMessage.content).toBe('What security standards does IntellMeet support?');
      expect(body.data.assistantMessage.content).toBe('IntellMeet provides end-to-end encryption for video conferencing.');

      mockChatCompletion.mockRestore();
    });

    it('should maintain multi-turn conversation history across consecutive messages', async () => {
      const conv = await AiConversation.create({
        userId: hostUser._id,
        title: 'Roadmap planning'
      });

      await AiMessage.create({
        conversationId: conv._id,
        userId: hostUser._id,
        role: 'user',
        content: 'We need to launch v2 by next month.'
      });

      await AiMessage.create({
        conversationId: conv._id,
        userId: hostUser._id,
        role: 'assistant',
        content: 'Understood. What are the key blockers for v2?'
      });

      const mockChatCompletion = vi.spyOn(OpenAiService, 'chatCompletion').mockImplementation(async ({ messages }) => {
        expect(messages.length).toBe(3); // 2 previous + 1 new user message
        expect(messages[0].content).toBe('We need to launch v2 by next month.');
        expect(messages[2].content).toBe('The main blocker is mobile WebRTC audio.');
        return {
          content: 'I recommend prioritizing WebRTC jitter buffer optimizations.',
          tokensUsed: 65,
          model: 'gpt-4o-mini',
          finishReason: 'stop'
        };
      });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/ai/chat',
        headers: { authorization: `Bearer ${hostToken}` },
        payload: {
          conversationId: conv._id.toString(),
          message: 'The main blocker is mobile WebRTC audio.'
        }
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data.answer).toContain('WebRTC jitter buffer');

      const messagesInDb = await AiMessage.find({ conversationId: conv._id });
      expect(messagesInDb.length).toBe(4);

      mockChatCompletion.mockRestore();
    });

    it('should ground answers using meeting transcript when contextMeetingId is provided', async () => {
      await MeetingMessage.create({
        meetingId: testMeeting._id,
        senderId: hostUser._id,
        content: 'We decided on PostgreSQL for relational telemetry.'
      });

      const mockChatCompletion = vi.spyOn(OpenAiService, 'chatCompletion').mockImplementation(async ({ systemPrompt }) => {
        expect(systemPrompt).toContain('GROUNDED MEETING CONTEXT');
        expect(systemPrompt).toContain(testMeeting.title);
        expect(systemPrompt).toContain('PostgreSQL for relational telemetry');
        return {
          content: 'According to the meeting transcript, the team decided on PostgreSQL for relational telemetry.',
          tokensUsed: 80,
          model: 'gpt-4o-mini'
        };
      });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/ai/chat',
        headers: { authorization: `Bearer ${hostToken}` },
        payload: {
          message: 'What database did we decide on?',
          contextMeetingId: testMeeting._id.toString()
        }
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data.citations.length).toBeGreaterThan(0);
      expect(body.data.citations[0].title).toBe(testMeeting.title);

      mockChatCompletion.mockRestore();
    });

    it('should list, update, and delete conversations cleanly', async () => {
      const conv1 = await AiConversation.create({ userId: hostUser._id, title: 'Chat 1' });
      const conv2 = await AiConversation.create({ userId: hostUser._id, title: 'Chat 2' });

      // List
      const listRes = await app.inject({
        method: 'GET',
        url: '/api/v1/ai/conversations',
        headers: { authorization: `Bearer ${hostToken}` }
      });
      expect(listRes.statusCode).toBe(200);
      const listBody = JSON.parse(listRes.payload);
      expect(listBody.data.length).toBe(2);

      // Update
      const patchRes = await app.inject({
        method: 'PATCH',
        url: `/api/v1/ai/conversations/${conv1._id}`,
        headers: { authorization: `Bearer ${hostToken}` },
        payload: { title: 'Renamed Chat 1', isPinned: true }
      });
      expect(patchRes.statusCode).toBe(200);
      const patchedBody = JSON.parse(patchRes.payload);
      expect(patchedBody.data.title).toBe('Renamed Chat 1');
      expect(patchedBody.data.isPinned).toBe(true);

      // Delete
      const deleteRes = await app.inject({
        method: 'DELETE',
        url: `/api/v1/ai/conversations/${conv2._id}`,
        headers: { authorization: `Bearer ${hostToken}` }
      });
      expect(deleteRes.statusCode).toBe(200);

      const remaining = await AiConversation.find({ userId: hostUser._id });
      expect(remaining.length).toBe(1);
    });
  });

  describe('3. AI Meeting Summaries', () => {
    it('should reject summary generation when meeting transcript is missing (400 NO_TRANSCRIPT_AVAILABLE)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/ai/meetings/${testMeeting._id}/summary`,
        headers: { authorization: `Bearer ${hostToken}` },
        payload: {}
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.payload);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('NO_TRANSCRIPT_AVAILABLE');
      expect(body.message).toContain('Meeting transcript or discussion content is required');
    });

    it('should reject summary generation for uninvited users (403 FORBIDDEN)', async () => {
      await MeetingMessage.create({
        meetingId: testMeeting._id,
        senderId: hostUser._id,
        content: 'Discussion message'
      });

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/ai/meetings/${testMeeting._id}/summary`,
        headers: { authorization: `Bearer ${outsideToken}` },
        payload: {}
      });

      expect(res.statusCode).toBe(403);
      const body = JSON.parse(res.payload);
      expect(body.error.code).toBe('FORBIDDEN');
    });

    it('should generate and persist real meeting summary when transcript is present', async () => {
      await MeetingMessage.create({
        meetingId: testMeeting._id,
        senderId: hostUser._id,
        content: 'Welcome everyone. We need to finalize the deployment strategy today.'
      });
      await MeetingMessage.create({
        meetingId: testMeeting._id,
        senderId: attendeeUser._id,
        content: 'We agreed to freeze branch QA by Thursday and perform load testing on Friday.'
      });

      const mockSummary = vi.spyOn(OpenAiService, 'generateMeetingSummary').mockResolvedValueOnce({
        overview: 'The team finalized Q4 product deployment dates and freeze schedules.',
        keyPoints: ['Branch QA freeze scheduled for Thursday', 'Load testing set for Friday'],
        decisions: ['Approved Thursday code freeze'],
        keyTakeaways: ['All teams aligned on Friday staging rollout'],
        outstandingIssues: ['Monitor memory usage under 100 concurrent streams'],
        followUpRecommendations: ['Review Grafana metrics after load test'],
        sentiment: 'Action-Oriented',
        model: 'gpt-4o-mini'
      });

      const mockActionItems = vi.spyOn(OpenAiService, 'extractActionItems').mockResolvedValueOnce([
        {
          task: 'Perform load testing on Friday',
          description: 'Simulate 100 concurrent WebRTC streams',
          assignee: attendeeUser.name,
          dueDate: 'Friday',
          priority: 'high',
          status: 'pending',
          completed: false
        }
      ]);

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/ai/meetings/${testMeeting._id}/summary`,
        headers: { authorization: `Bearer ${hostToken}` },
        payload: {}
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.success).toBe(true);
      expect(body.data.overview).toContain('finalized Q4 product deployment');
      expect(body.data.decisions).toContain('Approved Thursday code freeze');
      expect(body.data.sentiment).toBe('Action-Oriented');

      // Verify GET /api/v1/ai/meetings/:meetingId/summary returns it with actionItems
      const getRes = await app.inject({
        method: 'GET',
        url: `/api/v1/ai/meetings/${testMeeting._id}/summary`,
        headers: { authorization: `Bearer ${attendeeToken}` }
      });
      expect(getRes.statusCode).toBe(200);
      const getBody = JSON.parse(getRes.payload);
      expect(getBody.data.overview).toBe(body.data.overview);
      expect(getBody.data.actionItems.length).toBe(1);
      expect(getBody.data.actionItems[0].task).toBe('Perform load testing on Friday');

      mockSummary.mockRestore();
      mockActionItems.mockRestore();
    });
  });

  describe('4. AI Meeting Notes (Structured & User Editable)', () => {
    it('should generate structured notes and allow user review/editing before confirming', async () => {
      await MeetingMessage.create({
        meetingId: testMeeting._id,
        senderId: hostUser._id,
        content: 'Let us review the three architectural pillars: WebRTC, fast JWT auth, and OpenAI summaries.'
      });

      const mockNotes = vi.spyOn(OpenAiService, 'generateMeetingNotes').mockResolvedValueOnce({
        agenda: ['Architecture pillars review'],
        topics: [
          {
            topic: 'Core Architecture',
            notes: 'Discussion of WebRTC media pipelines and fast token rotation.',
            speakers: [hostUser.name]
          }
        ],
        decisions: ['Adopt official OpenAI SDK on backend only'],
        nextSteps: ['Run automated test verification'],
        contentMarkdown: '# Architecture Review Notes\n\n- Adopt official OpenAI SDK.'
      });

      // Generate notes
      const genRes = await app.inject({
        method: 'POST',
        url: `/api/v1/ai/meetings/${testMeeting._id}/notes`,
        headers: { authorization: `Bearer ${hostToken}` },
        payload: {}
      });

      expect(genRes.statusCode).toBe(200);
      const genBody = JSON.parse(genRes.payload);
      expect(genBody.data.isDraft).toBe(true);
      expect(genBody.data.isConfirmedByUser).toBe(false);

      // User edits and confirms notes
      const putRes = await app.inject({
        method: 'PUT',
        url: `/api/v1/ai/meetings/${testMeeting._id}/notes`,
        headers: { authorization: `Bearer ${hostToken}` },
        payload: {
          contentMarkdown: '# Architecture Review Notes (Confirmed)\n\n- Adopt official OpenAI SDK.\n- Verified with 100% test coverage.',
          isConfirmedByUser: true
        }
      });

      expect(putRes.statusCode).toBe(200);
      const putBody = JSON.parse(putRes.payload);
      expect(putBody.data.isDraft).toBe(false);
      expect(putBody.data.isConfirmedByUser).toBe(true);
      expect(putBody.data.contentMarkdown).toContain('Confirmed');

      mockNotes.mockRestore();
    });
  });

  describe('5. AI Action Items Generation & Review', () => {
    it('should extract, toggle, and delete action items', async () => {
      await MeetingMessage.create({
        meetingId: testMeeting._id,
        senderId: hostUser._id,
        content: 'John, please update the documentation by Monday. Sarah will handle QA.'
      });

      const mockExtract = vi.spyOn(OpenAiService, 'extractActionItems').mockResolvedValueOnce([
        {
          task: 'Update the documentation',
          description: 'Ensure all new AI endpoints are documented',
          assignee: 'John',
          dueDate: 'Monday',
          priority: 'medium',
          status: 'pending',
          completed: false
        },
        {
          task: 'Execute regression QA',
          description: 'Verify video call and chat flows',
          assignee: 'Sarah',
          dueDate: 'Tuesday',
          priority: 'high',
          status: 'pending',
          completed: false
        }
      ]);

      // Extract
      const postRes = await app.inject({
        method: 'POST',
        url: `/api/v1/ai/meetings/${testMeeting._id}/action-items`,
        headers: { authorization: `Bearer ${hostToken}` },
        payload: {}
      });

      expect(postRes.statusCode).toBe(200);
      const postBody = JSON.parse(postRes.payload);
      expect(postBody.data.length).toBe(2);

      const docItem = postBody.data.find((i) => i.task === 'Update the documentation');

      // Toggle status to completed
      const toggleRes = await app.inject({
        method: 'PATCH',
        url: `/api/v1/ai/meetings/${testMeeting._id}/action-items/${docItem._id}`,
        headers: { authorization: `Bearer ${attendeeToken}` },
        payload: { completed: true }
      });

      expect(toggleRes.statusCode).toBe(200);
      const toggleBody = JSON.parse(toggleRes.payload);
      expect(toggleBody.data.completed).toBe(true);
      expect(toggleBody.data.status).toBe('completed');

      // Delete action item
      const deleteRes = await app.inject({
        method: 'DELETE',
        url: `/api/v1/ai/meetings/${testMeeting._id}/action-items/${docItem._id}`,
        headers: { authorization: `Bearer ${hostToken}` }
      });
      expect(deleteRes.statusCode).toBe(200);

      const remaining = await AiActionItem.find({ meetingId: testMeeting._id });
      expect(remaining.length).toBe(1);

      mockExtract.mockRestore();
    });
  });
});
