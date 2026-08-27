import type { NextFunction, Request, RequestHandler, Response } from "express";
import { AppError } from "../utils/app-error.js";

interface RateLimitStore {
  count: number;
  resetTime: number;
}

const clientLimitMap = new Map<string, RateLimitStore>();

export function rateLimiter(options: { maxRequests?: number; windowMs?: number } = {}): RequestHandler {
  const maxRequests = options.maxRequests || 120;
  const windowMs = options.windowMs || 60 * 1000; // 1 minute window

  return (request: Request, response: Response, next: NextFunction) => {
    const ip = request.ip || request.socket.remoteAddress || "127.0.0.1";
    const now = Date.now();

    const record = clientLimitMap.get(ip);
    if (!record || now > record.resetTime) {
      clientLimitMap.set(ip, {
        count: 1,
        resetTime: now + windowMs,
      });
      response.setHeader("X-RateLimit-Limit", maxRequests);
      response.setHeader("X-RateLimit-Remaining", maxRequests - 1);
      return next();
    }

    if (record.count >= maxRequests) {
      const retryAfter = Math.ceil((record.resetTime - now) / 1000);
      response.setHeader("Retry-After", retryAfter);
      return next(
        new AppError(
          "Too many requests, please slow down and try again later.",
          429,
          "RATE_LIMIT_EXCEEDED",
        ),
      );
    }

    record.count++;
    response.setHeader("X-RateLimit-Limit", maxRequests);
    response.setHeader("X-RateLimit-Remaining", maxRequests - record.count);
    return next();
  };
}
