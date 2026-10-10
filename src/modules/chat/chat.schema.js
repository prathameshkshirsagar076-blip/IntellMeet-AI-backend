export const createConversationSchema = {
  description: 'Create or retrieve a direct one-to-one conversation with a recipient',
  summary: 'Create/Get Direct Conversation',
  tags: ['Chat'],
  security: [{ bearerAuth: [] }],
  body: {
    type: 'object',
    required: ['recipientId'],
    properties: {
      recipientId: {
        type: 'string',
        minLength: 24,
        maxLength: 24,
        description: '24-character hexadecimal MongoDB ObjectId of the recipient user'
      }
    }
  },
  response: {
    200: {
      description: 'Conversation retrieved or created successfully',
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        data: {
          type: 'object',
          properties: {
            conversation: { type: 'object', additionalProperties: true }
          }
        }
      }
    },
    201: {
      description: 'New conversation created successfully',
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        data: {
          type: 'object',
          properties: {
            conversation: { type: 'object', additionalProperties: true }
          }
        }
      }
    }
  }
};

export const getConversationsSchema = {
  description: 'List direct conversations of authenticated user with preview, unread count, and pagination',
  summary: 'List Conversations',
  tags: ['Chat'],
  security: [{ bearerAuth: [] }],
  querystring: {
    type: 'object',
    properties: {
      page: { type: 'integer', minimum: 1, default: 1 },
      limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 }
    }
  },
  response: {
    200: {
      description: 'List of conversations',
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        data: {
          type: 'object',
          properties: {
            conversations: {
              type: 'array',
              items: { type: 'object', additionalProperties: true }
            },
            pagination: {
              type: 'object',
              properties: {
                page: { type: 'integer' },
                limit: { type: 'integer' },
                total: { type: 'integer' },
                totalPages: { type: 'integer' }
              }
            }
          }
        }
      }
    }
  }
};

export const getConversationByIdSchema = {
  description: 'Get conversation details by ID (authorized participants only)',
  summary: 'Get Conversation By ID',
  tags: ['Chat'],
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['conversationId'],
    properties: {
      conversationId: { type: 'string' }
    }
  },
  response: {
    200: {
      description: 'Conversation details',
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        data: {
          type: 'object',
          properties: {
            conversation: { type: 'object', additionalProperties: true }
          }
        }
      }
    }
  }
};

export const deleteConversationSchema = {
  description: 'Hide/archive a direct conversation for the authenticated user without affecting the other participant',
  summary: 'Hide Conversation',
  tags: ['Chat'],
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['conversationId'],
    properties: {
      conversationId: { type: 'string' }
    }
  },
  response: {
    200: {
      description: 'Conversation hidden successfully',
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' }
      }
    }
  }
};

export const getMessagesSchema = {
  description: 'Get paginated conversation messages with cursor pagination and receipt status',
  summary: 'List Messages',
  tags: ['Chat'],
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['conversationId'],
    properties: {
      conversationId: { type: 'string' }
    }
  },
  querystring: {
    type: 'object',
    properties: {
      cursor: { type: 'string' },
      limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
      direction: { type: 'string', enum: ['before', 'after'], default: 'before' }
    }
  },
  response: {
    200: {
      description: 'Paginated messages list in chronological order',
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        data: {
          type: 'object',
          properties: {
            messages: {
              type: 'array',
              items: { type: 'object', additionalProperties: true }
            },
            nextCursor: { type: ['string', 'null'] },
            hasMore: { type: 'boolean' }
          }
        }
      }
    }
  }
};

export const getMessageByIdSchema = {
  description: 'Fetch a single message by ID (requester must be an authorized conversation participant)',
  summary: 'Get Message By ID',
  tags: ['Chat'],
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['messageId'],
    properties: {
      messageId: { type: 'string' }
    }
  },
  response: {
    200: {
      description: 'Message details',
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        data: {
          type: 'object',
          properties: {
            message: { type: 'object', additionalProperties: true }
          }
        }
      }
    }
  }
};

export const editMessageSchema = {
  description: 'Edit own eligible text message and broadcast real-time update',
  summary: 'Edit Message',
  tags: ['Chat'],
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['messageId'],
    properties: {
      messageId: { type: 'string' }
    }
  },
  body: {
    type: 'object',
    required: ['content'],
    properties: {
      content: { type: 'string', minLength: 1, maxLength: 5000 }
    }
  },
  response: {
    200: {
      description: 'Message edited successfully',
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        data: {
          type: 'object',
          properties: {
            message: { type: 'object', additionalProperties: true }
          }
        }
      }
    }
  }
};

export const deleteMessageSchema = {
  description: 'Soft-delete own eligible message and broadcast real-time update',
  summary: 'Delete Message',
  tags: ['Chat'],
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['messageId'],
    properties: {
      messageId: { type: 'string' }
    }
  },
  response: {
    200: {
      description: 'Message deleted successfully',
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        data: {
          type: 'object',
          properties: {
            message: { type: 'object', additionalProperties: true }
          }
        }
      }
    }
  }
};

export const markAsReadSchema = {
  description: 'Mark incoming conversation messages as read and notify sender via Socket.IO',
  summary: 'Mark Messages As Read',
  tags: ['Chat'],
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['conversationId'],
    properties: {
      conversationId: { type: 'string' }
    }
  },
  body: {
    type: ['object', 'null'],
    properties: {
      upToMessageId: { type: 'string' }
    }
  },
  response: {
    200: {
      description: 'Read receipt updated successfully',
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        data: {
          type: 'object',
          properties: {
            readAt: { type: 'string' },
            affectedCount: { type: 'integer' }
          }
        }
      }
    }
  }
};

export const getUnreadCountSchema = {
  description: 'Get total unread message count for authenticated participant in a conversation',
  summary: 'Get Unread Count',
  tags: ['Chat'],
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['conversationId'],
    properties: {
      conversationId: { type: 'string' }
    }
  },
  response: {
    200: {
      description: 'Unread message count',
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        data: {
          type: 'object',
          properties: {
            conversationId: { type: 'string' },
            unreadCount: { type: 'integer' }
          }
        }
      }
    }
  }
};

export const markAsDeliveredSchema = {
  description: 'Mark message as delivered (fallback for recipient client confirmation)',
  summary: 'Mark Message Delivered',
  tags: ['Chat'],
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['messageId'],
    properties: {
      messageId: { type: 'string' }
    }
  },
  response: {
    200: {
      description: 'Delivery recorded successfully',
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        data: {
          type: 'object',
          properties: {
            receipt: { type: 'object', additionalProperties: true }
          }
        }
      }
    }
  }
};

export const getContactsSchema = {
  description: 'List eligible active users for starting conversations',
  summary: 'List Contacts',
  tags: ['Chat'],
  security: [{ bearerAuth: [] }],
  querystring: {
    type: 'object',
    properties: {
      search: { type: 'string' },
      page: { type: 'integer', minimum: 1, default: 1 },
      limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 }
    }
  },
  response: {
    200: {
      description: 'List of eligible users',
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        data: {
          type: 'object',
          properties: {
            contacts: {
              type: 'array',
              items: { type: 'object', additionalProperties: true }
            },
            pagination: {
              type: 'object',
              properties: {
                page: { type: 'integer' },
                limit: { type: 'integer' },
                total: { type: 'integer' },
                totalPages: { type: 'integer' }
              }
            }
          }
        }
      }
    }
  }
};

export const searchChatSchema = {
  description: 'Search messages across accessible conversations for authenticated user',
  summary: 'Search Chat Messages',
  tags: ['Chat'],
  security: [{ bearerAuth: [] }],
  querystring: {
    type: 'object',
    required: ['q'],
    properties: {
      q: { type: 'string', minLength: 1 },
      page: { type: 'integer', minimum: 1, default: 1 },
      limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 }
    }
  },
  response: {
    200: {
      description: 'Matching messages',
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        data: {
          type: 'object',
          properties: {
            messages: {
              type: 'array',
              items: { type: 'object', additionalProperties: true }
            },
            pagination: {
              type: 'object',
              properties: {
                page: { type: 'integer' },
                limit: { type: 'integer' },
                total: { type: 'integer' },
                totalPages: { type: 'integer' }
              }
            }
          }
        }
      }
    }
  }
};
