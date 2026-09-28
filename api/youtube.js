/**
 * /api/youtube — her channel's newest videos, for the Media page and the
 * homepage (js/data.js, api._fetchYouTubeFeed). Vercel runs any file in
 * /api as a small server program; nothing else on the site needs it.
 *
 *   With YOUTUBE_API_KEY set (Vercel → Settings → Environment Variables,
 *   a key from Google Cloud with the YouTube Data API v3 switched on; see
 *   README.md, "Videos"), it asks the YouTube Data API, which is the
 *   dependable way. Without a key, or if that fails, it reads the
 *   channel's public feed, which YouTube sometimes stops serving for days.
 *
 * Answers { source, videos: [{ youtubeId, published: "YYYY-MM-DD", title }] },
 * newest first, without Shorts, and Vercel keeps the answer for 30
 * minutes, so YouTube is asked a couple of times an hour at most. When
 * both fail it answers 502 and the site shows its saved list (DB.videos).
 *
 * The key stays here on the server: it is never sent to a browser.
 */
const CHANNEL = process.env.YOUTUBE_CHANNEL_ID || "UCTlHt_0n__lwSySZE6lDiuw"; // DB.youtube.channelId in js/data.js
const TIMEOUT = 6000;

const day = (iso) => String(iso || "").slice(0, 10);
const isVideo = (v) => /^[\w-]{11}$/.test(v.youtubeId) && /^\d{4}-\d{2}-\d{2}$/.test(v.published) && v.title;

async function get(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    return await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": "dr-ajokesings.com" } });
  } finally {
    clearTimeout(timer);
  }
}

// The Data API: the channel's long-form uploads (the "UULF" list leaves
// Shorts out); all uploads ("UU") if that list isn't there.
async function fromDataApi(key) {
  const tail = CHANNEL.slice(2);
  let lastError = null;
  for (const list of [`UULF${tail}`, `UU${tail}`]) {
    const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&maxResults=50&playlistId=${list}&key=${encodeURIComponent(key)}`;
    const res = await get(url);
    const body = await res.json().catch(() => ({}));
    if (res.ok) {
      return (body.items || [])
        .map((item) => ({
          youtubeId: (item.contentDetails && item.contentDetails.videoId) || (item.snippet && item.snippet.resourceId && item.snippet.resourceId.videoId) || "",
          // Private and deleted videos have no publish date: left out.
          published: day(item.contentDetails && item.contentDetails.videoPublishedAt),
          title: (item.snippet && item.snippet.title) || "",
        }))
        .filter(isVideo);
    }
    lastError = new Error(`YouTube Data API ${res.status}: ${(body.error && body.error.message) || "no answer"}`);
    if (res.status !== 404) break; // a bad key or a used-up quota won't be better on the next list
  }
  throw lastError;
}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const unescape = (s) => String(s).replace(/&(amp|lt|gt|quot|apos|#\d+|#x[\da-f]+);/gi, (m, e) => {
  if (e[0] !== "#") return ENTITIES[e.toLowerCase()];
  return String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
});
const tag = (xml, name) => { const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`)); return m ? unescape(m[1].trim()) : ""; };

// The channel's public feed: its newest 15 uploads.
async function fromFeed() {
  const res = await get(`https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL}`);
  if (!res.ok) throw new Error(`YouTube feed ${res.status}`);
  const xml = await res.text();
  return (xml.match(/<entry>[\s\S]*?<\/entry>/g) || [])
    .filter((entry) => !/href="[^"]*\/shorts\//.test(entry))
    .map((entry) => ({ youtubeId: tag(entry, "yt:videoId"), published: day(tag(entry, "published")), title: tag(entry, "title") }))
    .filter(isVideo);
}

// Written for plain Node (statusCode, setHeader, end), which Vercel's
// runtime is, so the same file also runs in local tests.
module.exports = async function handler(req, res) {
  const send = (status, body, cache) => {
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", cache);
    res.end(JSON.stringify(body));
  };
  const problems = [];
  const key = process.env.YOUTUBE_API_KEY;
  const sources = key ? [["api", () => fromDataApi(key)], ["feed", fromFeed]] : [["feed", fromFeed]];
  for (const [source, load] of sources) {
    try {
      const videos = (await load()).sort((a, b) => b.published.localeCompare(a.published));
      if (videos.length) return send(200, { source, videos }, "public, max-age=0, s-maxage=1800, stale-while-revalidate=86400");
      problems.push(`${source}: no videos`);
    } catch (err) {
      problems.push(`${source}: ${err.message}`);
    }
  }
  if (!key) problems.push("YOUTUBE_API_KEY isn't set");
  console.warn("[youtube]", problems.join(" | "));
  return send(502, { error: problems.join(" | ") }, "public, max-age=0, s-maxage=300");
};
