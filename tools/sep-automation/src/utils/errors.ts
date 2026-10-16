/**
 * Error handling utilities
 */

/**
 * Extract error message from unknown error type
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return 'Unknown error';
}

/**
 * Check if an error is an HTTP error with a specific status code
 */
export function isHttpError(error: unknown, status: number): boolean {
  return (
    error instanceof Error &&
    'status' in error &&
    (error as { status: number }).status === status
  );
}
