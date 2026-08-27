import { Prisma } from "@prisma/client";
import type {
  ErrorRequestHandler,
  NextFunction,
  Request,
  RequestHandler,
  Response,
} from "express";
import { ZodError } from "zod";

import { AppError, type ErrorDetail } from "../utils/app-error.js";
import { logError } from "../utils/logger.js";

function toErrorDetails(error: ZodError): ErrorDetail[] {
  return error.issues.map((issue) => ({
    code: issue.code,
    message: issue.message,
    path: issue.path.join("."),
  }));
}

function normalizeError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof ZodError) {
    return new AppError(
      "Request validation failed.",
      400,
      "VALIDATION_ERROR",
      toErrorDetails(error),
    );
  }

  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    return new AppError(
      "A record with the same unique value already exists.",
      409,
      "DUPLICATE_RECORD",
    );
  }

  if (error instanceof SyntaxError) {
    return new AppError("Request body must contain valid JSON.", 400, "INVALID_JSON");
  }

  return new AppError("An unexpected error occurred.");
}

function getRequestId(response: Response): string {
  const requestId = response.locals.requestId;
  return typeof requestId === "string" ? requestId : "unknown";
}

export const notFoundHandler: RequestHandler = (request, _response, next) => {
  next(
    new AppError(
      "Route not found.",
      404,
      "NOT_FOUND",
    ),
  );
};

export const errorHandler: ErrorRequestHandler = (
  error: unknown,
  request: Request,
  response: Response,
  next: NextFunction,
) => {
  if (response.headersSent) {
    next(error);
    return;
  }

  const normalizedError = normalizeError(error);
  const requestId = getRequestId(response);

  logError({
    level: "error",
    event: "request_failed",
    requestId,
    method: request.method,
    path: request.path,
    statusCode: normalizedError.statusCode,
    errorCode: normalizedError.code,
    errorName: error instanceof Error ? error.name : "UnknownError",
  });

  response.status(normalizedError.statusCode).json({
    error: {
      code: normalizedError.code,
      details: normalizedError.details,
      message: normalizedError.message,
      requestId,
    },
  });
};
