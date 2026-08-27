import type { RequestHandler } from "express";
import type { z } from "zod";

import { AppError } from "../utils/app-error.js";

export function validateBody<T>(schema: z.ZodType<T>): RequestHandler {
  return (request, _response, next) => {
    const result = schema.safeParse(request.body);

    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        code: issue.code,
        message: issue.message,
        path: issue.path.join("."),
      }));

      next(
        new AppError(
          "Request validation failed.",
          400,
          "VALIDATION_ERROR",
          details,
        ),
      );
      return;
    }

    request.body = result.data;
    next();
  };
}
