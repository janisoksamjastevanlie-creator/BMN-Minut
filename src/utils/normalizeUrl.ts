// Normalize user-provided URLs so they work reliably in <img src=...>.
//
// Google Drive / Googleusercontent links are often blocked by modern browsers when embedded cross-site
// (e.g. net::ERR_BLOCKED_BY_ORB). To make them work consistently, we proxy them through our own API.

export function normalizePhotoUrl(url?: string | null): string {
  if (!url) return '';
  const raw = String(url).trim();
  if (!raw) return '';

  // Keep data URLs (uploads) as-is.
  if (raw.startsWith('data:')) return raw;

  try {
    const parsed = new URL(raw);
    const host = parsed.hostname;

    // Convert Drive share links into a direct view URL, then proxy it same-origin.
    if (host === 'drive.google.com') {
      const id = extractGoogleDriveFileId(parsed);
      if (!id) return raw;
      const direct = 'https://drive.google.com/uc?export=view&id=' + id;
      return proxyUrl(direct);
    }

    // Newer Drive links often resolve to drive.usercontent.google.com; those are CORP-protected, so proxy.
    if (host === 'drive.usercontent.google.com' || host.endsWith('googleusercontent.com')) {
      return proxyUrl(parsed.toString());
    }

    return raw;
  } catch {
    // Not a valid absolute URL; leave unchanged.
    return raw;
  }
}

function proxyUrl(target: string): string {
  return '/api/media/proxy?url=' + encodeURIComponent(target);
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
