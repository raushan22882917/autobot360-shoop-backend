import type { PostgrestError } from '@supabase/supabase-js';

export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export function handleSupabaseError(err: PostgrestError): never {
  // RLS violation
  if (err.code === '42501') {
    throw new HttpError(403, 'FORBIDDEN', 'Access denied');
  }
  // Unique constraint violation
  if (err.code === '23505') {
    throw new HttpError(409, 'DUPLICATE', err.message);
  }
  // Foreign key violation
  if (err.code === '23503') {
    throw new HttpError(422, 'INVALID_REFERENCE', err.message);
  }
  // Check constraint violation
  if (err.code === '23514') {
    throw new HttpError(422, 'CONSTRAINT_VIOLATION', err.message);
  }
  throw new HttpError(500, 'DB_ERROR', 'Database error');
}

export function assertFound<T>(value: T | null | undefined, resource = 'Resource'): T {
  if (value == null) {
    throw new HttpError(404, 'NOT_FOUND', `${resource} not found`);
  }
  return value;
}
