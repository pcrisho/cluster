/**
 * Video links a lesson may embed: each allowed service maps a pasted URL to its embed URL.
 * Anything else (other hosts, http, look-alike domains, credentials in the URL) is rejected.
 * Microsoft links (SharePoint, OneDrive, Stream and Teams recordings) embed only if the tenant
 * allows it, so the player always offers "Open in new tab" as well.
 */
export function embedUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password) return null;
  const host = url.hostname.toLowerCase();
  const path = url.pathname.split("/").filter(Boolean);

  if (
    host === "youtube.com" ||
    host === "www.youtube.com" ||
    host === "m.youtube.com" ||
    host === "youtu.be"
  ) {
    const id =
      host === "youtu.be"
        ? path[0]
        : path[0] === "watch"
          ? url.searchParams.get("v")
          : path[0] === "embed" || path[0] === "shorts"
            ? path[1]
            : null;
    return id && YOUTUBE_ID.test(id)
      ? `https://www.youtube-nocookie.com/embed/${id}`
      : null;
  }
  if (host === "vimeo.com" || host === "www.vimeo.com") {
    const [id, hash] = path;
    if (!id || !DIGITS.test(id) || (hash !== undefined && !TOKEN.test(hash)))
      return null;
    return `https://player.vimeo.com/video/${id}${hash ? `?h=${hash}` : ""}`;
  }
  if (host === "player.vimeo.com") {
    return path[0] === "video" && path[1] && DIGITS.test(path[1])
      ? url.toString()
      : null;
  }
  if (host === "drive.google.com") {
    return path[0] === "file" &&
      path[1] === "d" &&
      path[2] &&
      TOKEN.test(path[2])
      ? `https://drive.google.com/file/d/${path[2]}/preview`
      : null;
  }
  if (host === "loom.com" || host === "www.loom.com") {
    return path[0] === "share" && path[1] && TOKEN.test(path[1])
      ? `https://www.loom.com/embed/${path[1]}`
      : null;
  }
  if (
    host.endsWith(".sharepoint.com") ||
    host === "onedrive.live.com" ||
    host === "1drv.ms"
  ) {
    return url.toString();
  }
  return null;
}

const YOUTUBE_ID = /^[\w-]{11}$/;
const DIGITS = /^\d+$/;
const TOKEN = /^[\w-]+$/;
