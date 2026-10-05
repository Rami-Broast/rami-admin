/**
 * How a dispatcher reads the list of drivers they can hand a delivery to.
 *
 * Pure, because the ordering and the wording are the whole substance here and
 * both are easy to get wrong in a way nobody notices until service. It is
 * shared by the Deliveries page and, in `kitchen-pos`, by the counter's assign
 * dialog — the two places a driver is actually chosen.
 */

export interface AssignableDriver {
  id: string;
  isOnline: boolean;
  isAvailable: boolean;
  /** Absent on a backend that predates the count; treat as unknown, not zero. */
  activeDeliveryCount?: number;
  vehicleType?: string | null;
  user: { fullName: string };
}

/** How many jobs the driver holds, as far as this client can tell. */
export function loadOf(driver: AssignableDriver): number | null {
  if (typeof driver.activeDeliveryCount === 'number') {
    return driver.activeDeliveryCount;
  }
  // An older backend sends only the flag. "Not free" means at least one job,
  // and saying "on a job" is honest where inventing a count would not be.
  return driver.isAvailable ? 0 : null;
}

/**
 * Free drivers first, then the lightest load, then alphabetically.
 *
 * The order somebody would choose in anyway, made the default so the obvious
 * choice is the first one — during service nobody reads a list of twelve names
 * looking for the least busy.
 */
export function sortByAvailability<T extends AssignableDriver>(drivers: readonly T[]): T[] {
  return [...drivers].sort((a, b) => {
    if (a.isAvailable !== b.isAvailable) {
      return a.isAvailable ? -1 : 1;
    }
    const la = loadOf(a) ?? Number.MAX_SAFE_INTEGER;
    const lb = loadOf(b) ?? Number.MAX_SAFE_INTEGER;
    if (la !== lb) {
      return la - lb;
    }
    return a.user.fullName.localeCompare(b.user.fullName);
  });
}

/**
 * What the driver's load says, in words.
 *
 * `null` for a free driver: the row already reads as the ordinary case, and
 * "carrying 0 deliveries" is noise on eleven rows out of twelve.
 */
export function loadLabel(driver: AssignableDriver): string | null {
  const load = loadOf(driver);
  if (load === null) {
    return 'on a job';
  }
  if (load === 0) {
    return null;
  }
  return load === 1 ? 'carrying 1 delivery' : `carrying ${load} deliveries`;
}

/** One line for a `<select>`, which cannot carry two pieces of markup. */
export function driverOptionLabel(driver: AssignableDriver): string {
  const load = loadLabel(driver);
  return load ? `${driver.user.fullName} — ${load}` : driver.user.fullName;
}
