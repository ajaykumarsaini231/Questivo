// Server-side error handler for Express.js
export class AppError extends Error {
  constructor(message, statusCode = 500, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;

    Error.captureStackTrace(this, this.constructor);
  }
}

// Server-side error logging
export const logError = (error, context = "") => {
  const timestamp = new Date().toISOString();
  const contextStr = context ? ` [${context}]` : "";

  if (error instanceof AppError) {
    console.error(`${timestamp}${contextStr} AppError:`, {
      message: error.message,
      statusCode: error.statusCode,
      stack: error.stack,
    });
  } else if (error instanceof Error) {
    console.error(`${timestamp}${contextStr} Error:`, {
      message: error.message,
      stack: error.stack,
    });
  } else {
    console.error(`${timestamp}${contextStr} Unknown error:`, error);
  }
};

// Prisma error handling
export const handlePrismaError = (error) => {
  if (!error || typeof error !== "object" || !("code" in error)) {
    return {
      error: "Internal server error. Please try again later.",
      timestamp: new Date().toISOString(),
    };
  }

  switch (error.code) {
    case "P2002":
      return {
        error: "A record with this information already exists",
        details: error.meta?.target?.join(", "),
        timestamp: new Date().toISOString(),
      };
    case "P2025":
      return { error: "Record not found", timestamp: new Date().toISOString() };
    case "P2003":
      return { error: "Foreign key constraint failed", timestamp: new Date().toISOString() };
    default:
      return {
        error: "Database operation failed",
        details: `Error code: ${error.code}`,
        timestamp: new Date().toISOString(),
      };
  }
};

export const getStatusCodeFromPrismaError = (error) => {
  switch (error.code) {
    case "P2002":
      return 409;
    case "P2025":
      return 404;
    case "P2003":
      return 400;
    default:
      return 500;
  }
};

export const handleServerError = (error, res, context = "") => {
  logError(error, context);

  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }

  if (error && typeof error === "object" && "code" in error) {
    const body = handlePrismaError(error);
    const status = getStatusCodeFromPrismaError(error);
    return res.status(status).json(body);
  }

  return res.status(500).json({
    error: "Internal server error",
    timestamp: new Date().toISOString(),
  });
};

// Async wrapper
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch((err) =>
    handleServerError(err, res, `${req.method} ${req.path}`)
  );
