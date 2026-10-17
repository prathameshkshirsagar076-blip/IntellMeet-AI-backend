import { GoogleGenerativeAI } from '@google/generative-ai';
import { env } from '../../config/env.js';

export class GeminiService {
  /**
   * Lazily initializes and returns an authenticated Google Generative AI client.
   * Throws HTTP 501 / GEMINI_NOT_CONFIGURED if API key is not set or is a placeholder.
   */
  static getClient() {
    const apiKey = env.GEMINI.API_KEY;
    if (!apiKey || apiKey.startsWith('your_') || apiKey === 'placeholder' || apiKey.trim() === '') {
      const err = new Error('Google Gemini API key is not configured. Please set GEMINI_API_KEY in the environment.');
      err.statusCode = 501;
      err.code = 'GEMINI_NOT_CONFIGURED';
      throw err;
    }

    return new GoogleGenerativeAI(apiKey);
  }

  /**
   * Normalizes model identifiers (maps deprecated 1.5 aliases to active 2.5 models).
   */
  static normalizeModelName(rawModel) {
    if (!rawModel || typeof rawModel !== 'string') {
      return env.GEMINI.MODEL || 'gemini-2.5-flash';
    }
    const clean = rawModel.trim();
    if (clean === 'gemini-1.5-flash' || clean === 'gemini-1.5-flash-latest') {
      return 'gemini-2.5-flash';
    }
    if (clean === 'gemini-1.5-pro' || clean === 'gemini-1.5-pro-latest') {
      return 'gemini-2.5-pro';
    }
    return clean;
  }

  /**
   * Gets generative model instance configured with system instruction and optional JSON mode.
   */
  static getGenerativeModel({
    modelName = env.GEMINI.MODEL || 'gemini-2.5-flash',
    systemInstruction,
    jsonMode = false,
    temperature = 0.7
  } = {}) {
    const client = GeminiService.getClient();
    const resolvedModel = GeminiService.normalizeModelName(modelName);

    const options = {
      model: resolvedModel,
      generationConfig: {
        temperature
      }
    };

    if (systemInstruction) {
      options.systemInstruction = systemInstruction;
    }

    if (jsonMode) {
      options.generationConfig.responseMimeType = 'application/json';
    }

    return client.getGenerativeModel(options);
  }

  /**
   * Formats and maps Gemini errors to standard HTTP response shapes
   */
  static handleProviderError(error) {
    if (error.code === 'GEMINI_NOT_CONFIGURED' || error.statusCode === 501) {
      throw error;
    }

    const msg = error.message || String(error);
    const classified = new Error();

    if (msg.includes('API_KEY_INVALID') || msg.includes('API key not valid') || msg.includes('403')) {
      classified.message = 'Google Gemini authentication failed. Please verify your GEMINI_API_KEY.';
      classified.statusCode = 502;
      classified.code = 'GEMINI_AUTH_FAILED';
    } else if (msg.includes('RESOURCE_EXHAUSTED') || msg.includes('429')) {
      classified.message = 'Google Gemini rate limit or quota exceeded. Please try again in a few moments.';
      classified.statusCode = 429;
      classified.code = 'GEMINI_RATE_LIMIT';
    } else if (msg.includes('DEADLINE_EXCEEDED') || msg.includes('timeout')) {
      classified.message = 'Google Gemini request timed out. Please try again.';
      classified.statusCode = 504;
      classified.code = 'GEMINI_TIMEOUT';
    } else {
      classified.message = msg || 'An error occurred while communicating with Google Gemini API.';
      classified.statusCode = 502;
      classified.code = 'GEMINI_PROVIDER_ERROR';
    }

    throw classified;
  }

  /**
   * Truncates long transcripts safely to prevent token exhaustion.
   */
  static sanitizeTranscript(rawTranscript, maxChars = 30000) {
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
   * Core chat completion endpoint with multi-turn conversation memory.
   */
  static async chatCompletion({
    messages,
    systemPrompt,
    model = env.GEMINI.MODEL || 'gemini-2.5-flash',
    temperature = 0.7
  }) {
    try {
      const generativeModel = GeminiService.getGenerativeModel({
        modelName: model,
        systemInstruction: systemPrompt,
        temperature
      });

      // Prepare conversation history (exclude the very last user message which is the prompt)
      const history = [];
      const historySource = messages.slice(0, -1);

      for (const msg of historySource) {
        history.push({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: String(msg.content || '') }]
        });
      }

      const lastMessage = messages[messages.length - 1];
      const userPrompt = lastMessage ? String(lastMessage.content || '') : '';

      const chat = generativeModel.startChat({ history });
      const result = await chat.sendMessage(userPrompt);
      const response = await result.response;
      const text = response.text();

      return {
        content: text,
        tokensUsed: 0,
        model: model || env.GEMINI.MODEL || 'gemini-2.5-flash',
        finishReason: 'stop'
      };
    } catch (err) {
      GeminiService.handleProviderError(err);
    }
  }

  /**
   * Generates structured meeting summaries with JSON output.
   */
  static async generateMeetingSummary({
    meetingTitle,
    meetingDate,
    transcript,
    participants = [],
    model = env.GEMINI.MODEL || 'gemini-2.5-flash'
  }) {
    try {
      const sanitizedTranscript = GeminiService.sanitizeTranscript(transcript);
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

      const generativeModel = GeminiService.getGenerativeModel({
        modelName: model,
        systemInstruction: systemPrompt,
        jsonMode: true,
        temperature: 0.2
      });

      const result = await generativeModel.generateContent(userPrompt);
      const response = await result.response;
      const rawText = response.text();
      const parsed = JSON.parse(rawText);

      return {
        overview: parsed.overview || 'Meeting completed with team discussions.',
        keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints : [],
        decisions: Array.isArray(parsed.decisions) ? parsed.decisions : [],
        keyTakeaways: Array.isArray(parsed.keyTakeaways) ? parsed.keyTakeaways : [],
        outstandingIssues: Array.isArray(parsed.outstandingIssues) ? parsed.outstandingIssues : [],
        followUpRecommendations: Array.isArray(parsed.followUpRecommendations) ? parsed.followUpRecommendations : [],
        sentiment: parsed.sentiment || 'Productive',
        model: model || env.GEMINI.MODEL || 'gemini-2.5-flash'
      };
    } catch (err) {
      GeminiService.handleProviderError(err);
    }
  }

  /**
   * Generates structured editable meeting notes.
   */
  static async generateMeetingNotes({
    meetingTitle,
    meetingDate,
    durationMinutes,
    transcript,
    participants = [],
    model = env.GEMINI.MODEL || 'gemini-2.5-flash'
  }) {
    try {
      const sanitizedTranscript = GeminiService.sanitizeTranscript(transcript);
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

      const generativeModel = GeminiService.getGenerativeModel({
        modelName: model,
        systemInstruction: systemPrompt,
        jsonMode: true,
        temperature: 0.2
      });

      const result = await generativeModel.generateContent(userPrompt);
      const response = await result.response;
      const rawText = response.text();
      const parsed = JSON.parse(rawText);

      return {
        agenda: Array.isArray(parsed.agenda) ? parsed.agenda : [],
        topics: Array.isArray(parsed.topics) ? parsed.topics : [],
        decisions: Array.isArray(parsed.decisions) ? parsed.decisions : [],
        nextSteps: Array.isArray(parsed.nextSteps) ? parsed.nextSteps : [],
        contentMarkdown: parsed.contentMarkdown || `# ${meetingTitle}\n\n**Date:** ${meetingDate}\n\n## Notes\n\nNo structured notes recorded.`,
        model: model || env.GEMINI.MODEL || 'gemini-2.5-flash'
      };
    } catch (err) {
      GeminiService.handleProviderError(err);
    }
  }

  /**
   * Extracts actionable tasks from transcripts.
   */
  static async extractActionItems({
    meetingTitle,
    meetingDate,
    transcript,
    participants = [],
    model = env.GEMINI.MODEL || 'gemini-2.5-flash'
  }) {
    try {
      const sanitizedTranscript = GeminiService.sanitizeTranscript(transcript);
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

      const generativeModel = GeminiService.getGenerativeModel({
        modelName: model,
        systemInstruction: systemPrompt,
        jsonMode: true,
        temperature: 0.2
      });

      const result = await generativeModel.generateContent(userPrompt);
      const response = await result.response;
      const rawText = response.text();
      const parsed = JSON.parse(rawText);

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
      GeminiService.handleProviderError(err);
    }
  }
}
