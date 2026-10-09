const ET = 'America/New_York';

function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1, 12));
}

/** MM/dd/yyyy — the legacy JSP's documented intent for activity dates (doc 02 §12.1). */
export function shortDate(iso: string | undefined): string {
  if (!iso) return '';
  const d = parseIsoDate(iso);
  return new Intl.DateTimeFormat('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(d);
}

/** MM/dd — appended to "Scheduled" in the activity table. */
export function monthDay(iso: string | undefined): string {
  if (!iso) return '';
  return new Intl.DateTimeFormat('en-US', { month: '2-digit', day: '2-digit', timeZone: 'UTC' }).format(parseIsoDate(iso));
}

/** EEEE, MMMM d, yyyy e.g. "Friday, October 9, 2026" (confirmation page). */
export function longDate(iso: string | undefined): string {
  if (!iso) return '';
  return new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(parseIsoDate(iso));
}

/** MM/dd/yyyy hh:mm a z in Eastern time e.g. "10/09/2026 08:43 AM EDT". */
export function submittedStamp(isoInstant: string | undefined, withSeconds = false): string {
  const d = isoInstant ? new Date(isoInstant) : new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    month: '2-digit', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    second: withSeconds ? '2-digit' : undefined, hour12: true, timeZone: ET, timeZoneName: 'short',
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const time = withSeconds ? `${get('hour')}:${get('minute')}:${get('second')}` : `${get('hour')}:${get('minute')}`;
  return `${get('month')}/${get('day')}/${get('year')} ${time} ${get('dayPeriod')} ${get('timeZoneName')}`;
}

/** Native <input type="date"> value (yyyy-MM-dd) → legacy MM/dd/yyyy wire format. */
export function isoToLegacyDate(iso: string): string {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[2]}/${m[3]}/${m[1]}` : iso;
}
