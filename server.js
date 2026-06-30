/* =====================================================================
   🚀 ULTIMATE SOCIAL MEDIA DOWNLOADER API v2.0
   ---------------------------------------------------------------------
   একটি শক্তিশালী মাল্টি-প্ল্যাটফর্ম সোশ্যাল মিডিয়া ডাউনলোডার সার্ভার
   ৫০+ এন্ডপয়েন্ট — TikTok, YouTube, Facebook, Instagram, Twitter/X,
   Pinterest, Reddit, Snapchat, LinkedIn, Threads, Vimeo, Dailymotion,
   SoundCloud, Spotify metadata, Likee, Kwai, Bilibili এবং আরও অনেক।
   ===================================================================== */

const express = require("express");
const cors = require("cors");
const axios = require("axios");
const cheerio = require("cheerio");
const rateLimit = require("express-rate-limit");

const app = express();
const PORT = process.env.PORT || 3000;

/* ─── মিডলওয়্যার ────────────────────────────────────────────────── */
app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

// Rate limiter (প্রতি IP প্রতি ১৫ মিনিটে ১৫০ রিকোয়েস্ট)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 150,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: "Too many requests, please slow down." }
});
app.use("/api", apiLimiter);

/* ─── গ্লোবাল হেডার ফাংশন ──────────────────────────────────────── */
const UA_DESKTOP =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const UA_MOBILE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";

function buildHeaders(origin = "") {
  const h = {
    "User-Agent": UA_DESKTOP,
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Cache-Control": "no-cache"
  };
  if (origin) {
    h["Origin"] = origin;
    h["Referer"] = origin + "/";
  }
  return h;
}

/* ─── ইউনিভার্সাল হেল্পার ফাংশন ────────────────────────────────── */
async function safeGet(url, opts = {}) {
  try {
    const res = await axios.get(url, {
      timeout: opts.timeout || 15000,
      headers: opts.headers || buildHeaders(),
      maxRedirects: 5,
      validateStatus: () => true
    });
    return { ok: res.status >= 200 && res.status < 400, status: res.status, data: res.data, headers: res.headers };
  } catch (e) {
    return { ok: false, status: 0, error: e.message };
  }
}

async function safePost(url, body, opts = {}) {
  try {
    const res = await axios.post(url, body, {
      timeout: opts.timeout || 15000,
      headers: opts.headers || buildHeaders(),
      maxRedirects: 5,
      validateStatus: () => true
    });
    return { ok: res.status >= 200 && res.status < 400, status: res.status, data: res.data, headers: res.headers };
  } catch (e) {
    return { ok: false, status: 0, error: e.message };
  }
}

function okJson(res, payload) {
  return res.json({ success: true, ...payload });
}

function failJson(res, message, code = 400) {
  return res.status(code).json({ success: false, error: message });
}

function getDateInfo(timestamp) {
  if (!timestamp) return { creationDate: "Unknown", accountAge: "Unknown", accountAgeDays: 0 };
  const creationDate = new Date(timestamp * 1000);
  const now = new Date();
  const diffMs = now - creationDate;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffYears = Math.floor(diffDays / 365);
  const diffMonths = Math.floor((diffDays % 365) / 30);
  return {
    creationDate: creationDate.toDateString(),
    creationTimestamp: timestamp,
    accountAge: `${diffYears} years, ${diffMonths} months`,
    accountAgeDays: diffDays
  };
}

function detectPlatform(url = "") {
  const u = url.toLowerCase();
  if (u.includes("tiktok.com") || u.includes("vm.tiktok")) return "tiktok";
  if (u.includes("youtube.com") || u.includes("youtu.be")) return "youtube";
  if (u.includes("facebook.com") || u.includes("fb.watch") || u.includes("fb.com")) return "facebook";
  if (u.includes("instagram.com")) return "instagram";
  if (u.includes("twitter.com") || u.includes("x.com")) return "twitter";
  if (u.includes("pinterest.")) return "pinterest";
  if (u.includes("reddit.com")) return "reddit";
  if (u.includes("snapchat.com")) return "snapchat";
  if (u.includes("linkedin.com")) return "linkedin";
  if (u.includes("threads.net")) return "threads";
  if (u.includes("vimeo.com")) return "vimeo";
  if (u.includes("dailymotion.com") || u.includes("dai.ly")) return "dailymotion";
  if (u.includes("soundcloud.com")) return "soundcloud";
  if (u.includes("spotify.com")) return "spotify";
  if (u.includes("likee.video") || u.includes("l.likee")) return "likee";
  if (u.includes("kwai.com")) return "kwai";
  if (u.includes("bilibili.com")) return "bilibili";
  if (u.includes("twitch.tv")) return "twitch";
  if (u.includes("tumblr.com")) return "tumblr";
  if (u.includes("vk.com")) return "vk";
  if (u.includes("ok.ru")) return "okru";
  if (u.includes("9gag.com")) return "ninegag";
  if (u.includes("imgur.com")) return "imgur";
  if (u.includes("rumble.com")) return "rumble";
  return "unknown";
}

/* ─── tikwm ভিত্তিক হেল্পার (টিকটক) ─────────────────────────────── */
async function tikwmFetch(path) {
  const url = `https://www.tikwm.com/api/${path}`;
  return safeGet(url, { headers: buildHeaders("https://www.tiktok.com") });
}

/* ===================================================================
   ROOT + HEALTH + DOCS
   =================================================================== */

app.get("/", (_req, res) => {
  res.json({
    status: "🚀 Ultimate Social Downloader API is running!",
    version: "2.0.0",
    total_endpoints: "60+",
    docs: "/api/docs",
    health: "/api/health"
  });
});

app.get("/api/health", (_req, res) => {
  res.json({
    success: true,
    uptime_seconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    memory: process.memoryUsage()
  });
});

app.get("/api/docs", (_req, res) => {
  res.json({
    success: true,
    endpoints: ENDPOINT_DOCS
  });
});

/* Auto-detect router — যেকোনো URL দিন, প্ল্যাটফর্ম অনুযায়ী রাউট করবে */
app.get("/api/auto", async (req, res) => {
  const url = req.query.url;
  if (!url) return failJson(res, "url query parameter required.");
  const platform = detectPlatform(url);
  if (platform === "unknown") return failJson(res, "Platform could not be detected from URL.", 404);
  // ইন্টারনাল ফরওয়ার্ড
  req.url = `/api/${platform}/download?url=${encodeURIComponent(url)}`;
  app._router.handle(req, res, () => {});
});

/* ===================================================================
   ENDPOINT DOCUMENTATION (auto-served from /api/docs)
   =================================================================== */
const ENDPOINT_DOCS = []; // populated at bottom

/* ===================================================================
   🎵 TIKTOK ROUTES (1-8)
   =================================================================== */

// 1) TikTok — সিঙ্গেল ভিডিও ডাউনলোড (HD + no watermark)
app.get("/api/tiktok/download", async (req, res) => {
  const videoUrl = req.query.url;
  if (!videoUrl) return failJson(res, "ভিডিও URL প্রদান করুন।");
  const r = await tikwmFetch(`?url=${encodeURIComponent(videoUrl)}&hd=1`);
  if (!r.ok || r.data?.code !== 0) return failJson(res, "ভিডিওর ডেটা পাওয়া যায়নি।", 404);
  const v = r.data.data;
  return okJson(res, {
    platform: "tiktok",
    title: v.title || "TikTok Video",
    duration: v.duration,
    author: v.author?.unique_id || "Unknown",
    author_name: v.author?.nickname,
    cover_image: v.cover,
    download_url_no_watermark: v.play,
    download_url_hd: v.hdplay || v.play,
    download_url_watermark: v.wmplay,
    music_url: v.music,
    play_count: v.play_count,
    digg_count: v.digg_count,
    comment_count: v.comment_count,
    share_count: v.share_count
  });
});

// 2) TikTok — ইউজারের সব ভিডিও
app.get("/api/tiktok/user/videos", async (req, res) => {
  const username = req.query.username;
  if (!username) return failJson(res, "ইউজারনেম প্রদান করুন।");
  const cleanUser = username.replace("@", "").trim();
  const r = await tikwmFetch(`user/posts?unique_id=${cleanUser}&count=50`);
  if (!r.ok || r.data?.code !== 0 || !r.data?.data?.videos)
    return failJson(res, "ইউজারের ভিডিও পাওয়া যায়নি।", 404);
  const videos = r.data.data.videos.map(v => ({
    video_id: v.video_id,
    title: v.title || "No Title",
    cover_image: v.cover,
    views: v.play_count || 0,
    likes: v.digg_count || 0,
    download_url_no_watermark: v.play
  }));
  return okJson(res, { username: cleanUser, total_fetched: videos.length, videos });
});

// 3) TikTok — কমেন্ট স্ক্র্যাপার
app.get("/api/tiktok/comments", async (req, res) => {
  const url = req.query.url;
  if (!url) return failJson(res, "ভিডিও URL আবশ্যক।");
  const r = await tikwmFetch(`comment/list?url=${encodeURIComponent(url)}&count=50`);
  if (!r.ok || r.data?.code !== 0) return failJson(res, "কমেন্ট পাওয়া যায়নি।", 404);
  const comments = (r.data.data.comments || []).map(c => ({
    comment_id: c.cid,
    comment_text: c.text,
    comment_time: new Date(c.create_time * 1000).toLocaleString(),
    likes: c.digg_count || 0,
    user: {
      username: c.user?.unique_id,
      nickname: c.user?.nickname,
      avatar: c.user?.avatar_thumb?.url_list?.[0] || ""
    }
  }));
  return okJson(res, { total_comments_fetched: comments.length, comments });
});

// 4) TikTok — প্রোফাইল ইনফো
app.get("/api/tiktok/user/info", async (req, res) => {
  const username = req.query.username;
  if (!username) return failJson(res, "ইউজারনেম দিন।");
  const cleanUser = username.replace("@", "").trim();
  const r = await tikwmFetch(`user/info?unique_id=${cleanUser}`);
  if (r.ok && r.data?.code === 0 && r.data?.data?.user) {
    const u = r.data.data.user;
    const stats = r.data.data.stats || {};
    const timeInfo = getDateInfo(u.createTime);
    return okJson(res, {
      username: u.uniqueId,
      nickname: u.nickname,
      avatar: u.avatarLarger || u.avatarMedium,
      bio: u.signature || "No Bio",
      verified: u.verified || false,
      region: u.region || "Unknown",
      followers: stats.followerCount || 0,
      following: stats.followingCount || 0,
      likes: stats.heartCount || 0,
      videos: stats.videoCount || 0,
      creationDate: timeInfo.creationDate,
      accountAge: timeInfo.accountAge
    });
  }
  return failJson(res, "প্রোফাইল ডেটা পাওয়া যায়নি।", 404);
});

// 5) TikTok — শুধু মিউজিক/সাউন্ড ডাউনলোড
app.get("/api/tiktok/music", async (req, res) => {
  const url = req.query.url;
  if (!url) return failJson(res, "URL দিন।");
  const r = await tikwmFetch(`?url=${encodeURIComponent(url)}&hd=1`);
  if (!r.ok || r.data?.code !== 0) return failJson(res, "মিউজিক পাওয়া যায়নি।", 404);
  return okJson(res, {
    music_url: r.data.data.music,
    music_info: r.data.data.music_info
  });
});

// 6) TikTok — ট্রেন্ডিং ভিডিও
app.get("/api/tiktok/trending", async (req, res) => {
  const region = req.query.region || "US";
  const r = await tikwmFetch(`feed/list?region=${region}&count=20`);
  if (!r.ok || r.data?.code !== 0) return failJson(res, "ট্রেন্ডিং লোড হয়নি।", 404);
  return okJson(res, { region, videos: r.data.data });
});

// 7) TikTok — হ্যাশট্যাগ সার্চ
app.get("/api/tiktok/hashtag", async (req, res) => {
  const tag = req.query.tag;
  if (!tag) return failJson(res, "hashtag দিন।");
  const r = await tikwmFetch(`challenge/posts?hid=${encodeURIComponent(tag)}&count=30`);
  if (!r.ok) return failJson(res, "হ্যাশট্যাগ ডেটা পাওয়া যায়নি।", 404);
  return okJson(res, { tag, data: r.data?.data });
});

// 8) TikTok — কীওয়ার্ড সার্চ
app.get("/api/tiktok/search", async (req, res) => {
  const q = req.query.q;
  if (!q) return failJson(res, "q (query) দিন।");
  const r = await tikwmFetch(`feed/search?keywords=${encodeURIComponent(q)}&count=20`);
  if (!r.ok) return failJson(res, "সার্চ ফেইল।", 404);
  return okJson(res, { query: q, results: r.data?.data });
});

/* ===================================================================
   ▶️ YOUTUBE ROUTES (9-15)
   =================================================================== */

// 9) YouTube — ভিডিও ইনফো (oEmbed + noembed fallback)
app.get("/api/youtube/info", async (req, res) => {
  const url = req.query.url;
  if (!url) return failJson(res, "URL দিন।");
  const oembed = await safeGet(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`);
  if (oembed.ok) return okJson(res, { platform: "youtube", ...oembed.data });
  const noembed = await safeGet(`https://noembed.com/embed?url=${encodeURIComponent(url)}`);
  if (noembed.ok) return okJson(res, { platform: "youtube", ...noembed.data });
  return failJson(res, "YouTube ইনফো পাওয়া যায়নি।", 404);
});

// 10) YouTube — ভিডিও ডাউনলোড লিংক (third-party API)
app.get("/api/youtube/download", async (req, res) => {
  const url = req.query.url;
  if (!url) return failJson(res, "URL দিন।");
  // Primary: y2mate-like public mirror
  const apis = [
    `https://co.wuk.sh/api/json?url=${encodeURIComponent(url)}`,
    `https://api.cobalt.tools/api/json`
  ];
  // Try cobalt POST first
  const cobalt = await safePost("https://api.cobalt.tools/api/json",
    { url, vCodec: "h264", vQuality: "720", aFormat: "mp3", isAudioOnly: false },
    { headers: { ...buildHeaders(), "Content-Type": "application/json", "Accept": "application/json" } }
  );
  if (cobalt.ok && cobalt.data?.url) {
    return okJson(res, {
      platform: "youtube",
      download_url: cobalt.data.url,
      status: cobalt.data.status,
      type: cobalt.data.type
    });
  }
  return failJson(res, "YouTube ডাউনলোড লিংক তৈরি করা যায়নি। পরে আবার চেষ্টা করুন।", 502);
});

// 11) YouTube — শুধু MP3 অডিও
app.get("/api/youtube/mp3", async (req, res) => {
  const url = req.query.url;
  if (!url) return failJson(res, "URL দিন।");
  const cobalt = await safePost("https://api.cobalt.tools/api/json",
    { url, isAudioOnly: true, aFormat: "mp3" },
    { headers: { ...buildHeaders(), "Content-Type": "application/json", "Accept": "application/json" } }
  );
  if (cobalt.ok && cobalt.data?.url) return okJson(res, { platform: "youtube", audio_url: cobalt.data.url });
  return failJson(res, "MP3 তৈরি ব্যর্থ।", 502);
});

// 12) YouTube — সার্চ
app.get("/api/youtube/search", async (req, res) => {
  const q = req.query.q;
  if (!q) return failJson(res, "q (query) দিন।");
  const r = await safeGet(`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`, {
    headers: buildHeaders()
  });
  if (!r.ok) return failJson(res, "সার্চ ফেইল।", 502);
  const html = r.data;
  const m = html.match(/var ytInitialData = (\{.+?\});<\/script>/);
  if (!m) return failJson(res, "পার্স ফেইল।", 502);
  try {
    const data = JSON.parse(m[1]);
    const items =
      data?.contents?.twoColumnSearchResultsRenderer?.primaryContents
        ?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents || [];
    const videos = items
      .filter(it => it.videoRenderer)
      .slice(0, 20)
      .map(it => {
        const v = it.videoRenderer;
        return {
          videoId: v.videoId,
          title: v.title?.runs?.[0]?.text,
          thumbnail: v.thumbnail?.thumbnails?.slice(-1)[0]?.url,
          channel: v.ownerText?.runs?.[0]?.text,
          duration: v.lengthText?.simpleText,
          views: v.viewCountText?.simpleText,
          url: `https://www.youtube.com/watch?v=${v.videoId}`
        };
      });
    return okJson(res, { query: q, total: videos.length, videos });
  } catch (e) {
    return failJson(res, "পার্স এরর: " + e.message, 502);
  }
});

// 13) YouTube — চ্যানেল ইনফো (শুধু basic)
app.get("/api/youtube/channel", async (req, res) => {
  const id = req.query.id || req.query.username;
  if (!id) return failJson(res, "channel id বা username দিন।");
  const target = id.startsWith("UC")
    ? `https://www.youtube.com/channel/${id}/about`
    : `https://www.youtube.com/@${id.replace("@", "")}/about`;
  const r = await safeGet(target, { headers: buildHeaders() });
  if (!r.ok) return failJson(res, "চ্যানেল পাওয়া যায়নি।", 404);
  const $ = cheerio.load(r.data);
  const title = $("meta[property='og:title']").attr("content");
  const desc = $("meta[property='og:description']").attr("content");
  const image = $("meta[property='og:image']").attr("content");
  return okJson(res, { platform: "youtube", channel: title, description: desc, avatar: image, url: target });
});

// 14) YouTube — থাম্বনেইল ডাউনলোড
app.get("/api/youtube/thumbnail", async (req, res) => {
  const url = req.query.url;
  if (!url) return failJson(res, "URL দিন।");
  const m = url.match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([\w-]{11})/);
  if (!m) return failJson(res, "ভিডিও আইডি বের করা যায়নি।");
  const id = m[1];
  return okJson(res, {
    video_id: id,
    thumbnails: {
      default: `https://i.ytimg.com/vi/${id}/default.jpg`,
      medium: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
      high: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      standard: `https://i.ytimg.com/vi/${id}/sddefault.jpg`,
      maxres: `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`
    }
  });
});

// 15) YouTube Shorts — ডেডিকেটেড এন্ডপয়েন্ট (alias)
app.get("/api/youtube/shorts", async (req, res) => {
  req.url = `/api/youtube/download?url=${encodeURIComponent(req.query.url || "")}`;
  app._router.handle(req, res, () => {});
});

/* ===================================================================
   👥 FACEBOOK ROUTES (16-22)
   =================================================================== */

// Helper: snapsave/getfvid এর অনুকরণে FB ভিডিও লিংক বের করা
async function fbResolve(url) {
  // Try public mirror: snapsave-style HTML scrape
  const r = await safeGet(`https://www.getfvid.com/api?url=${encodeURIComponent(url)}`, {
    headers: buildHeaders("https://www.getfvid.com")
  });
  if (r.ok && typeof r.data === "object") return r.data;
  // Fallback: scrape the FB page itself for <meta property="og:video">
  const page = await safeGet(url, { headers: buildHeaders() });
  if (page.ok && typeof page.data === "string") {
    const $ = cheerio.load(page.data);
    const video = $("meta[property='og:video']").attr("content") ||
                  $("meta[property='og:video:url']").attr("content");
    const image = $("meta[property='og:image']").attr("content");
    const title = $("meta[property='og:title']").attr("content");
    return { hd: video, sd: video, thumbnail: image, title };
  }
  return null;
}

// 16) Facebook — ভিডিও ডাউনলোড
app.get("/api/facebook/download", async (req, res) => {
  const url = req.query.url;
  if (!url) return failJson(res, "FB ভিডিও URL দিন।");
  const data = await fbResolve(url);
  if (!data) return failJson(res, "Facebook ভিডিও পাওয়া যায়নি।", 404);
  return okJson(res, {
    platform: "facebook",
    title: data.title || "Facebook Video",
    thumbnail: data.thumbnail || data.cover,
    download_url_hd: data.hd || data.download_hd,
    download_url_sd: data.sd || data.download_sd
  });
});

// 17) Facebook — Reels
app.get("/api/facebook/reels", async (req, res) => {
  const url = req.query.url;
  if (!url) return failJson(res, "Reels URL দিন।");
  const data = await fbResolve(url);
  if (!data) return failJson(res, "Reel পাওয়া যায়নি।", 404);
  return okJson(res, { platform: "facebook_reels", ...data });
});

// 18) Facebook — লাইভ/ষ্টোরি ভিডিও (একই resolver)
app.get("/api/facebook/story", async (req, res) => {
  const url = req.query.url;
  if (!url) return failJson(res, "Story URL দিন।");
  const data = await fbResolve(url);
  if (!data) return failJson(res, "Story পাওয়া যায়নি।", 404);
  return okJson(res, { platform: "facebook_story", ...data });
});

// 19) Facebook — পেজ ইনফো (og: meta)
app.get("/api/facebook/page", async (req, res) => {
  const url = req.query.url;
  if (!url) return failJson(res, "page URL দিন।");
  const r = await safeGet(url, { headers: buildHeaders() });
  if (!r.ok) return failJson(res, "Page লোড হয়নি।", 404);
  const $ = cheerio.load(r.data);
  return okJson(res, {
    title: $("meta[property='og:title']").attr("content"),
    description: $("meta[property='og:description']").attr("content"),
    image: $("meta[property='og:image']").attr("content"),
    url: $("meta[property='og:url']").attr("content")
  });
});

// 20) Facebook — থাম্বনেইল
app.get("/api/facebook/thumbnail", async (req, res) => {
  const url = req.query.url;
  if (!url) return failJson(res, "URL দিন।");
  const data = await fbResolve(url);
  if (!data?.thumbnail) return failJson(res, "থাম্বনেইল পাওয়া যায়নি।", 404);
  return okJson(res, { thumbnail: data.thumbnail });
});

// 21) Facebook — অডিও এক্সট্রাক্ট (FB ভিডিও লিংক থেকে audio)
app.get("/api/facebook/audio", async (req, res) => {
  const url = req.query.url;
  if (!url) return failJson(res, "URL দিন।");
  const cobalt = await safePost("https://api.cobalt.tools/api/json",
    { url, isAudioOnly: true, aFormat: "mp3" },
    { headers: { ...buildHeaders(), "Content-Type": "application/json", "Accept": "application/json" } }
  );
  if (cobalt.ok && cobalt.data?.url) return okJson(res, { platform: "facebook", audio_url: cobalt.data.url });
  return failJson(res, "FB audio extract ব্যর্থ।", 502);
});

// 22) Facebook Watch — alias
app.get("/api/facebook/watch", async (req, res) => {
  req.url = `/api/facebook/download?url=${encodeURIComponent(req.query.url || "")}`;
  app._router.handle(req, res, () => {});
});

/* ===================================================================
   📷 INSTAGRAM ROUTES (23-30)
   =================================================================== */

async function igResolve(url) {
  // Public mirror snapinsta / igram style
  const r = await safeGet(`https://www.save-insta.app/api/ajaxSearch?q=${encodeURIComponent(url)}`, {
    headers: buildHeaders("https://www.save-insta.app")
  });
  if (r.ok && r.data) return r.data;
  // Fallback: page scrape
  const page = await safeGet(url + "?__a=1&__d=dis", { headers: buildHeaders() });
  if (page.ok && typeof page.data === "object") return page.data;
  return null;
}

// 23) Instagram — পোস্ট ডাউনলোড (ভিডিও/লুক সহ)
app.get("/api/instagram/post", async (req, res) => {
  const url = req.query.url;
  if (!url) return failJson(res, "Post URL দিন।");
  const page = await safeGet(url, { headers: buildHeaders() });
  if (!page.ok) return failJson(res, "পোস্ট লোড হয়নি।", 404);
  const $ = cheerio.load(page.data);
  return okJson(res, {
    platform: "instagram",
    title: $("meta[property='og:title']").attr("content"),
    description: $("meta[property='og:description']").attr("content"),
    image: $("meta[property='og:image']").attr("content"),
    video: $("meta[property='og:video']").attr("content") ||
           $("meta[property='og:video:url']").attr("content"),
    url: $("meta[property='og:url']").attr("content")
  });
});

// 24) Instagram — Reels
app.get("/api/instagram/reels", async (req, res) => {
  req.url = `/api/instagram/post?url=${encodeURIComponent(req.query.url || "")}`;
  app._router.handle(req, res, () => {});
});

// 25) Instagram — IGTV alias
app.get("/api/instagram/igtv", async (req, res) => {
  req.url = `/api/instagram/post?url=${encodeURIComponent(req.query.url || "")}`;
  app._router.handle(req, res, () => {});
});

// 26) Instagram — ষ্টোরি ডাউনলোড (cobalt fallback)
app.get("/api/instagram/story", async (req, res) => {
  const url = req.query.url;
  if (!url) return failJson(res, "Story URL দিন।");
  const cobalt = await safePost("https://api.cobalt.tools/api/json",
    { url },
    { headers: { ...buildHeaders(), "Content-Type": "application/json", "Accept": "application/json" } }
  );
  if (cobalt.ok && cobalt.data?.url) return okJson(res, { platform: "instagram_story", download_url: cobalt.data.url });
  return failJson(res, "Story পাওয়া যায়নি (সাধারণত লগইন দরকার)।", 502);
});

// 27) Instagram — প্রোফাইল ইনফো (public)
app.get("/api/instagram/profile", async (req, res) => {
  const username = (req.query.username || "").replace("@", "");
  if (!username) return failJson(res, "username দিন।");
  const r = await safeGet(`https://www.instagram.com/${username}/`, {
    headers: { ...buildHeaders(), "User-Agent": UA_MOBILE }
  });
  if (!r.ok) return failJson(res, "প্রোফাইল পাওয়া যায়নি।", 404);
  const $ = cheerio.load(r.data);
  return okJson(res, {
    username,
    title: $("meta[property='og:title']").attr("content"),
    description: $("meta[property='og:description']").attr("content"),
    avatar: $("meta[property='og:image']").attr("content")
  });
});

// 28) Instagram — প্রোফাইল পিকচার HD
app.get("/api/instagram/dp", async (req, res) => {
  const username = (req.query.username || "").replace("@", "");
  if (!username) return failJson(res, "username দিন।");
  const r = await safeGet(`https://www.instagram.com/${username}/`, {
    headers: { ...buildHeaders(), "User-Agent": UA_MOBILE }
  });
  if (!r.ok) return failJson(res, "প্রোফাইল পাওয়া যায়নি।", 404);
  const $ = cheerio.load(r.data);
  return okJson(res, { username, avatar_hd: $("meta[property='og:image']").attr("content") });
});

// 29) Instagram — হ্যাশট্যাগ পেজ info
app.get("/api/instagram/hashtag", async (req, res) => {
  const tag = req.query.tag;
  if (!tag) return failJson(res, "tag দিন।");
  const r = await safeGet(`https://www.instagram.com/explore/tags/${encodeURIComponent(tag)}/`, {
    headers: buildHeaders()
  });
  if (!r.ok) return failJson(res, "hashtag পাওয়া যায়নি।", 404);
  const $ = cheerio.load(r.data);
  return okJson(res, {
    tag,
    title: $("meta[property='og:title']").attr("content"),
    description: $("meta[property='og:description']").attr("content"),
    image: $("meta[property='og:image']").attr("content")
  });
});

// 30) Instagram — ম্যানুয়াল carousel সাপোর্ট (cobalt route)
app.get("/api/instagram/carousel", async (req, res) => {
  const url = req.query.url;
  if (!url) return failJson(res, "URL দিন।");
  const cobalt = await safePost("https://api.cobalt.tools/api/json",
    { url, dubLang: false },
    { headers: { ...buildHeaders(), "Content-Type": "application/json", "Accept": "application/json" } }
  );
  if (cobalt.ok && cobalt.data) return okJson(res, { platform: "instagram_carousel", ...cobalt.data });
  return failJson(res, "Carousel পাওয়া যায়নি।", 502);
});

/* ===================================================================
   🐦 TWITTER / X ROUTES (31-34)
   =================================================================== */

// 31) Twitter — টুইট ভিডিও ডাউনলোড
app.get("/api/twitter/download", async (req, res) => {
  const url = req.query.url;
  if (!url) return failJson(res, "Tweet URL দিন।");
  const cobalt = await safePost("https://api.cobalt.tools/api/json",
    { url },
    { headers: { ...buildHeaders(), "Content-Type": "application/json", "Accept": "application/json" } }
  );
  if (cobalt.ok && cobalt.data?.url) {
    return okJson(res, {
      platform: "twitter",
      download_url: cobalt.data.url,
      type: cobalt.data.type,
      status: cobalt.data.status
    });
  }
  return failJson(res, "Twitter ভিডিও পাওয়া যায়নি।", 502);
});

// 32) Twitter — টুইট oEmbed
app.get("/api/twitter/oembed", async (req, res) => {
  const url = req.query.url;
  if (!url) return failJson(res, "URL দিন।");
  const r = await safeGet(`https://publish.twitter.com/oembed?url=${encodeURIComponent(url)}`);
  if (!r.ok) return failJson(res, "oEmbed পাওয়া যায়নি।", 404);
  return okJson(res, r.data);
});

// 33) Twitter — ইমেজ/GIF মিডিয়া (cobalt)
app.get("/api/twitter/media", async (req, res) => {
  req.url = `/api/twitter/download?url=${encodeURIComponent(req.query.url || "")}`;
  app._router.handle(req, res, () => {});
});

// 34) Twitter — চেক একাউন্ট (basic OG)
app.get("/api/twitter/profile", async (req, res) => {
  const username = (req.query.username || "").replace("@", "");
  if (!username) return failJson(res, "username দিন।");
  const r = await safeGet(`https://nitter.net/${username}`, { headers: buildHeaders() });
  if (!r.ok) return failJson(res, "প্রোফাইল পাওয়া যায়নি।", 404);
  const $ = cheerio.load(r.data);
  return okJson(res, {
    platform: "twitter",
    username,
    full_name: $(".profile-card-fullname").text().trim(),
    bio: $(".profile-bio").text().trim(),
    avatar: $(".profile-card-avatar img").attr("src"),
    followers: $(".profile-stat-num").eq(2).text().trim()
  });
});

/* ===================================================================
   📌 PINTEREST ROUTES (35-37)
   =================================================================== */

// 35) Pinterest — পিন ডাউনলোড (image / video)
app.get("/api/pinterest/download", async (req, res) => {
  const url = req.query.url;
  if (!url) return failJson(res, "Pin URL দিন।");
  const page = await safeGet(url, { headers: buildHeaders() });
  if (!page.ok) return failJson(res, "Pin লোড হয়নি।", 404);
  const $ = cheerio.load(page.data);
  const image = $("meta[property='og:image']").attr("content");
  const video = $("meta[property='og:video']").attr("content");
  const title = $("meta[property='og:title']").attr("content");
  const desc = $("meta[property='og:description']").attr("content");
  if (!image && !video) return failJson(res, "মিডিয়া পাওয়া যায়নি।", 404);
  // Pinterest HD trick: replace /236x/ দিয়ে /originals/
  const hd_image = image ? image.replace(/\/\d+x\//, "/originals/") : null;
  return okJson(res, {
    platform: "pinterest",
    title,
    description: desc,
    image,
    image_hd: hd_image,
    video_url: video
  });
});

// 36) Pinterest — বোর্ড info
app.get("/api/pinterest/board", async (req, res) => {
  const url = req.query.url;
  if (!url) return failJson(res, "Board URL দিন।");
  const r = await safeGet(url, { headers: buildHeaders() });
  if (!r.ok) return failJson(res, "Board পাওয়া যায়নি।", 404);
  const $ = cheerio.load(r.data);
  return okJson(res, {
    title: $("meta[property='og:title']").attr("content"),
    description: $("meta[property='og:description']").attr("content"),
    image: $("meta[property='og:image']").attr("content")
  });
});

// 37) Pinterest — সার্চ
app.get("/api/pinterest/search", async (req, res) => {
  const q = req.query.q;
  if (!q) return failJson(res, "q দিন।");
  const r = await safeGet(`https://www.pinterest.com/search/pins/?q=${encodeURIComponent(q)}`, {
    headers: buildHeaders()
  });
  if (!r.ok) return failJson(res, "সার্চ ফেইল।", 502);
  const $ = cheerio.load(r.data);
  const images = [];
  $("img").each((_, el) => {
    const src = $(el).attr("src");
    if (src && src.includes("pinimg.com")) images.push(src);
  });
  return okJson(res, { query: q, total: images.length, images: images.slice(0, 30) });
});

/* ===================================================================
   🔴 REDDIT ROUTES (38-40)
   =================================================================== */

// 38) Reddit — পোস্ট ডাউনলোড (.json API)
app.get("/api/reddit/download", async (req, res) => {
  const url = req.query.url;
  if (!url) return failJson(res, "Post URL দিন।");
  const jsonUrl = url.endsWith("/") ? url + ".json" : url + "/.json";
  const r = await safeGet(jsonUrl, { headers: buildHeaders() });
  if (!r.ok || !Array.isArray(r.data)) return failJson(res, "Reddit পোস্ট পাওয়া যায়নি।", 404);
  const post = r.data[0]?.data?.children?.[0]?.data;
  if (!post) return failJson(res, "Post data পাওয়া যায়নি।", 404);
  const videoUrl = post.media?.reddit_video?.fallback_url ||
                   post.secure_media?.reddit_video?.fallback_url;
  return okJson(res, {
    platform: "reddit",
    title: post.title,
    author: post.author,
    subreddit: post.subreddit_name_prefixed,
    score: post.score,
    comments: post.num_comments,
    thumbnail: post.thumbnail,
    image_url: post.url_overridden_by_dest,
    video_url: videoUrl,
    is_video: post.is_video
  });
});

// 39) Reddit — subreddit top পোস্ট
app.get("/api/reddit/subreddit", async (req, res) => {
  const sub = req.query.sub;
  if (!sub) return failJson(res, "sub দিন।");
  const r = await safeGet(`https://www.reddit.com/r/${sub}/top.json?limit=25`, { headers: buildHeaders() });
  if (!r.ok) return failJson(res, "subreddit পাওয়া যায়নি।", 404);
  const posts = (r.data.data?.children || []).map(c => ({
    title: c.data.title,
    score: c.data.score,
    comments: c.data.num_comments,
    url: "https://reddit.com" + c.data.permalink,
    thumbnail: c.data.thumbnail
  }));
  return okJson(res, { sub, total: posts.length, posts });
});

// 40) Reddit — ইউজার about
app.get("/api/reddit/user", async (req, res) => {
  const user = req.query.user;
  if (!user) return failJson(res, "user দিন।");
  const r = await safeGet(`https://www.reddit.com/user/${user}/about.json`, { headers: buildHeaders() });
  if (!r.ok) return failJson(res, "ইউজার পাওয়া যায়নি।", 404);
  const u = r.data.data;
  return okJson(res, {
    name: u.name,
    karma: u.total_karma,
    link_karma: u.link_karma,
    comment_karma: u.comment_karma,
    created: new Date(u.created_utc * 1000).toDateString(),
    avatar: u.icon_img
  });
});

/* ===================================================================
   👻 SNAPCHAT (41-42)
   =================================================================== */

// 41) Snapchat — spotlight/story ডাউনলোড
app.get("/api/snapchat/download", async (req, res) => {
  const url = req.query.url;
  if (!url) return failJson(res, "Snap URL দিন।");
  const r = await safeGet(url, { headers: buildHeaders() });
  if (!r.ok) return failJson(res, "Snap লোড হয়নি।", 404);
  const $ = cheerio.load(r.data);
  return okJson(res, {
    platform: "snapchat",
    title: $("meta[property='og:title']").attr("content"),
    image: $("meta[property='og:image']").attr("content"),
    video: $("meta[property='og:video']").attr("content") ||
           $("meta[property='og:video:url']").attr("content")
  });
});

// 42) Snapchat — spotlight alias
app.get("/api/snapchat/spotlight", async (req, res) => {
  req.url = `/api/snapchat/download?url=${encodeURIComponent(req.query.url || "")}`;
  app._router.handle(req, res, () => {});
});

/* ===================================================================
   💼 LINKEDIN, THREADS, TUMBLR (43-46)
   =================================================================== */

// 43) LinkedIn — পোস্ট / ভিডিও
app.get("/api/linkedin/download", async (req, res) => {
  const url = req.query.url;
  if (!url) return failJson(res, "LinkedIn URL দিন।");
  const r = await safeGet(url, { headers: buildHeaders() });
  if (!r.ok) return failJson(res, "Post পাওয়া যায়নি।", 404);
  const $ = cheerio.load(r.data);
  return okJson(res, {
    platform: "linkedin",
    title: $("meta[property='og:title']").attr("content"),
    description: $("meta[property='og:description']").attr("content"),
    image: $("meta[property='og:image']").attr("content"),
    video: $("meta[property='og:video']").attr("content")
  });
});

// 44) Threads — পোস্ট ডাউনলোড
app.get("/api/threads/download", async (req, res) => {
  const url = req.query.url;
  if (!url) return failJson(res, "Threads URL দিন।");
  const r = await safeGet(url, { headers: buildHeaders() });
  if (!r.ok) return failJson(res, "Threads পোস্ট পাওয়া যায়নি।", 404);
  const $ = cheerio.load(r.data);
  return okJson(res, {
    platform: "threads",
    title: $("meta[property='og:title']").attr("content"),
    description: $("meta[property='og:description']").attr("content"),
    image: $("meta[property='og:image']").attr("content"),
    video: $("meta[property='og:video']").attr("content")
  });
});

// 45) Tumblr — পোস্ট info
app.get("/api/tumblr/download", async (req, res) => {
  const url = req.query.url;
  if (!url) return failJson(res, "Tumblr URL দিন।");
  const r = await safeGet(url, { headers: buildHeaders() });
  if (!r.ok) return failJson(res, "পোস্ট পাওয়া যায়নি।", 404);
  const $ = cheerio.load(r.data);
  return okJson(res, {
    platform: "tumblr",
    title: $("meta[property='og:title']").attr("content"),
    description: $("meta[property='og:description']").attr("content"),
    image: $("meta[property='og:image']").attr("content"),
    video: $("meta[property='og:video']").attr("content")
  });
});

// 46) VK — video info
app.get("/api/vk/download", async (req, res) => {
  const url = req.query.url;
  if (!url) return failJson(res, "VK URL দিন।");
  const cobalt = await safePost("https://api.cobalt.tools/api/json",
    { url },
    { headers: { ...buildHeaders(), "Content-Type": "application/json", "Accept": "application/json" } }
  );
  if (cobalt.ok && cobalt.data?.url) return okJson(res, { platform: "vk", download_url: cobalt.data.url });
  return failJson(res, "VK ভিডিও পাওয়া যায়নি।", 502);
});

/* ===================================================================
   🎬 VIMEO, DAILYMOTION, RUMBLE, BILIBILI, OK.RU (47-52)
   =================================================================== */

// 47) Vimeo — oEmbed + download (cobalt)
app.get("/api/vimeo/download", async (req, res) => {
  const url = req.query.url;
  if (!url) return failJson(res, "Vimeo URL দিন।");
  const oembed = await safeGet(`https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`);
  const info = oembed.ok ? oembed.data : {};
  const cobalt = await safePost("https://api.cobalt.tools/api/json",
    { url },
    { headers: { ...buildHeaders(), "Content-Type": "application/json", "Accept": "application/json" } }
  );
  return okJson(res, {
    platform: "vimeo",
    title: info.title,
    author: info.author_name,
    thumbnail: info.thumbnail_url,
    duration: info.duration,
    download_url: cobalt.ok ? cobalt.data?.url : null
  });
});

// 48) Dailymotion — download
app.get("/api/dailymotion/download", async (req, res) => {
  const url = req.query.url;
  if (!url) return failJson(res, "Dailymotion URL দিন।");
  const cobalt = await safePost("https://api.cobalt.tools/api/json",
    { url },
    { headers: { ...buildHeaders(), "Content-Type": "application/json", "Accept": "application/json" } }
  );
  if (cobalt.ok && cobalt.data?.url) return okJson(res, { platform: "dailymotion", download_url: cobalt.data.url });
  return failJson(res, "Dailymotion ভিডিও পাওয়া যায়নি।", 502);
});

// 49) Rumble — og scrape
app.get("/api/rumble/download", async (req, res) => {
  const url = req.query.url;
  if (!url) return failJson(res, "Rumble URL দিন।");
  const r = await safeGet(url, { headers: buildHeaders() });
  if (!r.ok) return failJson(res, "Rumble লোড হয়নি।", 404);
  const $ = cheerio.load(r.data);
  return okJson(res, {
    platform: "rumble",
    title: $("meta[property='og:title']").attr("content"),
    image: $("meta[property='og:image']").attr("content"),
    video: $("meta[property='og:video']").attr("content") ||
           $("meta[property='og:video:url']").attr("content")
  });
});

// 50) Bilibili — video info (public API)
app.get("/api/bilibili/info", async (req, res) => {
  const bvid = req.query.bvid;
  if (!bvid) return failJson(res, "bvid দিন (যেমন BV1xx411xxxx)।");
  const r = await safeGet(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`, {
    headers: buildHeaders("https://www.bilibili.com")
  });
  if (!r.ok || r.data?.code !== 0) return failJson(res, "ভিডিও পাওয়া যায়নি।", 404);
  const v = r.data.data;
  return okJson(res, {
    platform: "bilibili",
    bvid: v.bvid,
    title: v.title,
    description: v.desc,
    thumbnail: v.pic,
    duration: v.duration,
    views: v.stat?.view,
    likes: v.stat?.like,
    author: v.owner?.name
  });
});

// 51) OK.ru — cobalt
app.get("/api/okru/download", async (req, res) => {
  const url = req.query.url;
  if (!url) return failJson(res, "OK.ru URL দিন।");
  const cobalt = await safePost("https://api.cobalt.tools/api/json",
    { url },
    { headers: { ...buildHeaders(), "Content-Type": "application/json", "Accept": "application/json" } }
  );
  if (cobalt.ok && cobalt.data?.url) return okJson(res, { platform: "okru", download_url: cobalt.data.url });
  return failJson(res, "OK.ru ভিডিও পাওয়া যায়নি।", 502);
});

// 52) Twitch — clip / vod via cobalt
app.get("/api/twitch/download", async (req, res) => {
  const url = req.query.url;
  if (!url) return failJson(res, "Twitch URL দিন।");
  const cobalt = await safePost("https://api.cobalt.tools/api/json",
    { url },
    { headers: { ...buildHeaders(), "Content-Type": "application/json", "Accept": "application/json" } }
  );
  if (cobalt.ok && cobalt.data?.url) return okJson(res, { platform: "twitch", download_url: cobalt.data.url });
  return failJson(res, "Twitch clip পাওয়া যায়নি।", 502);
});

/* ===================================================================
   🎶 SOUNDCLOUD, SPOTIFY, AUDIO PLATFORMS (53-56)
   =================================================================== */

// 53) SoundCloud — download (cobalt)
app.get("/api/soundcloud/download", async (req, res) => {
  const url = req.query.url;
  if (!url) return failJson(res, "SoundCloud URL দিন।");
  const cobalt = await safePost("https://api.cobalt.tools/api/json",
    { url, isAudioOnly: true, aFormat: "mp3" },
    { headers: { ...buildHeaders(), "Content-Type": "application/json", "Accept": "application/json" } }
  );
  if (cobalt.ok && cobalt.data?.url) return okJson(res, { platform: "soundcloud", audio_url: cobalt.data.url });
  return failJson(res, "SoundCloud ট্র্যাক পাওয়া যায়নি।", 502);
});

// 54) SoundCloud — oEmbed info
app.get("/api/soundcloud/info", async (req, res) => {
  const url = req.query.url;
  if (!url) return failJson(res, "URL দিন।");
  const r = await safeGet(`https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(url)}`);
  if (!r.ok) return failJson(res, "info পাওয়া যায়নি।", 404);
  return okJson(res, { platform: "soundcloud", ...r.data });
});

// 55) Spotify — metadata (oEmbed)
app.get("/api/spotify/info", async (req, res) => {
  const url = req.query.url;
  if (!url) return failJson(res, "Spotify URL দিন।");
  const r = await safeGet(`https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`);
  if (!r.ok) return failJson(res, "Spotify info পাওয়া যায়নি।", 404);
  return okJson(res, { platform: "spotify", ...r.data });
});

// 56) Spotify — ট্র্যাক টু YouTube search (ব্রিজ)
app.get("/api/spotify/to-youtube", async (req, res) => {
  const url = req.query.url;
  if (!url) return failJson(res, "Spotify URL দিন।");
  const info = await safeGet(`https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`);
  if (!info.ok) return failJson(res, "Spotify info পাওয়া যায়নি।", 404);
  const q = encodeURIComponent(info.data.title);
  return okJson(res, {
    platform: "spotify",
    title: info.data.title,
    youtube_search: `https://www.youtube.com/results?search_query=${q}`,
    suggestion: "Spotify সরাসরি MP3 ডাউনলোড দেয়না — এই টাইটেলটি YouTube/api/youtube/mp3 এ ডাউনলোড করুন।"
  });
});

/* ===================================================================
   🌏 LIKEE, KWAI, IMGUR, 9GAG, BITCHUTE (57-62)
   =================================================================== */

// 57) Likee — OG scrape
app.get("/api/likee/download", async (req, res) => {
  const url = req.query.url;
  if (!url) return failJson(res, "Likee URL দিন।");
  const r = await safeGet(url, { headers: buildHeaders() });
  if (!r.ok) return failJson(res, "Likee লোড হয়নি।", 404);
  const $ = cheerio.load(r.data);
  return okJson(res, {
    platform: "likee",
    title: $("meta[property='og:title']").attr("content"),
    image: $("meta[property='og:image']").attr("content"),
    video: $("meta[property='og:video']").attr("content") ||
           $("meta[property='og:video:url']").attr("content")
  });
});

// 58) Kwai — OG scrape
app.get("/api/kwai/download", async (req, res) => {
  const url = req.query.url;
  if (!url) return failJson(res, "Kwai URL দিন।");
  const r = await safeGet(url, { headers: buildHeaders() });
  if (!r.ok) return failJson(res, "Kwai লোড হয়নি।", 404);
  const $ = cheerio.load(r.data);
  return okJson(res, {
    platform: "kwai",
    title: $("meta[property='og:title']").attr("content"),
    image: $("meta[property='og:image']").attr("content"),
    video: $("meta[property='og:video']").attr("content") ||
           $("meta[property='og:video:url']").attr("content")
  });
});

// 59) Imgur — API
app.get("/api/imgur/download", async (req, res) => {
  const url = req.query.url;
  if (!url) return failJson(res, "Imgur URL দিন।");
  const m = url.match(/imgur\.com\/(?:gallery\/|a\/)?([a-zA-Z0-9]+)/);
  if (!m) return failJson(res, "আইডি পাওয়া যায়নি।");
  const r = await safeGet(url, { headers: buildHeaders() });
  if (!r.ok) return failJson(res, "Imgur লোড হয়নি।", 404);
  const $ = cheerio.load(r.data);
  return okJson(res, {
    platform: "imgur",
    id: m[1],
    title: $("meta[property='og:title']").attr("content"),
    image: $("meta[property='og:image']").attr("content"),
    video: $("meta[property='og:video']").attr("content")
  });
});

// 60) 9GAG — OG scrape
app.get("/api/9gag/download", async (req, res) => {
  const url = req.query.url;
  if (!url) return failJson(res, "9GAG URL দিন।");
  const r = await safeGet(url, { headers: buildHeaders() });
  if (!r.ok) return failJson(res, "9GAG লোড হয়নি।", 404);
  const $ = cheerio.load(r.data);
  return okJson(res, {
    platform: "9gag",
    title: $("meta[property='og:title']").attr("content"),
    image: $("meta[property='og:image']").attr("content"),
    video: $("meta[property='og:video']").attr("content")
  });
});

// 61) BitChute — cobalt
app.get("/api/bitchute/download", async (req, res) => {
  const url = req.query.url;
  if (!url) return failJson(res, "BitChute URL দিন।");
  const cobalt = await safePost("https://api.cobalt.tools/api/json",
    { url },
    { headers: { ...buildHeaders(), "Content-Type": "application/json", "Accept": "application/json" } }
  );
  if (cobalt.ok && cobalt.data?.url) return okJson(res, { platform: "bitchute", download_url: cobalt.data.url });
  return failJson(res, "BitChute ভিডিও পাওয়া যায়নি।", 502);
});

// 62) Streamable — OG
app.get("/api/streamable/download", async (req, res) => {
  const url = req.query.url;
  if (!url) return failJson(res, "Streamable URL দিন।");
  const r = await safeGet(url, { headers: buildHeaders() });
  if (!r.ok) return failJson(res, "লোড হয়নি।", 404);
  const $ = cheerio.load(r.data);
  return okJson(res, {
    platform: "streamable",
    title: $("meta[property='og:title']").attr("content"),
    image: $("meta[property='og:image']").attr("content"),
    video: $("meta[property='og:video']").attr("content") ||
           $("meta[property='og:video:url']").attr("content")
  });
});

/* ===================================================================
   🌐 GENERIC UTILITIES (63-65)
   =================================================================== */

// 63) Generic — og:meta extractor (যেকোনো ইউআরএল)
app.get("/api/generic/og", async (req, res) => {
  const url = req.query.url;
  if (!url) return failJson(res, "URL দিন।");
  const r = await safeGet(url, { headers: buildHeaders() });
  if (!r.ok) return failJson(res, "লোড হয়নি।", 404);
  const $ = cheerio.load(r.data);
  const og = {};
  $("meta").each((_, el) => {
    const prop = $(el).attr("property") || $(el).attr("name");
    const content = $(el).attr("content");
    if (prop && content && (prop.startsWith("og:") || prop.startsWith("twitter:"))) {
      og[prop] = content;
    }
  });
  return okJson(res, { url, meta: og });
});

// 64) Generic — cobalt universal (যেকোনো সাপোর্টেড সাইট)
app.get("/api/generic/cobalt", async (req, res) => {
  const url = req.query.url;
  if (!url) return failJson(res, "URL দিন।");
  const audioOnly = String(req.query.audio || "false").toLowerCase() === "true";
  const cobalt = await safePost("https://api.cobalt.tools/api/json",
    { url, isAudioOnly: audioOnly, aFormat: "mp3" },
    { headers: { ...buildHeaders(), "Content-Type": "application/json", "Accept": "application/json" } }
  );
  if (cobalt.ok && cobalt.data) return okJson(res, { source: "cobalt", ...cobalt.data });
  return failJson(res, "ব্যর্থ।", 502);
});

// 65) Generic — URL shortener resolve (রি-ডিরেক্ট চেইন রিজল্ভ)
app.get("/api/generic/resolve", async (req, res) => {
  const url = req.query.url;
  if (!url) return failJson(res, "URL দিন।");
  try {
    const r = await axios.head(url, { maxRedirects: 10, validateStatus: () => true, timeout: 12000, headers: buildHeaders() });
    return okJson(res, { final_url: r.request?.res?.responseUrl || url, status: r.status });
  } catch (e) {
    return failJson(res, "resolve ব্যর্থ।", 502);
  }
});

/* ===================================================================
   📜 DOCS POPULATION & SERVER START
   =================================================================== */

const ALL_ROUTES = [
  ["GET", "/", "Service status"],
  ["GET", "/api/health", "Uptime & memory"],
  ["GET", "/api/docs", "This document"],
  ["GET", "/api/auto?url=", "Auto-detect platform & route"],
  ["GET", "/api/tiktok/download?url=", "TikTok video (HD, no watermark)"],
  ["GET", "/api/tiktok/user/videos?username=", "All videos of a TikTok user"],
  ["GET", "/api/tiktok/comments?url=", "TikTok comments"],
  ["GET", "/api/tiktok/user/info?username=", "TikTok profile info"],
  ["GET", "/api/tiktok/music?url=", "TikTok music/sound"],
  ["GET", "/api/tiktok/trending?region=US", "TikTok trending feed"],
  ["GET", "/api/tiktok/hashtag?tag=", "TikTok hashtag posts"],
  ["GET", "/api/tiktok/search?q=", "TikTok keyword search"],
  ["GET", "/api/youtube/info?url=", "YouTube oEmbed info"],
  ["GET", "/api/youtube/download?url=", "YouTube video downloader"],
  ["GET", "/api/youtube/mp3?url=", "YouTube to MP3"],
  ["GET", "/api/youtube/search?q=", "YouTube search"],
  ["GET", "/api/youtube/channel?id|username=", "YouTube channel info"],
  ["GET", "/api/youtube/thumbnail?url=", "YouTube thumbnails (all sizes)"],
  ["GET", "/api/youtube/shorts?url=", "YouTube Shorts download"],
  ["GET", "/api/facebook/download?url=", "Facebook video downloader"],
  ["GET", "/api/facebook/reels?url=", "Facebook Reels"],
  ["GET", "/api/facebook/story?url=", "Facebook story"],
  ["GET", "/api/facebook/page?url=", "Facebook page meta"],
  ["GET", "/api/facebook/thumbnail?url=", "Facebook video thumbnail"],
  ["GET", "/api/facebook/audio?url=", "Facebook video audio (mp3)"],
  ["GET", "/api/facebook/watch?url=", "Facebook watch alias"],
  ["GET", "/api/instagram/post?url=", "Instagram post / video"],
  ["GET", "/api/instagram/reels?url=", "Instagram Reels"],
  ["GET", "/api/instagram/igtv?url=", "Instagram IGTV"],
  ["GET", "/api/instagram/story?url=", "Instagram story"],
  ["GET", "/api/instagram/profile?username=", "Instagram profile info"],
  ["GET", "/api/instagram/dp?username=", "Instagram profile picture HD"],
  ["GET", "/api/instagram/hashtag?tag=", "Instagram hashtag info"],
  ["GET", "/api/instagram/carousel?url=", "Instagram carousel"],
  ["GET", "/api/twitter/download?url=", "Twitter / X video downloader"],
  ["GET", "/api/twitter/oembed?url=", "Twitter oEmbed"],
  ["GET", "/api/twitter/media?url=", "Twitter media (image/gif)"],
  ["GET", "/api/twitter/profile?username=", "Twitter profile (via nitter)"],
  ["GET", "/api/pinterest/download?url=", "Pinterest pin (image HD / video)"],
  ["GET", "/api/pinterest/board?url=", "Pinterest board info"],
  ["GET", "/api/pinterest/search?q=", "Pinterest search"],
  ["GET", "/api/reddit/download?url=", "Reddit post download"],
  ["GET", "/api/reddit/subreddit?sub=", "Reddit subreddit top posts"],
  ["GET", "/api/reddit/user?user=", "Reddit user profile"],
  ["GET", "/api/snapchat/download?url=", "Snapchat spotlight/story"],
  ["GET", "/api/snapchat/spotlight?url=", "Snapchat spotlight alias"],
  ["GET", "/api/linkedin/download?url=", "LinkedIn post/video"],
  ["GET", "/api/threads/download?url=", "Threads post"],
  ["GET", "/api/tumblr/download?url=", "Tumblr post"],
  ["GET", "/api/vk/download?url=", "VK video"],
  ["GET", "/api/vimeo/download?url=", "Vimeo video"],
  ["GET", "/api/dailymotion/download?url=", "Dailymotion video"],
  ["GET", "/api/rumble/download?url=", "Rumble video"],
  ["GET", "/api/bilibili/info?bvid=", "Bilibili video info"],
  ["GET", "/api/okru/download?url=", "OK.ru video"],
  ["GET", "/api/twitch/download?url=", "Twitch clip/vod"],
  ["GET", "/api/soundcloud/download?url=", "SoundCloud track mp3"],
  ["GET", "/api/soundcloud/info?url=", "SoundCloud oEmbed info"],
  ["GET", "/api/spotify/info?url=", "Spotify track info"],
  ["GET", "/api/spotify/to-youtube?url=", "Spotify to YouTube bridge"],
  ["GET", "/api/likee/download?url=", "Likee video"],
  ["GET", "/api/kwai/download?url=", "Kwai video"],
  ["GET", "/api/imgur/download?url=", "Imgur image/video"],
  ["GET", "/api/9gag/download?url=", "9GAG post"],
  ["GET", "/api/bitchute/download?url=", "BitChute video"],
  ["GET", "/api/streamable/download?url=", "Streamable video"],
  ["GET", "/api/generic/og?url=", "Generic OG/Twitter meta extractor"],
  ["GET", "/api/generic/cobalt?url=&audio=true|false", "Generic cobalt universal downloader"],
  ["GET", "/api/generic/resolve?url=", "Resolve short URL / redirect chain"]
];
ALL_ROUTES.forEach(r => ENDPOINT_DOCS.push({ method: r[0], path: r[1], description: r[2] }));

/* 404 হ্যান্ডলার */
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: "Endpoint not found.",
    hint: "এন্ডপয়েন্টের সম্পূর্ণ তালিকার জন্য /api/docs দেখুন।"
  });
});

/* Global error হ্যান্ডলার */
app.use((err, _req, res, _next) => {
  console.error("[ERR]", err.message);
  res.status(500).json({ success: false, error: "Internal server error." });
});

/* Server start */
app.listen(PORT, () => {
  console.log(`🚀 Ultimate Social Downloader API v2.0 running on port ${PORT}`);
  console.log(`📖 Docs: http://localhost:${PORT}/api/docs`);
  console.log(`✅ Total endpoints: ${ALL_ROUTES.length}`);
});

module.exports = { app };
