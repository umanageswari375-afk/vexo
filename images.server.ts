/**
 * Fetches a real image and embeds it, so generated projects ship actual artwork
 * instead of grey boxes. Tries a keyword-matched photo service, then a seeded
 * stock-photo service, and finally falls back to an inline SVG — so a project
 * never ends up with a broken image.
 */
const MIME_EXT: Record<string, string> = {
  jpeg: "jpg",
  jpg: "jpg",
  png: "png",
  webp: "webp",
  gif: "gif",
  svg: "svg",
};

export type ImageResult = {
  path: string;
  dataUrl: string;
  source: string;
  width: number;
  height: number;
};

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "image"
  );
}

/** Fallback: a self-contained SVG banner, so the file is always valid. */
function fallbackSvg(query: string, w: number, h: number): string {
  const label = query.replace(/[<>&"]/g, "").slice(0, 40);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="#1e293b"/><stop offset="100%" stop-color="#0f766e"/>
  </linearGradient></defs>
  <rect width="${w}" height="${h}" fill="url(#g)"/>
  <text x="50%" y="50%" fill="#e2e8f0" font-family="system-ui,sans-serif" font-size="${Math.round(h / 8)}"
    text-anchor="middle" dominant-baseline="middle">${label}</text>
</svg>`;
}

/** Downloads one URL and returns it as a data URL, or null when it isn't a usable image. */
async function grab(url: string): Promise<{ dataUrl: string; ext: string } | null> {
  const res = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(12000),
    headers: { "user-agent": "Mozilla/5.0 (compatible; VexoBot/1.0)" },
  });
  if (!res.ok) return null;
  const type = (res.headers.get("content-type") ?? "").split(";")[0]!.trim();
  const ext = MIME_EXT[type.replace("image/", "").toLowerCase()];
  if (!ext) return null;
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength < 500) return null;
  let bin = "";
  // Chunked to avoid blowing the argument limit on large images.
  for (let i = 0; i < buf.length; i += 8192)
    bin += String.fromCharCode(...buf.subarray(i, i + 8192));
  return { dataUrl: `data:${type};base64,${btoa(bin)}`, ext };
}

export async function fetchImage(query: string, w = 800, h = 600): Promise<ImageResult> {
  const q = query.trim() || "abstract";
  const seed = slugify(q);
  const candidates = [
    // Keyword-matched photos first, when the service is reachable.
    `https://loremflickr.com/${w}/${h}/${encodeURIComponent(q)}`,
    // Reliable stock photos; seeded so the same request yields a stable image.
    `https://picsum.photos/seed/${seed}/${w}/${h}`,
  ];
  for (const url of candidates) {
    try {
      const got = await grab(url);
      if (got)
        return {
          path: `assets/${seed}.${got.ext}`,
          dataUrl: got.dataUrl,
          source: url.replace(/\?.*$/, ""),
          width: w,
          height: h,
        };
    } catch {
      /* try the next provider */
    }
  }
  const svg = fallbackSvg(q, w, h);
  return {
    path: `assets/${seed}.svg`,
    dataUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    source: "inline-svg",
    width: w,
    height: h,
  };
}
