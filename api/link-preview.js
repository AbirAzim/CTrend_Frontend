/**
 * GET /api/link-preview?url=https://…
 * Fetches Open Graph metadata for comment link previews (Facebook-style cards).
 */

const BLOCKED_HOST =
  /^(localhost|127(?:\.\d+){3}|10(?:\.\d+){3}|192\.168(?:\.\d+){2}|169\.254(?:\.\d+){2}|0\.0\.0\.0)$/i;

function truncate(s, n) {
  const t = String(s ?? "").trim().replace(/\s+/g, " ");
  return t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t;
}

function decodeEntities(s) {
  return String(s ?? "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'");
}

function isAllowedUrl(raw) {
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    if (BLOCKED_HOST.test(u.hostname)) return false;
    if (u.hostname.endsWith(".local")) return false;
    return true;
  } catch {
    return false;
  }
}

function pickMeta(html, key) {
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']+)["']`,
      "i",
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${key}["']`,
      "i",
    ),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return decodeEntities(m[1].trim());
  }
  return null;
}

async function fetchHtml(url, redirects = 0) {
  if (redirects > 5) throw new Error("too many redirects");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; KeJitbeBot/1.0; +https://www.kejitbe.app)",
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
      },
      redirect: "manual",
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) throw new Error("redirect without location");
      const next = new URL(loc, url).toString();
      if (!isAllowedUrl(next)) throw new Error("blocked redirect");
      return fetchHtml(next, redirects + 1);
    }
    if (!res.ok) throw new Error(`status ${res.status}`);
    const text = await res.text();
    return text.slice(0, 500_000);
  } finally {
    clearTimeout(timer);
  }
}

function resolveImage(raw, pageUrl) {
  if (!raw) return null;
  try {
    return new URL(raw, pageUrl).toString();
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const rawUrl = req.query?.url;
  if (!rawUrl || typeof rawUrl !== "string") {
    res.status(400).json({ error: "url is required" });
    return;
  }

  let target;
  try {
    target = decodeURIComponent(rawUrl);
  } catch {
    res.status(400).json({ error: "invalid url" });
    return;
  }

  if (!isAllowedUrl(target)) {
    res.status(400).json({ error: "invalid url" });
    return;
  }

  try {
    const html = await fetchHtml(target);
    const title =
      pickMeta(html, "og:title") ||
      pickMeta(html, "twitter:title") ||
      html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() ||
      null;
    const description =
      pickMeta(html, "og:description") ||
      pickMeta(html, "twitter:description") ||
      pickMeta(html, "description") ||
      null;
    const image = resolveImage(
      pickMeta(html, "og:image") || pickMeta(html, "twitter:image"),
      target,
    );
    const siteName = pickMeta(html, "og:site_name");

    if (!title && !image && !description) {
      res.status(404).json({ error: "no preview", url: target });
      return;
    }

    res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
    res.status(200).json({
      url: target,
      title: title ? truncate(title, 120) : null,
      description: description ? truncate(description, 200) : null,
      image,
      siteName: siteName ? truncate(siteName, 60) : null,
    });
  } catch (err) {
    console.error("[link-preview]", target, err);
    res.status(502).json({ error: "preview unavailable", url: target });
  }
}
