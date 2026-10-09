export class ApiResponse {
  static success(reply, statusCode = 200, message = 'Success', data = null) {
    const payload = {
      success: true,
      message
    };
    if (data !== null && data !== undefined) {
      payload.data = data;
    }
    return reply.status(statusCode).send(payload);
  }

  static error(reply, statusCode = 400, message = 'An error occurred', errorCode = 'BAD_REQUEST', details = null) {
    const payload = {
      success: false,
      message,
      error: {
        code: errorCode
      }
    };
    if (details) {
      payload.error.details = details;
    }
    return reply.status(statusCode).send(payload);
  }
}
