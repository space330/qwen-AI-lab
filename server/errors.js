export class AppError extends Error {
  constructor(code, message, status = 500, details = null) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function normalizeError(error) {
  if (error instanceof AppError) {
    return {
      status: error.status,
      body: {
        success: false,
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
        },
      },
    };
  }

  return {
    status: 500,
    body: {
      success: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "服务器内部错误，请稍后重试。",
        details: process.env.NODE_ENV === "development" ? error.message : null,
      },
    },
  };
}
