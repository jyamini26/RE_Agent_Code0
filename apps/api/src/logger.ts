/**
 * Minimal levelled logger.
 *
 * Exists mainly so the test run is silent: 95 integration tests each seed a
 * database and poll an inbox, and the resulting console traffic buries the
 * actual failures. Errors are never suppressed.
 */

const QUIET = process.env['NODE_ENV'] === 'test';

export const logger = {
  info(message: string): void {
    if (!QUIET) console.log(message);
  },

  warn(message: string): void {
    if (!QUIET) console.warn(message);
  },

  /** Always emitted. A swallowed error in a test run is worse than noise. */
  error(message: string, cause?: unknown): void {
    if (cause === undefined) console.error(message);
    else console.error(message, cause);
  },
};
