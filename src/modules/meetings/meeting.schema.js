export const createMeetingSchema = {
  description: 'Create a new scheduled or instant meeting',
  tags: ['Meetings'],
  body: {
    type: 'object',
    required: ['title'],
    properties: {
      title: { type: 'string', minLength: 1, maxLength: 200 },
      description: { type: 'string', maxLength: 2000 },
      date: { type: 'string' },
      startTime: { type: 'string' },
      scheduledStartAt: { type: 'string' },
      scheduledEndAt: { type: 'string' },
      durationMinutes: { type: 'number', minimum: 5, maximum: 1440 },
      isInstant: { type: 'boolean' },
      passcode: { type: 'string' },
      participantEmails: {
        type: 'array',
        items: { type: 'string' }
      },
      participantLimit: { type: 'number', minimum: 2, maximum: 500 },
      settings: {
        type: 'object',
        properties: {
          allowChat: { type: 'boolean' },
          allowScreenShare: { type: 'boolean' },
          waitingRoom: { type: 'boolean' },
          isMutedOnEntry: { type: 'boolean' },
          isVideoOffOnEntry: { type: 'boolean' }
        }
      }
    }
  }
};

export const listMeetingsSchema = {
  description: 'List accessible meetings with filtering and pagination',
  tags: ['Meetings'],
  querystring: {
    type: 'object',
    properties: {
      status: { type: 'string', enum: ['upcoming', 'live', 'completed', 'cancelled'] },
      page: { type: 'integer', minimum: 1, default: 1 },
      limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
      search: { type: 'string' },
      date: { type: 'string' }
    }
  }
};

export const meetingIdParamSchema = {
  description: 'Meeting ID or Code parameter',
  tags: ['Meetings'],
  params: {
    type: 'object',
    required: ['meetingId'],
    properties: {
      meetingId: { type: 'string' }
    }
  }
};

export const updateMeetingSchema = {
  description: 'Update meeting details and settings',
  tags: ['Meetings'],
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
      title: { type: 'string', minLength: 1, maxLength: 200 },
      description: { type: 'string', maxLength: 2000 },
      date: { type: 'string' },
      startTime: { type: 'string' },
      scheduledStartAt: { type: 'string' },
      durationMinutes: { type: 'number', minimum: 5, maximum: 1440 },
      passcode: { type: 'string' },
      settings: {
        type: 'object',
        properties: {
          allowChat: { type: 'boolean' },
          allowScreenShare: { type: 'boolean' },
          waitingRoom: { type: 'boolean' },
          isMutedOnEntry: { type: 'boolean' },
          isVideoOffOnEntry: { type: 'boolean' }
        }
      }
    }
  }
};

export const joinMeetingSchema = {
  description: 'Join a meeting',
  tags: ['Meetings'],
  params: {
    type: 'object',
    required: ['meetingId'],
    properties: {
      meetingId: { type: 'string' }
    }
  },
  body: {
    type: 'object',
    nullable: true,
    properties: {
      passcode: { type: 'string' }
    }
  }
};

export const sendMessageSchema = {
  description: 'Send in-meeting chat message',
  tags: ['Meetings'],
  params: {
    type: 'object',
    required: ['meetingId'],
    properties: {
      meetingId: { type: 'string' }
    }
  },
  body: {
    type: 'object',
    required: ['content'],
    properties: {
      content: { type: 'string', minLength: 1, maxLength: 5000 },
      clientMessageId: { type: 'string' },
      messageType: { type: 'string', enum: ['text', 'system'], default: 'text' }
    }
  }
};

export const editMessageSchema = {
  description: 'Edit in-meeting chat message',
  tags: ['Meetings'],
  params: {
    type: 'object',
    required: ['meetingId', 'messageId'],
    properties: {
      meetingId: { type: 'string' },
      messageId: { type: 'string' }
    }
  },
  body: {
    type: 'object',
    required: ['content'],
    properties: {
      content: { type: 'string', minLength: 1, maxLength: 5000 }
    }
  }
};

export const searchMessagesSchema = {
  description: 'Search messages in a meeting',
  tags: ['Meetings'],
  params: {
    type: 'object',
    required: ['meetingId'],
    properties: {
      meetingId: { type: 'string' }
    }
  },
  querystring: {
    type: 'object',
    required: ['q'],
    properties: {
      q: { type: 'string', minLength: 1 },
      limit: { type: 'integer', minimum: 1, maximum: 50, default: 20 }
    }
  }
};
