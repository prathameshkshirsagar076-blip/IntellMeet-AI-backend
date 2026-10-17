import mongoose from 'mongoose';
import { AiConversation } from './models/ai-conversation.model.js';
import { AiMessage } from './models/ai-message.model.js';
import { AiMeetingSummary } from './models/ai-meeting-summary.model.js';
import { AiMeetingNote } from './models/ai-meeting-note.model.js';
import { AiActionItem } from './models/ai-action-item.model.js';
import { Meeting } from '../meetings/meeting.model.js';
import { MeetingParticipant } from '../meetings/participant.model.js';
import { MeetingMessage } from '../meetings/meeting-message.model.js';
import { OpenAiService } from './openai.service.js';
import { GeminiService } from './gemini.service.js';
import { env } from '../../config/env.js';

export class AiService {
  /**
   * Validates whether a user has permission to view or manipulate meeting-derived AI data.
   */
  static async verifyMeetingAccess(meetingId, userId) {
    if (!mongoose.Types.ObjectId.isValid(meetingId)) {
      const err = new Error('Invalid meeting ID format');
      err.statusCode = 400;
      err.code = 'INVALID_MEETING_ID';
      throw err;
    }

    const meeting = await Meeting.findOne({
      _id: meetingId,
      deletedAt: null
    }).populate('organizerId', 'name email avatar');

    if (!meeting) {
      const err = new Error('Meeting not found');
      err.statusCode = 404;
      err.code = 'MEETING_NOT_FOUND';
      throw err;
    }

    const userIdStr = userId?.toString();
    const organizerIdStr = (meeting.organizerId?._id || meeting.organizerId)?.toString();

    // Check organizer
    if (organizerIdStr === userIdStr) {
      const participants = await MeetingParticipant.find({ meetingId }).lean();
      return { meeting, participants, isOrganizer: true };
    }

    // Check participant
    const participant = await MeetingParticipant.findOne({
      meetingId,
      userId,
      status: { $ne: 'declined' }
    }).lean();

    if (!participant) {
      const err = new Error('Access denied: You are not an authorized participant of this meeting');
      err.statusCode = 403;
      err.code = 'FORBIDDEN';
      throw err;
    }

    const participants = await MeetingParticipant.find({ meetingId }).lean();
    return { meeting, participants, isOrganizer: false, participant };
  }

  /**
   * Fetches the real discussion messages from MeetingMessage to construct a grounded transcript.
   */
  static async getMeetingTranscript(meetingId) {
    const messages = await MeetingMessage.find({
      meetingId,
      isDeleted: false
    })
      .sort({ createdAt: 1 })
      .populate('senderId', 'name email')
      .lean();

    if (!messages || messages.length === 0) {
      return {
        hasContent: false,
        messageCount: 0,
        transcript: ''
      };
    }

    const formattedLines = messages.map((m) => {
      const sender = m.senderId?.name || m.senderId?.email || 'Participant';
      const time = m.createdAt ? new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
      return `[${time}] ${sender}: ${m.content}`;
    });

    return {
      hasContent: true,
      messageCount: messages.length,
      transcript: formattedLines.join('\n')
    };
  }

  /**
   * Dispatches to Google Gemini or OpenAI based on requested model, provider, or environment configuration.
   */
  static resolveProvider({ provider, model } = {}) {
    // 1. Explicit provider override
    if (provider === 'openai') {
      return {
        service: OpenAiService,
        provider: 'openai',
        model: model && !model.toLowerCase().startsWith('gemini') ? model : (env.OPENAI.MODEL || 'gpt-4o')
      };
    }

    if (provider === 'gemini') {
      return {
        service: GeminiService,
        provider: 'gemini',
        model: model && !model.toLowerCase().startsWith('gpt') && !model.toLowerCase().startsWith('o1') ? model : (env.GEMINI.MODEL || 'gemini-2.5-flash')
      };
    }

    // 2. Infer from model name if model is explicitly provided
    if (model) {
      const lowerModel = model.toLowerCase();
      if (lowerModel.startsWith('gemini')) {
        return {
          service: GeminiService,
          provider: 'gemini',
          model
        };
      }
      if (lowerModel.startsWith('gpt') || lowerModel.startsWith('o1') || lowerModel.startsWith('chatgpt')) {
        return {
          service: OpenAiService,
          provider: 'openai',
          model
        };
      }
    }

    // 3. Fallback based on available API keys or env.AI_PROVIDER
    if (env.AI_PROVIDER === 'gemini' && env.GEMINI.API_KEY && !env.GEMINI.API_KEY.startsWith('your_')) {
      return {
        service: GeminiService,
        provider: 'gemini',
        model: env.GEMINI.MODEL || 'gemini-2.5-flash'
      };
    }

    if (env.OPENAI.API_KEY && !env.OPENAI.API_KEY.startsWith('your_')) {
      return {
        service: OpenAiService,
        provider: 'openai',
        model: env.OPENAI.MODEL || 'gpt-4o'
      };
    }

    if (env.GEMINI.API_KEY && !env.GEMINI.API_KEY.startsWith('your_')) {
      return {
        service: GeminiService,
        provider: 'gemini',
        model: env.GEMINI.MODEL || 'gemini-2.5-flash'
      };
    }

    const defaultProvider = env.AI_PROVIDER || 'gemini';
    return {
      service: defaultProvider === 'gemini' ? GeminiService : OpenAiService,
      provider: defaultProvider,
      model: defaultProvider === 'gemini' ? (env.GEMINI.MODEL || 'gemini-2.5-flash') : (env.OPENAI.MODEL || 'gpt-4o')
    };
  }

  /**
   * Unified Chatbot API supporting multi-turn memory and optional meeting grounding.
   */
  static async chat({
    userId,
    conversationId,
    message,
    contextMeetingId,
    systemPrompt: clientSystemPrompt,
    model,
    provider
  }) {
    if (!message || typeof message !== 'string' || message.trim() === '') {
      const err = new Error('Message text is required');
      err.statusCode = 400;
      err.code = 'INVALID_MESSAGE';
      throw err;
    }

    const cleanPrompt = message.trim();
    let conversation;

    if (conversationId) {
      if (!mongoose.Types.ObjectId.isValid(conversationId)) {
        const err = new Error('Invalid conversation ID');
        err.statusCode = 400;
        err.code = 'INVALID_CONVERSATION_ID';
        throw err;
      }

      conversation = await AiConversation.findOne({ _id: conversationId, userId });
      if (!conversation) {
        const err = new Error('Conversation not found or access denied');
        err.statusCode = 404;
        err.code = 'CONVERSATION_NOT_FOUND';
        throw err;
      }
    } else {
      const resolvedDefaults = AiService.resolveProvider({ provider, model });
      const initialTitle = cleanPrompt.length > 35 ? `${cleanPrompt.slice(0, 32)}...` : cleanPrompt;
      conversation = await AiConversation.create({
        userId,
        title: initialTitle,
        model: resolvedDefaults.model,
        contextMeetingId: contextMeetingId || null
      });
    }

    // Meeting Grounding Logic
    const targetMeetingId = contextMeetingId || conversation.contextMeetingId;
    let groundedContext = '';
    const citations = [];

    if (targetMeetingId) {
      try {
        const { meeting } = await AiService.verifyMeetingAccess(targetMeetingId, userId);
        const { transcript, hasContent } = await AiService.getMeetingTranscript(targetMeetingId);
        const summary = await AiMeetingSummary.findOne({ meetingId: targetMeetingId }).lean();

        citations.push({
          title: meeting.title,
          sourceType: 'meeting',
          referenceId: meeting._id.toString()
        });

        groundedContext = `\n--- GROUNDED MEETING CONTEXT ---
Meeting Title: "${meeting.title}"
Scheduled Date: ${meeting.scheduledStartAt ? new Date(meeting.scheduledStartAt).toLocaleDateString() : 'N/A'}
Status: ${meeting.status}
Organizer: ${meeting.organizerId?.name || 'Organizer'}
${summary ? `Existing Executive Summary: ${summary.overview}\nDecisions: ${summary.decisions.join('; ')}` : ''}
${hasContent ? `Meeting Transcript:\n${transcript}` : 'No meeting chat transcript recorded for this session yet.'}
--------------------------------`;
      } catch (err) {
        // If user cannot access target meeting, proceed without leaking internal data
      }
    }

    // Retrieve conversation history (up to last 10 messages)
    const historyDocs = await AiMessage.find({ conversationId: conversation._id })
      .sort({ createdAt: 1 })
      .limit(10)
      .lean();

    const openaiMessages = historyDocs.map((m) => ({
      role: m.role,
      content: m.content
    }));

    openaiMessages.push({ role: 'user', content: cleanPrompt });

    const baseSystemPrompt = clientSystemPrompt || `You are the IntellMeet AI Assistant, a helpful, precise, and professional enterprise co-pilot.
Provide well-structured answers using clean Markdown with bold headers, bullet lists, and code blocks where helpful.
${groundedContext ? 'Strictly ground your answers regarding the meeting in the provided meeting context. If information is not in the meeting record, explicitly clarify that.' : ''}`;

    const fullSystemPrompt = `${baseSystemPrompt}\n${groundedContext}`;

    // Record user message in DB
    const userMessage = await AiMessage.create({
      conversationId: conversation._id,
      userId,
      role: 'user',
      content: cleanPrompt,
      contextMeetingId: targetMeetingId || null
    });

    // Resolve provider: Gemini or OpenAI
    const { service: aiProviderService, model: activeModel } = AiService.resolveProvider({
      provider,
      model: model || conversation.model
    });

    // Call selected AI Provider
    const aiResult = await aiProviderService.chatCompletion({
      messages: openaiMessages,
      systemPrompt: fullSystemPrompt,
      model: activeModel
    });

    // Record assistant response in DB
    const assistantMessage = await AiMessage.create({
      conversationId: conversation._id,
      userId,
      role: 'assistant',
      content: aiResult.content,
      model: aiResult.model,
      tokensUsed: aiResult.tokensUsed,
      citations,
      contextMeetingId: targetMeetingId || null
    });

    // Update conversation metadata
    conversation.messageCount = (conversation.messageCount || 0) + 2;
    conversation.lastMessagePreview = aiResult.content.slice(0, 80);
    conversation.updatedAt = new Date();
    await conversation.save();

    return {
      conversation,
      userMessage,
      assistantMessage,
      answer: aiResult.content,
      citations
    };
  }

  /**
   * Meeting Summaries: generates or retrieves real AI summary based on actual transcript.
   */
  static async generateSummary({ meetingId, userId, forceRegenerate = false, model, provider }) {
    const { meeting, participants } = await AiService.verifyMeetingAccess(meetingId, userId);

    if (!forceRegenerate) {
      const existing = await AiMeetingSummary.findOne({ meetingId }).sort({ createdAt: -1 });
      if (existing) {
        return existing;
      }
    }

    const { transcript, hasContent, messageCount } = await AiService.getMeetingTranscript(meetingId);

    if (!hasContent) {
      const err = new Error('Meeting transcript or discussion content is required to generate summaries.');
      err.statusCode = 400;
      err.code = 'NO_TRANSCRIPT_AVAILABLE';
      throw err;
    }

    const meetingDate = meeting.scheduledStartAt
      ? new Date(meeting.scheduledStartAt).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0];

    const { service: aiProviderService, model: activeModel } = AiService.resolveProvider({ provider, model });

    const generated = await aiProviderService.generateMeetingSummary({
      meetingTitle: meeting.title,
      meetingDate,
      transcript,
      participants,
      model: activeModel
    });

    const summary = await AiMeetingSummary.create({
      meetingId: meeting._id,
      meetingTitle: meeting.title,
      userId,
      date: meetingDate,
      durationMinutes: meeting.durationMinutes || 45,
      overview: generated.overview,
      keyPoints: generated.keyPoints,
      decisions: generated.decisions,
      keyTakeaways: generated.keyTakeaways,
      outstandingIssues: generated.outstandingIssues,
      followUpRecommendations: generated.followUpRecommendations,
      sentiment: generated.sentiment,
      model: generated.model,
      sourceMessageCount: messageCount
    });

    // Also populate action items automatically if none exist yet
    const existingActionCount = await AiActionItem.countDocuments({ meetingId: meeting._id });
    if (existingActionCount === 0) {
      try {
        await AiService.extractActionItems({ meetingId, userId, forceRegenerate: false, model, provider });
      } catch (err) {
        // Non-blocking action item extraction
      }
    }

    return summary;
  }

  static async getSummary({ meetingId, userId }) {
    await AiService.verifyMeetingAccess(meetingId, userId);

    const summary = await AiMeetingSummary.findOne({ meetingId }).sort({ createdAt: -1 }).lean();
    if (!summary) {
      return null;
    }

    const actionItems = await AiActionItem.find({ meetingId }).sort({ createdAt: 1 }).lean();
    return {
      ...summary,
      id: summary._id.toString(),
      actionItems: actionItems.map((a) => ({
        id: a._id.toString(),
        task: a.task,
        assignee: a.assignee,
        completed: a.completed,
        dueDate: a.dueDate,
        priority: a.priority
      }))
    };
  }

  /**
   * Meeting Notes: generates structured, editable notes from meeting transcripts.
   */
  static async generateNotes({ meetingId, userId, forceRegenerate = false, model, provider }) {
    const { meeting, participants } = await AiService.verifyMeetingAccess(meetingId, userId);

    const existing = await AiMeetingNote.findOne({ meetingId });
    if (existing && !forceRegenerate && existing.isConfirmedByUser) {
      return existing;
    }

    const { transcript, hasContent } = await AiService.getMeetingTranscript(meetingId);
    if (!hasContent) {
      const err = new Error('Meeting transcript or discussion content is required to generate notes.');
      err.statusCode = 400;
      err.code = 'NO_TRANSCRIPT_AVAILABLE';
      throw err;
    }

    const meetingDate = meeting.scheduledStartAt
      ? new Date(meeting.scheduledStartAt).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0];

    const { service: aiProviderService, model: activeModel } = AiService.resolveProvider({ provider, model });

    const generated = await aiProviderService.generateMeetingNotes({
      meetingTitle: meeting.title,
      meetingDate,
      durationMinutes: meeting.durationMinutes || 45,
      transcript,
      participants,
      model: activeModel
    });

    if (existing) {
      existing.agenda = generated.agenda;
      existing.topics = generated.topics;
      existing.decisions = generated.decisions;
      existing.nextSteps = generated.nextSteps;
      existing.contentMarkdown = generated.contentMarkdown;
      existing.isDraft = true;
      existing.lastEditedBy = userId;
      await existing.save();
      return existing;
    }

    const note = await AiMeetingNote.create({
      meetingId: meeting._id,
      userId,
      title: meeting.title,
      date: meetingDate,
      durationMinutes: meeting.durationMinutes || 45,
      agenda: generated.agenda,
      topics: generated.topics,
      decisions: generated.decisions,
      nextSteps: generated.nextSteps,
      contentMarkdown: generated.contentMarkdown,
      isDraft: true,
      isConfirmedByUser: false
    });

    return note;
  }

  static async getNotes({ meetingId, userId }) {
    await AiService.verifyMeetingAccess(meetingId, userId);
    return AiMeetingNote.findOne({ meetingId }).lean();
  }

  static async updateNotes({
    meetingId,
    userId,
    contentMarkdown,
    agenda,
    topics,
    decisions,
    nextSteps,
    isConfirmedByUser
  }) {
    const { meeting } = await AiService.verifyMeetingAccess(meetingId, userId);

    let note = await AiMeetingNote.findOne({ meetingId });
    const meetingDate = meeting.scheduledStartAt
      ? new Date(meeting.scheduledStartAt).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0];

    if (!note) {
      note = new AiMeetingNote({
        meetingId: meeting._id,
        userId,
        title: meeting.title,
        date: meetingDate
      });
    }

    if (contentMarkdown !== undefined) note.contentMarkdown = contentMarkdown;
    if (Array.isArray(agenda)) note.agenda = agenda;
    if (Array.isArray(topics)) note.topics = topics;
    if (Array.isArray(decisions)) note.decisions = decisions;
    if (Array.isArray(nextSteps)) note.nextSteps = nextSteps;
    if (isConfirmedByUser !== undefined) {
      note.isConfirmedByUser = Boolean(isConfirmedByUser);
      note.isDraft = !isConfirmedByUser;
    }
    note.lastEditedBy = userId;

    await note.save();
    return note;
  }

  /**
   * Action Items: extracts tasks, prevents duplicates, allows review and status toggling.
   */
  static async extractActionItems({ meetingId, userId, forceRegenerate = false, model, provider }) {
    const { meeting, participants } = await AiService.verifyMeetingAccess(meetingId, userId);

    const { transcript, hasContent } = await AiService.getMeetingTranscript(meetingId);
    if (!hasContent) {
      const err = new Error('Meeting transcript or discussion content is required to extract action items.');
      err.statusCode = 400;
      err.code = 'NO_TRANSCRIPT_AVAILABLE';
      throw err;
    }

    const meetingDate = meeting.scheduledStartAt
      ? new Date(meeting.scheduledStartAt).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0];

    const { service: aiProviderService, model: activeModel } = AiService.resolveProvider({ provider, model });

    const extracted = await aiProviderService.extractActionItems({
      meetingTitle: meeting.title,
      meetingDate,
      transcript,
      participants,
      model: activeModel
    });

    if (forceRegenerate) {
      await AiActionItem.deleteMany({ meetingId: meeting._id });
    }

    const existingItems = await AiActionItem.find({ meetingId: meeting._id }).lean();
    const existingTasksSet = new Set(existingItems.map((item) => item.task.toLowerCase().trim()));

    const newDocsToInsert = [];
    for (const item of extracted) {
      if (!existingTasksSet.has(item.task.toLowerCase().trim())) {
        newDocsToInsert.push({
          meetingId: meeting._id,
          userId,
          task: item.task,
          description: item.description,
          assignee: item.assignee,
          dueDate: item.dueDate,
          priority: item.priority,
          status: 'pending',
          completed: false
        });
      }
    }

    if (newDocsToInsert.length > 0) {
      await AiActionItem.insertMany(newDocsToInsert);
    }

    return AiActionItem.find({ meetingId: meeting._id }).sort({ createdAt: 1 });
  }

  static async getActionItems({ meetingId, userId }) {
    await AiService.verifyMeetingAccess(meetingId, userId);
    return AiActionItem.find({ meetingId }).sort({ createdAt: 1 });
  }

  static async toggleActionItem({ meetingId, itemId, userId, completed }) {
    await AiService.verifyMeetingAccess(meetingId, userId);

    if (!mongoose.Types.ObjectId.isValid(itemId)) {
      const err = new Error('Invalid action item ID');
      err.statusCode = 400;
      err.code = 'INVALID_ITEM_ID';
      throw err;
    }

    const item = await AiActionItem.findOne({ _id: itemId, meetingId });
    if (!item) {
      const err = new Error('Action item not found');
      err.statusCode = 404;
      err.code = 'ITEM_NOT_FOUND';
      throw err;
    }

    const isCompleted = completed !== undefined ? Boolean(completed) : !item.completed;
    item.completed = isCompleted;
    item.status = isCompleted ? 'completed' : 'pending';
    item.completedAt = isCompleted ? new Date() : null;
    item.completedBy = isCompleted ? userId : null;

    await item.save();
    return item;
  }

  static async deleteActionItem({ meetingId, itemId, userId }) {
    await AiService.verifyMeetingAccess(meetingId, userId);

    const deleted = await AiActionItem.findOneAndDelete({ _id: itemId, meetingId });
    if (!deleted) {
      const err = new Error('Action item not found');
      err.statusCode = 404;
      err.code = 'ITEM_NOT_FOUND';
      throw err;
    }
    return true;
  }

  /**
   * Conversation Management
   */
  static async getConversations(userId) {
    return AiConversation.find({ userId }).sort({ updatedAt: -1 }).lean();
  }

  static async getConversation(userId, conversationId) {
    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      return null;
    }
    return AiConversation.findOne({ _id: conversationId, userId }).lean();
  }

  static async getConversationMessages(userId, conversationId) {
    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      return [];
    }
    const conv = await AiConversation.findOne({ _id: conversationId, userId }).lean();
    if (!conv) {
      return [];
    }
    return AiMessage.find({ conversationId }).sort({ createdAt: 1 }).lean();
  }

  static async createConversation(userId, { title, model, contextMeetingId, contextMeetingTitle }) {
    return AiConversation.create({
      userId,
      title: title || 'New Conversation',
      model: model || 'gpt-4o-mini',
      contextMeetingId: contextMeetingId || null,
      contextMeetingTitle: contextMeetingTitle || null
    });
  }

  static async updateConversation(userId, conversationId, updates) {
    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      return null;
    }

    const allowed = {};
    if (typeof updates.title === 'string') allowed.title = updates.title.trim();
    if (typeof updates.isPinned === 'boolean') allowed.isPinned = updates.isPinned;
    if (updates.contextMeetingId !== undefined) allowed.contextMeetingId = updates.contextMeetingId || null;
    if (updates.contextMeetingTitle !== undefined) allowed.contextMeetingTitle = updates.contextMeetingTitle || null;

    return AiConversation.findOneAndUpdate(
      { _id: conversationId, userId },
      { $set: allowed },
      { new: true }
    );
  }

  static async deleteConversation(userId, conversationId) {
    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      return false;
    }
    await AiMessage.deleteMany({ conversationId, userId });
    await AiConversation.findOneAndDelete({ _id: conversationId, userId });
    return true;
  }
}
