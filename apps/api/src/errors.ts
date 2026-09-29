import { ZodError, type ZodType } from 'zod';

export class ApiError extends Error {
  public constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const parseWith = <T>(schema: ZodType<T>, value: unknown): T => {
  try {
    return schema.parse(value);
  } catch (error: unknown) {
    if (error instanceof ZodError) {
      throw new ApiError(
        400,
        'VALIDATION_ERROR',
        'The request did not match the contract.',
        error.issues,
      );
    }
    throw error;
  }
};
