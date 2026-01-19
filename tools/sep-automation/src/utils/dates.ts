/**
 * Date utilities
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Calculate the number of days between two dates
 */
export function daysBetween(date1: Date, date2: Date): number {
  return Math.floor((date2.getTime() - date1.getTime()) / MS_PER_DAY);
}
