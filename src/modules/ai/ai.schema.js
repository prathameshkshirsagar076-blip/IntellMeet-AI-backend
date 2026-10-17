export const chatSchema = {
  tags: ['AI Assistant'],
  summary: 'Send chat prompt to AI Assistant',
  description: 'Submits user query to OpenAI with multi-turn history and optional meeting grounding',
  body: {
    type: 'object',
    required: ['message'],
    properties: {
      message: { type: 'string', minLength: 1, maxLength: 8000 },
      conversationId: { type: 'string', nullable: true },
      contextMeetingId: { type: 'string', nullable: true },
      systemPrompt: { type: 'string', nullable: true },
      model: { type: 'string', nullable: true },
      provider: { type: 'string', enum: ['gemini', 'openai'], nullable: true }
    }
  }
};

export const createConversationSchema = {
  tags: ['AI Assistant'],
  summary: 'Create new AI conversation',
  body: {
    type: 'object',
    properties: {
      title: { type: 'string', maxLength: 200 },
      model: { type: 'string' },
      contextMeetingId: { type: 'string', nullable: true },
      contextMeetingTitle: { type: 'string', nullable: true }
    }
  }
};

export const updateConversationSchema = {
  tags: ['AI Assistant'],
  summary: 'Update AI conversation title or pinned state',
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string' }
    }
  },
  body: {
    type: 'object',
    properties: {
      title: { type: 'string', maxLength: 200 },
      isPinned: { type: 'boolean' },
      contextMeetingId: { type: 'string', nullable: true },
      contextMeetingTitle: { type: 'string', nullable: true }
    }
  }
};

export const conversationIdParamSchema = {
  tags: ['AI Assistant'],
  summary: 'Conversation ID param',
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string' }
    }
  }
};

export const meetingIdParamSchema = {
  tags: ['AI Assistant'],
  summary: 'Meeting ID param',
  params: {
    type: 'object',
    required: ['meetingId'],
    properties: {
      meetingId: { type: 'string' }
    }
  }
};

export const generateSummarySchema = {
  tags: ['AI Assistant'],
  summary: 'Generate or retrieve AI meeting summary',
  params: {
    type: 'object',
    required: ['meetingId'],
    properties: {
      meetingId: { type: 'string' }
    }
  },
  body: {
    type: 'object',
    properties: {
      forceRegenerate: { type: 'boolean', default: false },
      model: { type: 'string', nullable: true },
      provider: { type: 'string', enum: ['gemini', 'openai'], nullable: true }
    }
  }
};

export const generateNotesSchema = {
  tags: ['AI Assistant'],
  summary: 'Generate or retrieve AI meeting notes',
  params: {
    type: 'object',
    required: ['meetingId'],
    properties: {
      meetingId: { type: 'string' }
    }
  },
  body: {
    type: 'object',
    properties: {
      forceRegenerate: { type: 'boolean', default: false },
      model: { type: 'string', nullable: true },
      provider: { type: 'string', enum: ['gemini', 'openai'], nullable: true }
    }
  }
};

export const updateNotesSchema = {
  tags: ['AI Assistant'],
  summary: 'Update editable meeting notes',
  params: {
    type: 'object',
    required: ['meetingId'],
    properties: {
      meetingId: { type: 'string' }
    }
  },
  body: {
    type: 'object',
    properties: {
      contentMarkdown: { type: 'string' },
      agenda: { type: 'array', items: { type: 'string' } },
      topics: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            topic: { type: 'string' },
            notes: { type: 'string' },
            speakers: { type: 'array', items: { type: 'string' } }
          }
        }
      },
      decisions: { type: 'array', items: { type: 'string' } },
      nextSteps: { type: 'array', items: { type: 'string' } },
      isConfirmedByUser: { type: 'boolean' }
    }
  }
};

export const generateActionItemsSchema = {
  tags: ['AI Assistant'],
  summary: 'Extract action items from meeting transcript',
  params: {
    type: 'object',
    required: ['meetingId'],
    properties: {
      meetingId: { type: 'string' }
    }
  },
  body: {
    type: 'object',
    properties: {
      forceRegenerate: { type: 'boolean', default: false },
      model: { type: 'string', nullable: true },
      provider: { type: 'string', enum: ['gemini', 'openai'], nullable: true }
    }
  }
};

export const actionItemIdParamSchema = {
  tags: ['AI Assistant'],
  summary: 'Action item params',
  params: {
    type: 'object',
    required: ['meetingId', 'itemId'],
    properties: {
      meetingId: { type: 'string' },
      itemId: { type: 'string' }
    }
  }
};

export const toggleActionItemSchema = {
  tags: ['AI Assistant'],
  summary: 'Toggle or update action item completion',
  params: {
    type: 'object',
    required: ['meetingId', 'itemId'],
    properties: {
      meetingId: { type: 'string' },
      itemId: { type: 'string' }
    }
  },
  body: {
    type: 'object',
    properties: {
      completed: { type: 'boolean' }
    }
  }
};
