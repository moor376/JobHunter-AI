export type ErrorDetail = {
  code: string;
  message: string;
  path: string;
};

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: ErrorDetail[];

  public constructor(
    message: string,
    statusCode = 500,
    code = "INTERNAL_ERROR",
    details?: ErrorDetail[],
  ) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}
