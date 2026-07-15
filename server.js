const express = require("express");
const cors    = require("cors");
const axios   = require("axios");

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

/* ═══════════════════════════════════════════════════════════════
   COMMON HEADERS
   ═══════════════════════════════════════════════════════════════ */
const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
    "AppleWebKit/537.36 (KHTML, like Gecko) " +
    "Chrome/124.0.0.0 Safari/537.36",
  "Accept":          "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
};

const MOBILE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) " +
  "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 " +
  "Mobile/15E148 Safari/604.1";

/* ═══════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════ */
function getDateInfo(timestamp) {
  const creationDate = new Date(timestamp * 1000);
  const now          = new Date();
  const diffMs       = now - creationDate;
  const diffDays     = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffYears    = Math.floor(diffDays / 365);
  const diffMonths   = Math.floor((diffDays % 365) / 30);
  return {
    creationDate:      creationDate.toDateString(),
    creationTimestamp: timestamp,
    accountAge:        `${diffYears} years, ${diffMonths} months`,
    accountAgeDays:    diffDays,
  };
}

function detectPlatform(url) {
  if (!url) return null;
  const u = url.toLowerCase();
  if (u.includes("tiktok.com") || u.includes("vm.tiktok") || u.includes("vt.tiktok")) return "tiktok";
  if (u.includes("instagram.com") || u.includes("instagr.am")) return "instagram";
  if (u.includes("facebook.com") || u.includes("fb.watch") || u.includes("fb.com")) return "facebook";
  if (u.includes("youtube.com") || u.includes("youtu.be")) return "youtube";
  return null;
}

/* ═══════════════════════════════════════════════════════════════
   1) TIKTOK - PROFILE INFO (আপনার আগের কোড রাখা হয়েছে)
   ═══════════════════════════════════════════════════════════════ */
function buildTikTokApiUrl(username) {
  return (
    `https://www.tiktok.com/api/user/detail/` +
    `?uniqueId=${encodeURIComponent(username)}` +
    `&aid=1988&app_name=tiktok_web&device_platform=web_pc&region=US` +
    `&os=windows&browserLanguage=en-US&browserPlatform=Win32` +
    `&browserName=Mozilla&browserVersion=5.0` +
    `&webIdLastTime=${Math.floor(Date.now() / 1000)}`
  );
}

app.get("/tiktok/:username", async (req, res) => {
  const { username } = req.params;
  try {
    const r = await axios.get(buildTikTokApiUrl(username), {
      timeout: 14000,
      headers: {
        ...BROWSER_HEADERS,
        "Referer": "https://www.tiktok.com/",
        "Origin":  "https://www.tiktok.com",
      },
    });
    const u = r.data?.userInfo?.user;
    const s = r.data?.userInfo?.stats;
    if (u?.uniqueId) {
      const dateInfo = u.createTime ? getDateInfo(u.createTime) : {};
      return res.json({
        success: true,
        username: u.uniqueId,
        nickname: u.nickname,
        avatar:   u.avatarLarger,
        bio:      u.signature,
        verified: u.verified,
        followers: s?.followerCount ?? null,
        following: s?.followingCount ?? null,
        likes:     s?.heartCount ?? null,
        videos:    s?.videoCount ?? null,
        ...dateInfo,
      });
    }
  } catch (e) {
    console.log("TikTok profile failed:", e.message);
  }
  return res.status(404).json({ success: false, error: "TikTok user not found" });
});

/* ═══════════════════════════════════════════════════════════════
   2) TIKTOK - VIDEO DOWNLOADER
   ═══════════════════════════════════════════════════════════════ */
async function downloadTikTok(videoUrl) {
  // TikWM public API - no watermark
  const r = await axios.post(
    "https://www.tikwm.com/api/",
    new URLSearchParams({ url: videoUrl, hd: "1" }),
    { timeout: 15000, headers: BROWSER_HEADERS }
  );
  const d = r.data?.data;
  if (!d) throw new Error("TikTok fetch failed");
  return {
    success:  true,
    platform: "tiktok",
    title:    d.title,
    author:   d.author?.nickname,
    thumbnail:d.cover,
    duration: d.duration,
    downloads: [
      { quality: "HD (No Watermark)", url: d.hdplay || d.play },
      { quality: "SD (No Watermark)", url: d.play },
      { quality: "With Watermark",    url: d.wmplay },
      { quality: "Audio (MP3)",       url: d.music },
    ].filter(x => x.url),
  };
}

/* ═══════════════════════════════════════════════════════════════
   3) INSTAGRAM - REELS/POSTS DOWNLOADER
   ═══════════════════════════════════════════════════════════════ */
async function downloadInstagram(videoUrl) {
  // Method 1: Instagram's own oEmbed + GraphQL public endpoint
  const shortcodeMatch = videoUrl.match(/(?:reel|p|reels|tv)\/([A-Za-z0-9_-]+)/);
  if (!shortcodeMatch) throw new Error("Invalid Instagram URL");
  const shortcode = shortcodeMatch[1];

  try {
    const r = await axios.get(
      `https://www.instagram.com/p/${shortcode}/?__a=1&__d=dis`,
      {
        timeout: 15000,
        headers: {
          ...BROWSER_HEADERS,
          "User-Agent": MOBILE_UA,
          "X-IG-App-ID": "936619743392459",
        },
      }
    );
    const item = r.data?.items?.[0] || r.data?.graphql?.shortcode_media;
    if (item) {
      const videoUrls = [];
      if (item.video_versions) {
        item.video_versions.forEach(v => videoUrls.push({ quality: `${v.width}x${v.height}`, url: v.url }));
      } else if (item.video_url) {
        videoUrls.push({ quality: "Default", url: item.video_url });
      }
      return {
        success:  true,
        platform: "instagram",
        title:    item.caption?.text || item.edge_media_to_caption?.edges?.[0]?.node?.text || "",
        author:   item.user?.username || item.owner?.username,
        thumbnail:item.image_versions2?.candidates?.[0]?.url || item.display_url,
        downloads: videoUrls,
      };
    }
  } catch (_) {}

  // Method 2: Fallback via SnapInsta-style public scraper
  try {
    const r = await axios.get(
      `https://api.instagram.com/oembed/?url=${encodeURIComponent(videoUrl)}`,
      { timeout: 10000, headers: BROWSER_HEADERS }
    );
    if (r.data?.thumbnail_url) {
      return {
        success:  true,
        platform: "instagram",
        title:    r.data.title || "",
        author:   r.data.author_name,
        thumbnail:r.data.thumbnail_url,
        downloads: [],
        note: "Public API only returned metadata. Video URL fetch requires login-based scraping.",
      };
    }
  } catch (_) {}

  throw new Error("Instagram fetch failed - may be private or removed");
}

/* ═══════════════════════════════════════════════════════════════
   4) FACEBOOK - VIDEO DOWNLOADER
   ═══════════════════════════════════════════════════════════════ */
async function downloadFacebook(videoUrl) {
  const r = await axios.get(videoUrl, {
    timeout: 15000,
    headers: { ...BROWSER_HEADERS, "User-Agent": MOBILE_UA },
  });
  const html = r.data;

  // Extract HD & SD video URLs from Facebook's HTML
  const hdMatch = html.match(/"browser_native_hd_url":"([^"]+)"/) ||
                  html.match(/"playable_url_quality_hd":"([^"]+)"/);
  const sdMatch = html.match(/"browser_native_sd_url":"([^"]+)"/) ||
                  html.match(/"playable_url":"([^"]+)"/);
  const titleMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/);
  const thumbMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/);

  const clean = (u) => u ? u.replace(/\\u0025/g, "%").replace(/\\\//g, "/").replace(/\\u0026/g, "&") : null;

  const downloads = [];
  if (hdMatch) downloads.push({ quality: "HD", url: clean(hdMatch[1]) });
  if (sdMatch) downloads.push({ quality: "SD", url: clean(sdMatch[1]) });

  if (downloads.length === 0) throw new Error("Facebook video URL not found - may be private");

  return {
    success:  true,
    platform: "facebook",
    title:    titleMatch ? titleMatch[1] : "",
    thumbnail:thumbMatch ? thumbMatch[1] : null,
    downloads,
  };
}

/* ═══════════════════════════════════════════════════════════════
   5) YOUTUBE - VIDEO DOWNLOADER (Metadata + stream URLs)
   ═══════════════════════════════════════════════════════════════ */
function extractYouTubeId(url) {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/|youtube\.com\/embed\/)([A-Za-z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

async function downloadYouTube(videoUrl) {
  const videoId = extractYouTubeId(videoUrl);
  if (!videoId) throw new Error("Invalid YouTube URL");

  // Use YouTube's internal player API (Android client - most reliable)
  const payload = {
    context: {
      client: {
        clientName: "ANDROID",
        clientVersion: "19.09.37",
        androidSdkVersion: 30,
        hl: "en",
        gl: "US",
      },
    },
    videoId,
    params: "CgIQBg==",
  };

  const r = await axios.post(
    "https://www.youtube.com/youtubei/v1/player?key=AIzaSyA8eiZmM1FaDVjRy-df2KTyQ_vz_yYM39w",
    payload,
    {
      timeout: 15000,
      headers: {
        "User-Agent": "com.google.android.youtube/19.09.37 (Linux; U; Android 11) gzip",
        "Content-Type": "application/json",
      },
    }
  );

  const data = r.data;
  const details = data.videoDetails;
  if (!details) throw new Error("YouTube video not found or age-restricted");

  const formats = [
    ...(data.streamingData?.formats || []),
    ...(data.streamingData?.adaptiveFormats || []),
  ];

  const downloads = formats
    .filter(f => f.url)
    .map(f => ({
      quality:  f.qualityLabel || f.audioQuality || f.quality,
      mimeType: f.mimeType?.split(";")[0],
      hasAudio: !!f.audioChannels,
      hasVideo: !!f.width,
      size:     f.contentLength ? `${(f.contentLength/1024/1024).toFixed(2)} MB` : null,
      url:      f.url,
    }));

  return {
    success:   true,
    platform:  "youtube",
    videoId,
    title:     details.title,
    author:    details.author,
    duration:  parseInt(details.lengthSeconds),
    views:     parseInt(details.viewCount),
    thumbnail: details.thumbnail?.thumbnails?.slice(-1)[0]?.url,
    downloads,
  };
}

/* ═══════════════════════════════════════════════════════════════
   UNIFIED DOWNLOAD ROUTE
   POST /download   { "url": "https://..." }
   GET  /download?url=https://...
   ═══════════════════════════════════════════════════════════════ */
async function handleDownload(url, res) {
  if (!url) return res.status(400).json({ success: false, error: "URL is required" });

  const platform = detectPlatform(url);
  if (!platform) {
    return res.status(400).json({
      success: false,
      error:   "Unsupported platform. Supported: TikTok, Instagram, Facebook, YouTube",
    });
  }

  try {
    let result;
    if (platform === "tiktok")     result = await downloadTikTok(url);
    else if (platform === "instagram") result = await downloadInstagram(url);
    else if (platform === "facebook")  result = await downloadFacebook(url);
    else if (platform === "youtube")   result = await downloadYouTube(url);
    return res.json(result);
  } catch (e) {
    console.log(`${platform} download failed:`, e.message);
    return res.status(500).json({
      success:  false,
      platform,
      error:    e.message || "Download failed",
    });
  }
}

app.get("/download", (req, res) => handleDownload(req.query.url, res));
app.post("/download", (req, res) => handleDownload(req.body?.url, res));

// Platform-specific routes (backward compatibility)
app.get("/download/tiktok",    (req, res) => handleDownload(req.query.url, res));
app.get("/download/instagram", (req, res) => handleDownload(req.query.url, res));
app.get("/download/facebook",  (req, res) => handleDownload(req.query.url, res));
app.get("/download/youtube",   (req, res) => handleDownload(req.query.url, res));

/* ═══════════════════════════════════════════════════════════════
   ROOT
   ═══════════════════════════════════════════════════════════════ */
app.get("/", (req, res) => res.json({
  status: "✅ Multi-Platform Downloader API Running",
  version: "2.0.0",
  endpoints: {
    "GET  /tiktok/:username":  "TikTok profile info",
    "GET  /download?url=...":  "Auto-detect & download from any supported platform",
    "POST /download":          "Body: { url: '...' } - Auto-detect platform",
  },
  supported: ["TikTok", "Instagram", "Facebook", "YouTube"],
}));

app.listen(PORT, () => console.log(`🚀 Multi-Platform Downloader running on port ${PORT}`));
