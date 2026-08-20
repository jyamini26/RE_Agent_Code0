import { logger } from '../../logger.js';
import type { Guard } from './types.js';

export type { Guard, GuardContext, GuardVerdict } from './types.js';
export { NO_FINDINGS } from './types.js';

/**
 * Loads a guard module named by GUARD_MODULE, if one is configured.
 *
 * Dynamic rather than a static import, so the core carries no build-time
 * dependency on any particular guard. An unset variable, a missing package, or
 * a module that fails to construct all degrade to the same outcome: no guard,
 * and the platform runs exactly as it does without one. A safety layer that
 * prevented the product from starting would be a worse failure than its
 * absence.
 */
export async function loadGuard(specifier: string | undefined): Promise<Guard | null> {
  if (!specifier) return null;
  try {
    const mod = (await import(specifier)) as { createGuard?: () => Guard };
    if (typeof mod.createGuard !== 'function') {
      logger.warn(
        `[guard] ${specifier} exports no createGuard(); continuing without it`,
      );
      return null;
    }
    const guard = mod.createGuard();
    logger.info(`[guard] ${guard.name} active`);
    return guard;
  } catch (error) {
    logger.warn(
      `[guard] could not load ${specifier}: ${(error as Error).message}; continuing without it`,
    );
    return null;
  }
}
