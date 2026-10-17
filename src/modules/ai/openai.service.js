import OpenAI from 'openai';
import { env } from '../../config/env.js';

export class OpenAiService {
  /**
   * Lazily initializes and returns an authenticated OpenAI SDK client.
   * Throws HTTP 501 / OPENAI_NOT_CONFIGURED if API key is not set or is a placeholder.
   */
  static getClient() {
    const apiKey = env.OPENAI.API_KEY;
    if (!apiKey || apiKey.startsWith('your_') || apiKey === 'placeholder' || apiKey.trim() === '') {
      const err = new Error('OpenAI API key is not configured. Please set OPENAI_API_KEY in the environment.');
      err.statusCode = 501;
      err.code = 'OPENAI_NOT_CONFIGURED';
      throw err;
    }

    return new OpenAI({
      apiKey,
      baseURL: env.OPENAI.BASE_URL || 'https://api.openai.com/v1',
      timeout: 35000,
      maxRetries: 2
    });
  }

  /**
   * Safely formats and maps OpenAI errors to standard HTTP response shapes
   */
  static handleProviderError(error) {
    if (error.code === 'OPENAI_NOT_CONFIGURED' || error.statusCode === 501) {
      throw error;
    }

    const status = error.status || error.statusCode || 500;
    const classified = new Error();

    if (status === 401) {
      classified.message = 'OpenAI authentication failed. Please verify your OPENAI_API_KEY.';
      classified.statusCode = 502;
      classified.code = 'OPENAI_AUTH_FAILED';
    } else if (status === 429) {
      classified.message = 'OpenAI rate limit or quota exceeded. Please check your plan or try again later.';
      classified.statusCode = 429;
      classified.code = 'OPENAI_RATE_LIMIT';
    } else if (error.name === 'APIConnectionTimeoutError' || error.name === 'TimeoutError' || status === 408) {
      classified.message = 'OpenAI request timed out. Please try again.';
      classified.statusCode = 504;
      classified.code = 'OPENAI_TIMEOUT';
    } else if (status === 400) {
      classified.message = error.message || 'Invalid request payload sent to OpenAI.';
      classified.statusCode = 400;
      classified.code = 'OPENAI_BAD_REQUEST';
    } else {
      classified.message = error.message || 'An unexpected error occurred while communicating with OpenAI.';
      classified.statusCode = status >= 400 && status < 600 ? status : 502;
      classified.code = 'OPENAI_PROVIDER_ERROR';
    }

    throw classified;
  }

  /**
   * Truncates long transcripts safely to prevent token exhaustion.
   */
  static sanitizeTranscript(rawTranscript, maxChars = 25000) {
    if (!rawTranscript || typeof rawTranscript !== 'string') {
      return '';
    }
    const clean = rawTranscript.trim();
    if (clean.length > maxChars) {
      return `${clean.slice(0, maxChars)}\n\n[... Transcript truncated at ${maxChars} characters to adhere to token limits ...]`;
    }
    return clean;
  }

  /**
   * Core chat completion endpoint supporting multi-turn history.
   */
  static async chatCompletion({
    messages,
    systemPrompt,
    model = env.OPENAI.MODEL,
    maxTokens = 2000,
    temperature = 0.7
  }) {
    const client = OpenAiService.getClient();

    const formattedMessages = [];
    if (systemPrompt) {
      formattedMessages.push({ role: 'system', content: systemPrompt });
    }

    for (const msg of messages) {
      formattedMessages.push({
        role: msg.role === 'assistant' ? 'assistant' : msg.role === 'system' ? 'system' : 'user',
        content: String(msg.content || '')
      });
    }

    try {
      const response = await client.chat.completions.create({
        model: model || env.OPENAI.MODEL || 'gpt-4o-mini',
        messages: formattedMessages,
        max_tokens: maxTokens,
        temperature
      });

      const choice = response.choices?.[0];
      const content = choice?.message?.content || '';
      const tokensUsed = response.usage?.total_tokens || 0;

      return {
        content,
        tokensUsed,
        model: response.model || model,
        finishReason: choice?.finish_reason || 'stop'
      };
    } catch (err) {
      OpenAiService.handleProviderError(err);
    }
  }

  /**
   * Real AI Meeting Summary generation returning structured data.
   */
  static async generateMeetingSummary({
    meetingTitle,
    meetingDate,
    transcript,
    participants = [],
    model = env.OPENAI.MODEL || 'gpt-4o'
  }) {
    const client = OpenAiService.getClient();
    const sanitizedTranscript = OpenAiService.sanitizeTranscript(transcript);

    const participantList = participants
      .map((p) => (typeof p === 'string' ? p : p.name || p.email || 'Participant'))
      .join(', ');

    const systemPrompt = `You are an expert enterprise meeting intelligence summarizer.
Analyze the provided meeting transcript and return a comprehensive executive summary strictly formatted as a valid JSON object matching the requested schema.
Do NOT invent facts, attendees, or discussions not grounded in the transcript.
Output ONLY a valid JSON object with the following schema:
{
  "overview": "A clear, high-level executive overview (2-4 sentences)",
  "keyPoints": ["Main discussion point 1", "Main discussion point 2", ...],
  "decisions": ["Important decision 1", "Important decision 2", ...],
  "keyTakeaways": ["Key takeaway 1", "Key takeaway 2", ...],
  "outstandingIssues": ["Unresolved issue or question 1", ...],
  "followUpRecommendations": ["Recommendation for follow-up 1", ...],
  "sentiment": "Productive" | "Action-Oriented" | "Strategic" | "Collaborative" | "Informative"
}`;

      const userPrompt = `Meeting Title: "${meetingTitle}"
Date: ${meetingDate || 'N/A'}
Participants: ${participantList || 'Not specified'}

Meeting Transcript:
${sanitizedTranscript}`;

    try {
      const response = await client.chat.completions.create({
        model: model || env.OPENAI.MODEL || 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
        max_tokens: 2500
      });

      const rawContent = response.choices?.[0]?.message?.content || '{}';
      const parsed = JSON.parse(rawContent);

      return {
        overview: parsed.overview || 'Meeting completed with team discussions.',
        keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints : [],
        decisions: Array.isArray(parsed.decisions) ? parsed.decisions : [],
        keyTakeaways: Array.isArray(parsed.keyTakeaways) ? parsed.keyTakeaways : [],
        outstandingIssues: Array.isArray(parsed.outstandingIssues) ? parsed.outstandingIssues : [],
        followUpRecommendations: Array.isArray(parsed.followUpRecommendations) ? parsed.followUpRecommendations : [],
        sentiment: parsed.sentiment || 'Productive',
        model: response.model || model || env.OPENAI.MODEL
      };
    } catch (err) {
      OpenAiService.handleProviderError(err);
    }
  }

  /**
   * Real AI Meeting Notes generation returning structured, editable notes.
   */
  static async generateMeetingNotes({
    meetingTitle,
    meetingDate,
    durationMinutes,
    transcript,
    participants = [],
    model = env.OPENAI.MODEL || 'gpt-4o'
  }) {
    const client = OpenAiService.getClient();
    const sanitizedTranscript = OpenAiService.sanitizeTranscript(transcript);

    const participantList = participants
      .map((p) => (typeof p === 'string' ? p : p.name || p.email || 'Participant'))
      .join(', ');

    const systemPrompt = `You are a professional corporate secretary and executive meeting note-taker.
Synthesize the meeting transcript into clear, comprehensive, professional notes.
Output ONLY a valid JSON object matching this schema:
{
  "agenda": ["Topic or agenda item 1", "Topic 2", ...],
  "topics": [
    {
      "topic": "Topic Name",
      "notes": "Detailed notes on discussion and debate on this topic",
      "speakers": ["Speaker Name", ...]
    }
  ],
  "decisions": ["Official decision made", ...],
  "nextSteps": ["Immediate next step or milestone", ...],
  "contentMarkdown": "A complete, beautifully formatted Markdown representation of the notes with headers, bullet points, and speaker callouts."
}`;

    const userPrompt = `Meeting Title: "${meetingTitle}"
Date: ${meetingDate || 'N/A'}
Duration: ${durationMinutes || 45} minutes
Attendees: ${participantList || 'Not specified'}

Transcript:
${sanitizedTranscript}`;

    try {
      const response = await client.chat.completions.create({
        model: model || env.OPENAI.MODEL || 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
        max_tokens: 3000
      });

      const rawContent = response.choices?.[0]?.message?.content || '{}';
      const parsed = JSON.parse(rawContent);

      return {
        agenda: Array.isArray(parsed.agenda) ? parsed.agenda : [],
        topics: Array.isArray(parsed.topics) ? parsed.topics : [],
        decisions: Array.isArray(parsed.decisions) ? parsed.decisions : [],
        nextSteps: Array.isArray(parsed.nextSteps) ? parsed.nextSteps : [],
        contentMarkdown: parsed.contentMarkdown || `# ${meetingTitle}\n\n**Date:** ${meetingDate}\n\n## Notes\n\nNo structured notes recorded.`,
        model: response.model || model || env.OPENAI.MODEL
      };
    } catch (err) {
      OpenAiService.handleProviderError(err);
    }
  }

  /**
   * Real Action Item extraction with structured JSON output and participant matching.
   */
  static async extractActionItems({
    meetingTitle,
    meetingDate,
    transcript,
    participants = [],
    model = env.OPENAI.MODEL || 'gpt-4o'
  }) {
    const client = OpenAiService.getClient();
    const sanitizedTranscript = OpenAiService.sanitizeTranscript(transcript);

    const participantList = participants
      .map((p) => (typeof p === 'string' ? p : p.name || p.email || 'Participant'))
      .join(', ');

    const systemPrompt = `You are an AI task extraction engine for enterprise meetings.
Identify actionable deliverables, assigned commitments, tasks, and follow-ups explicitly mentioned in the transcript.
Match assignees to participants where possible. If an assignee is not specified, set it to "Unassigned".
Output ONLY a valid JSON object matching this schema:
{
  "actionItems": [
    {
      "task": "Concise task description",
      "description": "Additional context or acceptance criteria if mentioned",
      "assignee": "Name of assignee or Unassigned",
      "dueDate": "Due date if mentioned (e.g. '2026-10-25' or 'Friday' or 'Next Sprint'), or null",
      "priority": "low" | "medium" | "high"
    }
  ]
}`;

    const userPrompt = `Meeting Title: "${meetingTitle}"
Date: ${meetingDate || 'N/A'}
Participants: ${participantList || 'Not specified'}

Meeting Transcript:
${sanitizedTranscript}`;

    try {
      const response = await client.chat.completions.create({
        model: model || env.OPENAI.MODEL || 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.2,
        max_tokens: 2000
      });

      const rawContent = response.choices?.[0]?.message?.content || '{"actionItems": []}';
      const parsed = JSON.parse(rawContent);

      const items = Array.isArray(parsed.actionItems) ? parsed.actionItems : [];
      return items.map((item) => ({
        task: String(item.task || '').trim(),
        description: String(item.description || '').trim(),
        assignee: String(item.assignee || 'Unassigned').trim(),
        dueDate: item.dueDate ? String(item.dueDate).trim() : null,
        priority: ['low', 'medium', 'high'].includes(item.priority) ? item.priority : 'medium',
        status: 'pending',
        completed: false
      }));
    } catch (err) {
      OpenAiService.handleProviderError(err);
    }
  }
}
