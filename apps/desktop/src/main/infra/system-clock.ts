import type { Clock } from '@centresoutien/domain';

/**
 * Concrete Clock for the desktop composition root. `new Date()` is allowed here
 * (outside the domain) — the whole point of the port is that this is the ONE
 * place wall-clock time enters the system.
 */
export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}
