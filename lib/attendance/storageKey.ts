/**
 * Attendance archive storage keys (private `member-files` bucket).
 *
 * The ONLY key shape the server may write is
 *   attendance/{organization UUID}/{member UUID}/{sheet UUID}/{revision UUID}.pdf
 * with lower-case UUIDs, generated on the server from scoped records. The
 * `attendance_server_only` Storage policy reserves the exact-case `attendance`
 * prefix; because the server never emits any other case, a browser-written
 * `Attendance/...` object is a distinct, never-read key and stays harmless.
 *
 * `isAttendanceStoragePath` is the second gate: privileged (service-role)
 * signing helpers that sign a database-provided path must refuse anything that
 * resolves into the attendance namespace, however it is spelled.
 */

export const ATTENDANCE_STORAGE_PREFIX = 'attendance';

const LOWER_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CANONICAL_KEY = new RegExp(
  `^${ATTENDANCE_STORAGE_PREFIX}/(${LOWER_UUID.source.slice(1, -1)})/(${LOWER_UUID.source.slice(1, -1)})/(${LOWER_UUID.source.slice(1, -1)})/(${LOWER_UUID.source.slice(1, -1)})\.pdf$`,
);

export interface AttendanceKeyParts {
  organizationId: string;
  memberId: string;
  sheetId: string;
  revisionId: string;
}

/** Builds the canonical key. Throws on anything but lower-case UUIDs (never normalizes silently). */
export function attendanceStorageKey(parts: AttendanceKeyParts): string {
  for (const [name, value] of Object.entries(parts)) {
    if (typeof value !== 'string' || !LOWER_UUID.test(value)) {
      throw new Error(`attendance storage key: ${name} must be a lower-case UUID`);
    }
  }
  return `${ATTENDANCE_STORAGE_PREFIX}/${parts.organizationId}/${parts.memberId}/${parts.sheetId}/${parts.revisionId}.pdf`;
}

export function isCanonicalAttendanceStorageKey(key: string): boolean {
  return typeof key === 'string' && CANONICAL_KEY.test(key);
}

/**
 * True when `path` is, or could be interpreted as, inside the attendance
 * namespace: case-insensitive, URL-encoding, backslash, `.`/`..`, repeated and
 * leading slashes are all resolved first. Fails closed: a path that cannot be
 * decoded is treated as attendance.
 */
export function isAttendanceStoragePath(path: string | null | undefined): boolean {
  if (typeof path !== 'string') return false;
  let value = path;
  try {
    for (let i = 0; i < 4; i += 1) {
      const decoded = decodeURIComponent(value);
      if (decoded === value) break;
      value = decoded;
    }
  } catch {
    return true;
  }
  const resolved: string[] = [];
  for (const segment of value.split(String.fromCharCode(92)).join('/').split('/')) {
    const s = segment.trim();
    if (s === '' || s === '.') continue;
    if (s === '..') resolved.pop();
    else resolved.push(s);
  }
  return resolved.length > 0 && resolved[0].toLowerCase() === ATTENDANCE_STORAGE_PREFIX;
}
