// Normalize user-provided URLs so they work reliably in <img src=...>.
//
// Common issue: Google Drive share URLs (drive.google.com/file/d/.../view) often return HTML,
// so browsers can block them when used as an image source (e.g. net::ERR_BLOCKED_BY_ORB).

export function normalizePhotoUrl(url?: string | null): string {
  if (!url) return '';
  const raw = String(url).trim();
  if (!raw) return '';

  // Keep data URLs (uploads) as-is.
  if (raw.startsWith('data:')) return raw;

  try {
    const parsed = new URL(raw);

    // Only normalize Google Drive share links.
    if (parsed.hostname !== 'drive.google.com') return raw;

    const id = extractGoogleDriveFileId(parsed);
    if (!id) return raw;

    // Direct view URL that returns the actual file bytes (works if the file is public).
    return 'https://drive.google.com/uc?export=view&id=' + id;
  } catch {
    // Not a valid absolute URL; leave unchanged.
    return raw;
  }
}

function extractGoogleDriveFileId(parsed: URL): string | null {
  // Example: https://drive.google.com/file/d/<ID>/view
  const match = parsed.pathname.match(new RegExp('^/file/d/([^/]+)/'));
  if (match?.[1]) return match[1];

  // Example: https://drive.google.com/open?id=<ID>
  const id = parsed.searchParams.get('id');
  if (id) return id;

  return null;
}





