export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly details?: Record<string, string[]>;
  public readonly code?: string;

  constructor(
    statusCode: number,
    message: string,
    details?: Record<string, string[]>,
    code?: string,
  ) {
    super(message);
    Object.setPrototypeOf(this, AppError.prototype);

    this.statusCode = statusCode;
    this.isOperational = true;
    this.details = details;
    this.code = code;

    Error.captureStackTrace(this, AppError);
  }
}
