/* ═══════════════════════════════════════════════════════════════
   TokLens — Multi-Platform Downloader API  (FULLY WORKING · 2026)
   Platforms: TikTok · Facebook · Instagram · Pinterest · YouTube
   Author: RX HASNAT  (Fixed edition)

   এই ফাইলটি পুরনো server.js এর জায়গায় বসিয়ে দিন — একই format
   ═══════════════════════════════════════════════════════════════
   কি কি ফিক্স হলো:
   ①  TikTok /download — tikwm এর Referer/Origin আলাদা করে সেট
       (tikwm.com), TikTok origin দিলে upstream reject করে।
   ②  Facebook /fb — snapsave এখন obfuscated JS দেয়; সেটাকে vm-এ
       eval করে HTML বের করে link পাওয়া যায়। fdown/getmyfb ও fixed।
   ③  Instagram /ig — snapinsta.app এখন dead; নতুন working host
       snapins.ai + saveinsta.io যোগ। igram এর নতুন schema।
   ④  Pinterest /pin — HTML regex আরও robust + pin.it resolver।
   ⑤  YouTube /yt — cobalt v10 এখন JWT chain দিয়ে auth করে;
       পুরনো /api/json মৃত। নতুন working host + oembed fallback।
   ═══════════════════════════════════════════════════════════════ */

const express = require("express");
const cors    = require("cors");
const axios   = require("axios");
const vm      = require("vm");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

/* ─── ব্রাউজার হেডার্স (Chrome 136) ─────────────────────────────── */
const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "sec-ch-ua": '"Chromium";v="136", "Google Chrome";v="136", "Not.A/Brand";v="99"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"Windows"',
  "sec-fetch-dest": "empty",
  "sec-fetch-mode": "cors",
  "sec-fetch-site": "same-origin"
};

/* tikwm এর জন্য আলাদা header — Referer/Origin অবশ্যই tikwm.com হতে হবে
   (আগের কোডে tiktok.com দেওয়া ছিল, সেজন্য tikwm reject করছিল) */
const TIKWM_HEADERS = {
  ...BROWSER_HEADERS,
  "Origin":  "https://www.tikwm.com",
  "Referer": "https://www.tikwm.com/"
};

/* ─── HTML entity decode helper ─────────────────────────────── */
function decodeHtml(str) {
  if (!str) return str;
  return String(str)
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\\\//g, '/')
    .replace(/\\u0026/g, '&');
}

/* ─── retry সহ axios GET ─────────────────────────────────────── */
async function fetchWithRetry(url, options = {}, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await axios.get(url, {
        headers: options.headers || BROWSER_HEADERS,
        timeout: options.timeout || 20000,
        maxRedirects: options.maxRedirects != null ? options.maxRedirects : 5,
        validateStatus: s => s >= 200 && s < 400
      });
      return res;
    } catch (err) {
      if (i === retries) throw err;
      await new Promise(r => setTimeout(r, 900 * (i + 1)));
    }
  }
}

/* ─── retry সহ axios POST (form) ─────────────────────────────── */
async function postWithRetry(url, form, options = {}, retries = 2) {
  const body = (typeof form === 'string') ? form : new URLSearchParams(form).toString();
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await axios.post(url, body, {
        headers: {
          ...(options.headers || BROWSER_HEADERS),
          "Content-Type": "application/x-www-form-urlencoded"
        },
        timeout: options.timeout || 25000,
        maxRedirects: options.maxRedirects != null ? options.maxRedirects : 5,
        validateStatus: s => s >= 200 && s < 400
      });
      return res;
    } catch (err) {
      if (i === retries) throw err;
      await new Promise(r => setTimeout(r, 900 * (i + 1)));
    }
  }
}

/* ─── retry সহ axios POST (json) ─────────────────────────────── */
async function postJsonWithRetry(url, jsonBody, options = {}, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await axios.post(url, jsonBody, {
        headers: {
          ...(options.headers || BROWSER_HEADERS),
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        timeout: options.timeout || 25000,
        validateStatus: s => s >= 200 && s < 400
      });
      return res;
    } catch (err) {
      if (i === retries) throw err;
      await new Promise(r => setTimeout(r, 900 * (i + 1)));
    }
  }
}

/* ─── snapsave/snapinsta obfuscated JS → HTML decoder ─────────
   snapsave/snapinsta বর্তমানে raw HTML না, obfuscated JavaScript
   (Base62/eval pattern) পাঠায়। সেটাকে সেই সাইটের DOM simulate
   করে run করলে ভেতরের actual HTML বের হয়।                       */
function decodeSnapscriptToHtml(jsCode) {
  let captured = "";
  const fake$ = () => ({
    html: h => { captured = String(h); },
    innerHTML: "",
    remove() {},
    val() { return ""; },
    hide() { return this; },
    show() { return this; },
    text() { return ""; },
    append(x) { captured += String(x); return this; }
  });
  const ctx = {
    $: fake$,
    jQuery: fake$,
    document: {
      getElementById: () => ({
        innerHTML: "",
        set innerHTML(v) { captured = String(v); },
        remove() {}
      }),
      querySelector: () => null
    },
    window:   { location: { hostname: "snapsave.app" } },
    location: { hostname: "snapsave.app" },
    console:  { log() {} }
  };
  vm.createContext(ctx);
  try {
    vm.runInContext(jsCode, ctx, { timeout: 3000 });
  } catch (_) { /* ignore */ }
  return captured;
}

/* ─── সাহায্যকারী: অ্যাকাউন্ট বয়স ────────────────────────────── */
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
    accountAgeDays: diffDays,
  };
}

function getMusicUrl(v) {
  if (typeof v.music === "string" && v.music.startsWith("http")) return v.music;
  if (v.music_info && v.music_info.play_url) return v.music_info.play_url;
  if (v.music_info && v.music_info.play) return v.music_info.play;
  return null;
}

/* ───────────────────────────────────────────────────────────────
   ১. TikTok — সিঙ্গেল ভিডিও ডাউনলোডার (/download)   [FIXED]
   ─────────────────────────────────────────────────────────────── */
app.get("/download", async (req, res) => {
  const videoUrl = req.query.url;
  if (!videoUrl) return res.status(400).json({ success: false, error: "ভিডিও URL প্রদান করুন।" });

  const attempts = [];

  /* পদ্ধতি ১: tikwm GET (সঠিক Referer/Origin দিয়ে) */
  try {
    const apiUrl = `https://www.tikwm.com/api/?url=${encodeURIComponent(videoUrl)}&hd=1`;
    const response = await fetchWithRetry(apiUrl, { headers: TIKWM_HEADERS });
    const data = response.data;
    if (data.code === 0 && data.data) {
      const v = data.data;
      const authorId = (v.author && (v.author.unique_id || v.author.uniqueId)) || v.author_unique_id || "Unknown";
      const authorName = (v.author && v.author.nickname) || v.author_nickname || "Unknown";
      return res.json({
        success: true, platform: "tiktok",
        title: v.title || "TikTok Video",
        author: authorId, author_name: authorName,
        cover_image: v.cover || v.origin_cover || null,
        download_url_no_watermark: v.play || null,
        download_url_hd: v.hdplay || v.play || null,
        music_url: getMusicUrl(v)
      });
    }
    attempts.push("tikwm GET: " + (data.msg || "unknown"));
  } catch (e) { attempts.push("tikwm GET err: " + (e.response ? e.response.status : e.code || 'net')); }

  /* পদ্ধতি ২: tikwm POST (fallback — কিছু URL এ GET আটকায়) */
  try {
    const r = await postWithRetry("https://www.tikwm.com/api/", { url: videoUrl, hd: "1" }, {
      headers: TIKWM_HEADERS
    });
    const data = r.data;
    if (data.code === 0 && data.data) {
      const v = data.data;
      const authorId = (v.author && (v.author.unique_id || v.author.uniqueId)) || v.author_unique_id || "Unknown";
      const authorName = (v.author && v.author.nickname) || v.author_nickname || "Unknown";
      return res.json({
        success: true, platform: "tiktok",
        title: v.title || "TikTok Video",
        author: authorId, author_name: authorName,
        cover_image: v.cover || v.origin_cover || null,
        download_url_no_watermark: v.play || null,
        download_url_hd: v.hdplay || v.play || null,
        music_url: getMusicUrl(v)
      });
    }
    attempts.push("tikwm POST: " + (data.msg || "unknown"));
  } catch (e) { attempts.push("tikwm POST err: " + (e.response ? e.response.status : e.code || 'net')); }

  return res.status(404).json({
    success: false,
    error: "ভিডিওর ডেটা পাওয়া যায়নি বা লিংকটি ভুল / ভিডিও ডিলিটেড।",
    debug: attempts
  });
});

/* ───────────────────────────────────────────────────────────────
   ২. TikTok — ইউজারের সব ভিডিও (/user)
   ─────────────────────────────────────────────────────────────── */
app.get("/user", async (req, res) => {
  const username = req.query.username;
  if (!username) return res.status(400).json({ success: false, error: "ইউজারনেম প্রদান করুন।" });

  const cleanUser = username.replace("@", "").trim();

  try {
    const apiUrl = `https://www.tikwm.com/api/user/posts?unique_id=${encodeURIComponent(cleanUser)}&count=50`;
    const response = await fetchWithRetry(apiUrl, { headers: TIKWM_HEADERS });
    const data = response.data;
    if (data.code === 0 && data.data) {
      const rawVideos = data.data.videos || data.data.list || [];
      if (rawVideos.length > 0) {
        const videoList = rawVideos.map(video => ({
          video_id: video.video_id || video.id || null,
          title: video.title || "No Title",
          cover_image: video.cover || video.origin_cover || null,
          views: video.play_count || video.playCount || 0,
          likes: video.digg_count || video.diggCount || 0,
          download_url_no_watermark: video.play || null
        }));
        return res.json({ success: true, username: cleanUser, total_fetched: videoList.length, videos: videoList });
      }
    }
  } catch (_) {}

  try {
    const infoUrl = `https://www.tikwm.com/api/user/info?unique_id=${encodeURIComponent(cleanUser)}`;
    const infoRes = await fetchWithRetry(infoUrl, { headers: TIKWM_HEADERS });
    const infoData = infoRes.data;
    if (infoData.code === 0 && infoData.data && infoData.data.user) {
      const u = infoData.data.user;
      const stats = infoData.data.stats || {};
      return res.json({
        success: true,
        username: cleanUser,
        total_fetched: 0,
        note: "ভিডিও তালিকা লোড করা যায়নি (tikwm সীমাবদ্ধতা)।",
        profile: {
          nickname: u.nickname,
          avatar: u.avatarLarger || u.avatarMedium,
          followers: stats.followerCount || 0,
          video_count: stats.videoCount || 0
        },
        videos: []
      });
    }
  } catch (_) {}

  try {
    const fallback = await axios.get(
      `https://www.tiktok.com/oembed?url=https://www.tiktok.com/@${encodeURIComponent(cleanUser)}`,
      { timeout: 8000 }
    );
    if (fallback.data && fallback.data.author_name) {
      return res.json({
        success: true, username: cleanUser, total_fetched: 1,
        videos: [{
          title: `${fallback.data.author_name}'s Profile Content`,
          cover_image: fallback.data.thumbnail_url,
          download_url_no_watermark: `https://www.tiktok.com/@${cleanUser}`,
          views: "N/A", likes: "N/A"
        }]
      });
    }
  } catch (_) {}

  return res.status(404).json({ success: false, error: "ইউজারের ভিডিও পাওয়া যায়নি বা অ্যাকাউন্টটি প্রাইভেট।" });
});

/* ───────────────────────────────────────────────────────────────
   ৩. TikTok — কমেন্ট স্ক্র্যাপার (/comments)
   ─────────────────────────────────────────────────────────────── */
app.get("/comments", async (req, res) => {
  const videoUrl = req.query.url;
  if (!videoUrl) return res.status(400).json({ success: false, error: "ভিডিও URL আবশ্যক।" });

  try {
    const apiUrl = `https://www.tikwm.com/api/comment/list?url=${encodeURIComponent(videoUrl)}&count=50`;
    const response = await fetchWithRetry(apiUrl, { headers: TIKWM_HEADERS });
    const data = response.data;
    if (data.code === 0 && data.data && data.data.comments) {
      const commentList = data.data.comments.map(c => ({
        comment_id: c.cid || c.id || null,
        comment_text: c.text || "",
        comment_time: c.create_time ? new Date(c.create_time * 1000).toLocaleString() : "Unknown",
        likes: c.digg_count || 0,
        user: {
          username: (c.user && (c.user.unique_id || c.user.uniqueId)) || "unknown",
          nickname: (c.user && c.user.nickname) || "Anonymous",
          avatar: (c.user && c.user.avatar) ||
            (c.user && c.user.avatar_thumb && c.user.avatar_thumb.url_list && c.user.avatar_thumb.url_list[0]) || ""
        }
      }));
      return res.json({ success: true, total_comments_fetched: commentList.length, comments: commentList });
    }
    return res.status(404).json({ success: false, error: "এই ভিডিওতে কোনো কমেন্ট পাওয়া যায়নি।" });
  } catch (error) {
    return res.status(500).json({ success: false, error: "কমেন্ট লোড করতে ব্যর্থ হয়েছে।" });
  }
});

/* ───────────────────────────────────────────────────────────────
   ৪. TikTok — প্রোফাইল ইনফো (/user/info)
   ─────────────────────────────────────────────────────────────── */
app.get("/user/info", async (req, res) => {
  const username = req.query.username;
  if (!username) return res.status(400).json({ success: false, error: "ইউজারনেম দিন।" });

  const cleanUser = username.replace("@", "").trim();

  try {
    const apiUrl = `https://www.tikwm.com/api/user/info?unique_id=${encodeURIComponent(cleanUser)}`;
    const response = await fetchWithRetry(apiUrl, { headers: TIKWM_HEADERS });
    const data = response.data;
    if (data.code === 0 && data.data && data.data.user) {
      const u = data.data.user;
      const stats = data.data.stats || {};
      const timeInfo = getDateInfo(u.createTime || u.create_time);
      return res.json({
        success: true,
        username: u.uniqueId || u.unique_id || cleanUser,
        nickname: u.nickname || "Unknown",
        avatar: u.avatarLarger || u.avatarMedium || u.avatarThumb || null,
        bio: u.signature || "No Bio",
        verified: u.verified || false,
        region: u.region || "Unknown",
        followers: stats.followerCount || stats.follower_count || 0,
        following: stats.followingCount || stats.following_count || 0,
        likes: stats.heartCount || stats.heart || stats.diggCount || 0,
        videos: stats.videoCount || stats.video_count || 0,
        creationDate: timeInfo.creationDate,
        accountAge: timeInfo.accountAge
      });
    }
    const fallback = await axios.get(
      `https://www.tiktok.com/oembed?url=https://www.tiktok.com/@${encodeURIComponent(cleanUser)}`,
      { timeout: 8000 }
    );
    if (fallback.data && fallback.data.author_name) {
      return res.json({
        success: true, username: cleanUser, nickname: fallback.data.author_name,
        avatar: fallback.data.thumbnail_url || null, bio: "TikTok Profile",
        verified: false, followers: "N/A", following: "N/A", likes: "N/A",
        videos: "N/A", creationDate: "Unknown", accountAge: "Unknown"
      });
    }
    return res.status(404).json({ success: false, error: "প্রোফাইল ডেটা পাওয়া যায়নি।" });
  } catch (error) {
    return res.status(500).json({ success: false, error: "প্রোফাইল চেক করতে সমস্যা হয়েছে।" });
  }
});

/* ═══════════════════════════════════════════════════════════════
   ৫. Facebook / Instagram / Pinterest / YouTube — FULLY FIXED
   ═══════════════════════════════════════════════════════════════ */

/* Snapsave HTML থেকে media links extract করার helper */
function extractMediaFromSnapsaveHtml(html) {
  const media = [];
  const seen = new Set();
  const push = (type, url) => {
    if (!url || seen.has(url)) return;
    seen.add(url); media.push({ type, url });
  };

  // rapidcdn v2 (main download url) + সরাসরি mp4
  const patterns = [
    /(https?:\/\/d\.rapidcdn\.app\/v2\?token=[^"'\s<>]+)/gi,
    /(https?:\/\/d\.rapidcdn\.app\/download\?token=[^"'\s<>]+)/gi,
    /(?:href|data-src|src|data-href)=["'](https?:\/\/[^"']+?\.mp4[^"']*)["']/gi,
    /(?:href|data-src|src|data-href)=["'](https?:\/\/[^"']+?\.mp3[^"']*)["']/gi
  ];
  for (const rx of patterns) {
    let m; while ((m = rx.exec(html)) !== null) push("video", decodeHtml(m[1]));
  }
  // ছবি (thumbnails / carousel)
  const imgRx = /(?:href|data-src|src)=["'](https?:\/\/[^"']+?\.(?:jpg|jpeg|webp|png)[^"']*)["']/gi;
  let m; while ((m = imgRx.exec(html)) !== null) {
    const u = decodeHtml(m[1]);
    if (/logo|icon|snapsave|snapinsta|favicon|placeholder/i.test(u)) continue;
    push("image", u);
  }
  return media;
}

function extractTitle(html) {
  const rxs = [
    /<h3[^>]*>([^<]+)<\/h3>/i,
    /<p[^>]*class=["'][^"']*(?:title|caption|video-des)[^"']*["'][^>]*>([^<]+)</i,
    /<strong>([^<]+)<\/strong>/i
  ];
  for (const r of rxs) {
    const m = html.match(r);
    if (m && m[1] && m[1].trim().length > 2 && !/^Video (?:Facebook|Instagram)$/i.test(m[1].trim()))
      return decodeHtml(m[1].trim());
  }
  return null;
}

/* ────────── Facebook Reels/Posts (/fb) — FIXED ────────── */
app.get("/fb", async (req, res) => {
  const videoUrl = req.query.url;
  if (!videoUrl) return res.status(400).json({ success: false, error: "Facebook video URL প্রদান করুন।" });
  if (!/facebook\.com|fb\.watch|fb\.com/i.test(videoUrl)) {
    return res.status(400).json({ success: false, error: "সঠিক Facebook লিংক দিন।" });
  }

  const attempts = [];

  /* পদ্ধতি ১: snapsave.app + JS decoder (সবচেয়ে stable 2026) */
  try {
    const r = await postWithRetry("https://snapsave.app/action.php?lang=en", { url: videoUrl }, {
      headers: {
        ...BROWSER_HEADERS,
        "Origin": "https://snapsave.app",
        "Referer": "https://snapsave.app/",
        "X-Requested-With": "XMLHttpRequest",
        "Accept": "*/*"
      }
    });
    // response is obfuscated JS — decode it
    const jsCode = typeof r.data === 'string' ? r.data : '';
    const html   = decodeSnapscriptToHtml(jsCode);

    if (html && html.length > 100) {
      const media = extractMediaFromSnapsaveHtml(html);
      const videos = media.filter(m => m.type === 'video');
      const images = media.filter(m => m.type === 'image');
      const title  = extractTitle(html) || "Facebook Video";
      if (videos.length) {
        return res.json({
          success: true, platform: "facebook", title,
          cover_image: images[0] ? images[0].url : null,
          download_url_no_watermark: videos[0].url,
          download_url_hd: videos[0].url,
          download_url_sd: (videos[1] && videos[1].url) || videos[0].url
        });
      }
    }
    attempts.push("snapsave: no links (decoded=" + (html ? html.length : 0) + ")");
  } catch (e) { attempts.push("snapsave err: " + (e.response ? e.response.status : e.code || 'net')); }

  /* পদ্ধতি ২: getmyfb.com */
  try {
    const r = await postWithRetry("https://getmyfb.com/api/ajaxSearch", { q: videoUrl, lang: 'en' }, {
      headers: {
        ...BROWSER_HEADERS,
        "Origin": "https://getmyfb.com",
        "Referer": "https://getmyfb.com/",
        "X-Requested-With": "XMLHttpRequest"
      }
    });
    let html = '';
    if (r.data && r.data.data) html = r.data.data;
    else if (typeof r.data === 'string') html = r.data;
    // যদি obfuscated JS হয়
    if (/_0x[a-f0-9]{4}/.test(html) || /^var _/.test(html.trim())) {
      html = decodeSnapscriptToHtml(html);
    }
    const media = extractMediaFromSnapsaveHtml(html);
    const videos = media.filter(m => m.type === 'video');
    const images = media.filter(m => m.type === 'image');
    if (videos.length) {
      return res.json({
        success: true, platform: "facebook",
        title: extractTitle(html) || "Facebook Video",
        cover_image: images[0] ? images[0].url : null,
        download_url_no_watermark: videos[0].url,
        download_url_hd: videos[0].url,
        download_url_sd: (videos[1] && videos[1].url) || videos[0].url
      });
    }
    attempts.push("getmyfb: no links");
  } catch (e) { attempts.push("getmyfb err: " + (e.response ? e.response.status : e.code || 'net')); }

  /* পদ্ধতি ৩: fbdown.net API (fdown alternate) */
  try {
    const r = await postWithRetry("https://fdownloader.net/api/ajaxSearch", { q: videoUrl, lang: 'en' }, {
      headers: {
        ...BROWSER_HEADERS,
        "Origin": "https://fdownloader.net",
        "Referer": "https://fdownloader.net/",
        "X-Requested-With": "XMLHttpRequest"
      }
    });
    let html = '';
    if (r.data && r.data.data) html = r.data.data;
    else if (typeof r.data === 'string') html = r.data;
    if (/_0x[a-f0-9]{4}/.test(html)) html = decodeSnapscriptToHtml(html);
    const media = extractMediaFromSnapsaveHtml(html);
    const videos = media.filter(m => m.type === 'video');
    const images = media.filter(m => m.type === 'image');
    if (videos.length) {
      return res.json({
        success: true, platform: "facebook",
        title: extractTitle(html) || "Facebook Video",
        cover_image: images[0] ? images[0].url : null,
        download_url_no_watermark: videos[0].url,
        download_url_hd: videos[0].url,
        download_url_sd: (videos[1] && videos[1].url) || videos[0].url
      });
    }
    attempts.push("fdownloader: no links");
  } catch (e) { attempts.push("fdownloader err: " + (e.response ? e.response.status : e.code || 'net')); }

  return res.status(404).json({
    success: false,
    error: "Facebook ভিডিও রিসলভ করা যায়নি। লিংকটি Public কিনা যাচাই করুন।",
    debug: attempts
  });
});

/* ────────── Instagram Post/Reel (/ig) — FIXED ────────── */
app.get("/ig", async (req, res) => {
  const videoUrl = req.query.url;
  if (!videoUrl) return res.status(400).json({ success: false, error: "Instagram URL প্রদান করুন।" });
  if (!/instagram\.com|instagr\.am/i.test(videoUrl)) {
    return res.status(400).json({ success: false, error: "সঠিক Instagram লিংক দিন।" });
  }

  const attempts = [];

  /* পদ্ধতি ১: snapinsta হোস্ট (snapinsta.to / snapins.ai) — obfuscated JS decode */
  const snapHosts = [
    { host: "snapins.ai",   path: "/action.php?lang=en" },
    { host: "snapinst.app", path: "/action.php?lang=en" },
    { host: "snapinsta.app",path: "/action.php?lang=en" }
  ];
  for (const h of snapHosts) {
    try {
      const r = await postWithRetry(`https://${h.host}${h.path}`, { url: videoUrl }, {
        headers: {
          ...BROWSER_HEADERS,
          "Origin":  `https://${h.host}`,
          "Referer": `https://${h.host}/`,
          "X-Requested-With": "XMLHttpRequest",
          "Accept": "*/*"
        }
      });
      const jsCode = typeof r.data === 'string' ? r.data : '';
      let html = jsCode;
      if (/_0x[a-f0-9]{4}/.test(jsCode) || /^var _/.test(jsCode.trim())) {
        html = decodeSnapscriptToHtml(jsCode);
      }
      if (html && html.length > 100) {
        const media = extractMediaFromSnapsaveHtml(html);
        if (media.length) {
          const firstVid = media.find(x => x.type === 'video');
          const firstImg = media.find(x => x.type === 'image');
          return res.json({
            success: true, platform: "instagram",
            title: extractTitle(html) || "Instagram Media",
            cover_image: firstImg ? firstImg.url : null,
            download_url_no_watermark: firstVid ? firstVid.url : media[0].url,
            download_url_hd: firstVid ? firstVid.url : media[0].url,
            media_list: media.slice(0, 20)
          });
        }
      }
      attempts.push(h.host + ": no media");
    } catch (e) { attempts.push(h.host + " err: " + (e.response ? e.response.status : e.code || 'net')); }
  }

  /* পদ্ধতি ২: saveinsta.io */
  try {
    const r = await postWithRetry("https://saveinsta.io/api/ajaxSearch", { q: videoUrl, t: 'media', lang: 'en' }, {
      headers: {
        ...BROWSER_HEADERS,
        "Origin": "https://saveinsta.io",
        "Referer": "https://saveinsta.io/",
        "X-Requested-With": "XMLHttpRequest"
      }
    });
    let html = '';
    if (r.data && (r.data.data || r.data.html)) html = r.data.data || r.data.html;
    else if (typeof r.data === 'string') html = r.data;
    if (/_0x[a-f0-9]{4}/.test(html)) html = decodeSnapscriptToHtml(html);
    const media = extractMediaFromSnapsaveHtml(html);
    if (media.length) {
      const firstVid = media.find(x => x.type === 'video');
      const firstImg = media.find(x => x.type === 'image');
      return res.json({
        success: true, platform: "instagram",
        title: extractTitle(html) || "Instagram Media",
        cover_image: firstImg ? firstImg.url : null,
        download_url_no_watermark: firstVid ? firstVid.url : media[0].url,
        download_url_hd: firstVid ? firstVid.url : media[0].url,
        media_list: media.slice(0, 20)
      });
    }
    attempts.push("saveinsta.io: no links");
  } catch (e) { attempts.push("saveinsta.io err: " + (e.response ? e.response.status : e.code || 'net')); }

  /* পদ্ধতি ৩: igram.world API (নতুন schema) */
  try {
    const r = await postJsonWithRetry("https://api.igram.world/api/convert", { url: videoUrl }, {
      headers: {
        ...BROWSER_HEADERS,
        "Origin": "https://igram.world",
        "Referer": "https://igram.world/"
      }
    });
    const data = r.data;
    const items = Array.isArray(data) ? data
                : (data && Array.isArray(data.media)) ? data.media
                : (data && Array.isArray(data.data)) ? data.data
                : [];
    if (items.length) {
      const media = items.map(it => {
        const u = (it.url && (typeof it.url === 'string' ? it.url : (it.url[0] && (it.url[0].url || it.url[0]))))
                || it.download || it.url_download || it.src;
        const t = it.thumb || it.thumbnail;
        const isVid = /\.mp4/i.test(u || '') || it.type === 'video';
        return { type: isVid ? 'video' : 'image', url: u, thumb: t };
      }).filter(x => x.url);
      if (media.length) {
        const firstVid = media.find(x => x.type === 'video');
        return res.json({
          success: true, platform: "instagram", title: "Instagram Media",
          cover_image: (media[0] && media[0].thumb) || null,
          download_url_no_watermark: firstVid ? firstVid.url : media[0].url,
          download_url_hd: firstVid ? firstVid.url : media[0].url,
          media_list: media.slice(0, 20)
        });
      }
    }
    attempts.push("igram: no data");
  } catch (e) { attempts.push("igram err: " + (e.response ? e.response.status : e.code || 'net')); }

  return res.status(404).json({
    success: false,
    error: "Instagram media রিসলভ করা যায়নি। প্রোফাইলটি Public কিনা যাচাই করুন।",
    debug: attempts
  });
});

/* ────────── Pinterest Post/Video (/pin) — FIXED ────────── */
app.get("/pin", async (req, res) => {
  let videoUrl = req.query.url;
  if (!videoUrl) return res.status(400).json({ success: false, error: "Pinterest URL প্রদান করুন।" });
  if (!/pinterest\.com|pin\.it|pinterest\.[a-z]{2,3}/i.test(videoUrl)) {
    return res.status(400).json({ success: false, error: "সঠিক Pinterest লিংক দিন।" });
  }

  const attempts = [];

  /* pin.it শর্ট লিংক resolve */
  try {
    if (/pin\.it/i.test(videoUrl)) {
      const rr = await axios.get(videoUrl, {
        headers: BROWSER_HEADERS,
        maxRedirects: 5, timeout: 15000,
        validateStatus: s => s >= 200 && s < 400
      });
      if (rr.request && rr.request.res && rr.request.res.responseUrl) {
        videoUrl = rr.request.res.responseUrl;
      }
    }
  } catch (_) {}

  /* পদ্ধতি ১: Direct HTML স্ক্র্যাপিং (Pinterest সার্ভার-সাইড রেন্ডার করে) */
  try {
    const r = await fetchWithRetry(videoUrl, {
      headers: {
        ...BROWSER_HEADERS,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://www.pinterest.com/",
        "sec-fetch-dest": "document",
        "sec-fetch-mode": "navigate",
        "sec-fetch-site": "none"
      },
      maxRedirects: 5
    });
    const html = typeof r.data === 'string' ? r.data : '';

    let videoUrlFound = null, imgUrlFound = null, title = null, description = null;

    /* ভিডিও URL */
    const videoRegexes = [
      /"url":"(https:\\?\/\\?\/v\d?\.pinimg\.com\\?\/[^"]+?\.mp4[^"]*)"/i,
      /"video_list":\s*\{[^}]*"V_720P":\s*\{[^}]*"url":"([^"]+)"/i,
      /"video_list":\s*\{[^}]*"V_HLSV4":\s*\{[^}]*"url":"([^"]+\.m3u8[^"]*)"/i,
      /(https:\/\/v\d?\.pinimg\.com\/[^"' ]+?\.mp4[^"'? ]*)/i
    ];
    for (const rx of videoRegexes) {
      const vm = html.match(rx);
      if (vm && vm[1]) { videoUrlFound = decodeHtml(vm[1]); break; }
    }

    /* ইমেজ URL (thumbnail) */
    const imgRegexes = [
      /"orig":\{"width":\d+,"height":\d+,"url":"(https:\\?\/\\?\/i\.pinimg\.com\\?\/[^"]+)"/i,
      /"images":\{[^}]*"orig":\{[^}]*"url":"([^"]+)"/i,
      /<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i,
      /<meta\s+name=["']twitter:image["']\s+content=["']([^"']+)["']/i,
      /"image_url":"([^"]+)"/i,
      /"image_signature":"[^"]+","urls":\{"[^"]+":"([^"]+)"/i
    ];
    for (const rx of imgRegexes) {
      const im = html.match(rx);
      if (im && im[1]) { imgUrlFound = decodeHtml(im[1]); break; }
    }

    /* টাইটেল */
    const titleRegexes = [
      /<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i,
      /<meta\s+name=["']twitter:title["']\s+content=["']([^"']+)["']/i,
      /"grid_title":"([^"]+)"/i,
      /"seo_title":"([^"]+)"/i,
      /<title[^>]*>([^<]+)<\/title>/i
    ];
    for (const rx of titleRegexes) {
      const tm = html.match(rx);
      if (tm && tm[1]) { title = decodeHtml(tm[1]); break; }
    }

    /* ক্যাপশন */
    const descRegexes = [
      /<meta\s+property=["']og:description["']\s+content=["']([^"']+)["']/i,
      /<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i,
      /<meta\s+name=["']twitter:description["']\s+content=["']([^"']+)["']/i,
      /"description":"((?:[^"\\]|\\.)*)"/i,
      /"seo_description":"((?:[^"\\]|\\.)*)"/i
    ];
    for (const rx of descRegexes) {
      const dm = html.match(rx);
      if (dm && dm[1]) {
        description = decodeHtml(dm[1]).replace(/\\n/g, '\n').replace(/\\"/g, '"');
        break;
      }
    }

    /* উচ্চ-রেজ image URL rewrite */
    if (imgUrlFound && /i\.pinimg\.com/.test(imgUrlFound)) {
      imgUrlFound = imgUrlFound.replace(/\/(\d+x\d*)\//, '/originals/');
    }

    if (videoUrlFound || imgUrlFound) {
      return res.json({
        success: true,
        platform: "pinterest",
        title: title || "Pinterest Pin",
        caption: description || title || "",
        description: description || "",
        cover_image: imgUrlFound || null,
        thumbnail:   imgUrlFound || null,
        download_url_no_watermark: videoUrlFound || imgUrlFound,
        download_url_hd:           videoUrlFound || imgUrlFound,
        media_type: videoUrlFound ? 'video' : 'image'
      });
    }
    attempts.push("direct scrape: nothing found (html=" + html.length + ")");
  } catch (e) { attempts.push("direct err: " + (e.response ? e.response.status : e.code || 'net')); }

  /* পদ্ধতি ২: pinterestdownloader.io */
  try {
    const r = await postWithRetry("https://pinterestdownloader.io/frontendService/DownloaderService", { url: videoUrl }, {
      headers: {
        ...BROWSER_HEADERS,
        "Origin": "https://pinterestdownloader.io",
        "Referer": "https://pinterestdownloader.io/"
      }
    });
    const data = r.data || {};
    const list = data.mediaList || data.data || [];
    const first = Array.isArray(list) ? list[0] : null;
    const url = first && (first.url || first.download_url);
    if (url) {
      return res.json({
        success: true, platform: "pinterest",
        title: first.title || data.title || "Pinterest Pin",
        caption: first.description || data.description || "",
        description: first.description || data.description || "",
        cover_image: first.image || first.thumbnail || null,
        thumbnail:   first.image || first.thumbnail || null,
        download_url_no_watermark: url,
        download_url_hd: url,
        media_type: /\.mp4/i.test(url) ? 'video' : 'image'
      });
    }
    attempts.push("pindownloader: no data");
  } catch (e) { attempts.push("pindownloader err: " + (e.response ? e.response.status : e.code || 'net')); }

  return res.status(404).json({
    success: false,
    error: "Pinterest media রিসলভ করা যায়নি।",
    debug: attempts
  });
});

/* ────────── YouTube Video/Shorts (/yt) — FIXED (multi-resolver) ────────── */
app.get("/yt", async (req, res) => {
  const videoUrl = req.query.url;
  if (!videoUrl) return res.status(400).json({ success: false, error: "YouTube URL প্রদান করুন।" });
  if (!/youtube\.com|youtu\.be/i.test(videoUrl)) {
    return res.status(400).json({ success: false, error: "সঠিক YouTube লিংক দিন।" });
  }

  const idMatch = videoUrl.match(/(?:v=|\/shorts\/|youtu\.be\/|\/embed\/)([\w-]{11})/);
  const vid = idMatch ? idMatch[1] : null;
  if (!vid) return res.status(400).json({ success: false, error: "YouTube video ID পাওয়া যায়নি।" });

  const fullUrl = `https://www.youtube.com/watch?v=${vid}`;
  const thumb = `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`;

  /* meta info */
  let title = "YouTube Video", author = "YouTube";
  try {
    const meta = await axios.get(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(fullUrl)}&format=json`,
      { timeout: 8000 }
    );
    if (meta.data) {
      title  = meta.data.title       || title;
      author = meta.data.author_name || author;
    }
  } catch (_) {}

  const attempts = [];

  /* ─── পদ্ধতি ১: cobalt.tools v10 নতুন API (JWT ছাড়া public host) ─── */
  const cobaltHosts = [
    "https://cobalt-api.kwiatekmiki.com/",
    "https://co.wuk.sh/api/json",
    "https://api.cobalt.tools/api/json"
  ];
  for (const host of cobaltHosts) {
    try {
      const isV10 = /kwiatekmiki|\/$/.test(host) && !/api\/json/.test(host);
      const body = isV10
        ? { url: fullUrl, videoQuality: "720", downloadMode: "auto", filenameStyle: "basic" }
        : { url: fullUrl, vQuality: "720", filenamePattern: "basic", isAudioOnly: false };
      const r = await postJsonWithRetry(host, body, {
        headers: {
          ...BROWSER_HEADERS,
          "Origin": "https://cobalt.tools",
          "Referer": "https://cobalt.tools/",
          "Accept": "application/json"
        },
        timeout: 30000
      });
      const d = r.data || {};
      if (d.status === "stream" || d.status === "redirect" || d.status === "tunnel" || d.status === "success") {
        const videoLink = d.url;
        // audio
        let audioLink = null;
        try {
          const audioBody = isV10
            ? { url: fullUrl, downloadMode: "audio", audioFormat: "mp3", filenameStyle: "basic" }
            : { url: fullUrl, isAudioOnly: true, aFormat: "mp3" };
          const ra = await postJsonWithRetry(host, audioBody, {
            headers: {
              ...BROWSER_HEADERS,
              "Origin": "https://cobalt.tools",
              "Referer": "https://cobalt.tools/",
              "Accept": "application/json"
            }
          });
          if (ra.data && ra.data.url) audioLink = ra.data.url;
        } catch (_) {}

        return res.json({
          success: true, platform: "youtube", title, author,
          cover_image: thumb,
          download_url_no_watermark: videoLink,
          download_url_hd: videoLink,
          music_url: audioLink,
          quality: "720p"
        });
      }
      attempts.push("cobalt(" + host.replace(/https?:\/\//, '').split('/')[0] + "): status=" + (d.status || 'unknown'));
    } catch (e) { attempts.push("cobalt err: " + (e.response ? e.response.status : e.code || 'net')); }
  }

  /* ─── পদ্ধতি ২: ssvid.net / ytmp3.mobi সরল fallback ─── */
  try {
    const r1 = await postWithRetry("https://ssvid.net/api/ajax/search", {
      query: fullUrl, cf_token: "", vt: "downloader"
    }, {
      headers: {
        ...BROWSER_HEADERS,
        "Origin": "https://ssvid.net",
        "Referer": "https://ssvid.net/"
      }
    });
    const info = r1.data || {};
    const links = (info.links && (info.links.mp4 || info.links.MP4)) || {};
    let bestKey = null, bestQ = 0;
    Object.keys(links).forEach(k => {
      const item = links[k];
      const q = parseInt(String(item.q || '').replace(/\D/g,''), 10) || 0;
      if ((item.f === 'mp4' || item.type === 'mp4') && q >= bestQ && q <= 1080) { bestQ = q; bestKey = item.k; }
    });
    let audioKey = null;
    const audios = (info.links && (info.links.mp3 || info.links.MP3)) || {};
    Object.keys(audios).forEach(k => { if (!audioKey) audioKey = audios[k].k; });

    async function convert(key) {
      if (!key || !info.vid) return null;
      try {
        const r2 = await postWithRetry("https://ssvid.net/api/ajax/convert", {
          vid: info.vid, k: key
        }, {
          headers: {
            ...BROWSER_HEADERS,
            "Origin": "https://ssvid.net",
            "Referer": "https://ssvid.net/"
          }
        });
        return (r2.data && (r2.data.dlink || r2.data.url)) || null;
      } catch (_) { return null; }
    }
    const videoLink = await convert(bestKey);
    const audioLink = await convert(audioKey);

    if (videoLink || audioLink) {
      return res.json({
        success: true, platform: "youtube",
        title: info.title || title,
        author: info.a || author,
        cover_image: info.thumbnail || thumb,
        download_url_no_watermark: videoLink,
        download_url_hd: videoLink,
        music_url: audioLink,
        quality: bestQ ? (bestQ + 'p') : 'auto'
      });
    }
    attempts.push("ssvid: no dlink");
  } catch (e) { attempts.push("ssvid err: " + (e.response ? e.response.status : e.code || 'net')); }

  /* ─── পদ্ধতি ৩: y2mate fallback ─── */
  try {
    const r1 = await postWithRetry("https://www.y2mate.com/mates/analyzeV2/ajax", {
      k_query: fullUrl, k_page: "home", hl: "en", q_auto: "0"
    }, {
      headers: {
        ...BROWSER_HEADERS,
        "Origin": "https://www.y2mate.com",
        "Referer": "https://www.y2mate.com/"
      },
      timeout: 20000
    });
    const info = r1.data || {};
    const links = (info.links && (info.links.mp4 || info.links.MP4)) || {};
    let bestKey = null, bestQ = 0;
    Object.keys(links).forEach(k => {
      const item = links[k];
      const q = parseInt(String(item.q || '').replace(/\D/g,''), 10) || 0;
      if (item.f === 'mp4' && q >= bestQ && q <= 1080) { bestQ = q; bestKey = item.k; }
    });
    let audioKey = null;
    const audios = (info.links && (info.links.mp3 || info.links.MP3)) || {};
    Object.keys(audios).forEach(k => { if (!audioKey) audioKey = audios[k].k; });

    async function convert(key){
      if (!key) return null;
      try {
        const r2 = await postWithRetry("https://www.y2mate.com/mates/convertV2/index", {
          vid, k: key
        }, {
          headers: {
            ...BROWSER_HEADERS,
            "Origin":"https://www.y2mate.com",
            "Referer":"https://www.y2mate.com/"
          }
        });
        return (r2.data && r2.data.dlink) || null;
      } catch(e){ return null; }
    }
    const videoLink = await convert(bestKey);
    const audioLink = await convert(audioKey);

    if (videoLink || audioLink) {
      return res.json({
        success: true, platform: "youtube",
        title: info.title || title,
        author: info.a || author,
        cover_image: info.thumbnail || thumb,
        download_url_no_watermark: videoLink,
        download_url_hd: videoLink,
        music_url: audioLink,
        quality: bestQ ? (bestQ + 'p') : 'auto'
      });
    }
    attempts.push("y2mate: no dlink");
  } catch (e) { attempts.push("y2mate err: " + (e.response ? e.response.status : e.code || 'net')); }

  return res.status(502).json({
    success: false,
    platform: "youtube",
    title, author,
    cover_image: thumb,
    download_url_no_watermark: null,
    download_url_hd: null,
    music_url: null,
    error: "সরাসরি ডাউনলোড লিংক তৈরি করা যায়নি — সব রিসলভার সাময়িকভাবে ব্লকড। কিছুক্ষণ পরে আবার চেষ্টা করুন।",
    debug: attempts
  });
});

/* ─── রুট (Health-check) ─────────────────────────────────────── */
app.get("/", (req, res) => {
  res.json({
    status: "🚀 TokLens Multi-Platform Downloader API is running!",
    platforms: ["tiktok", "facebook", "instagram", "pinterest", "youtube"],
    endpoints: {
      "TikTok Download": "/download?url=...",
      "TikTok User":     "/user?username=...",
      "TikTok Comments": "/comments?url=...",
      "TikTok Profile":  "/user/info?username=...",
      "Facebook":        "/fb?url=...",
      "Instagram":       "/ig?url=...",
      "Pinterest":       "/pin?url=...",
      "YouTube":         "/yt?url=..."
    }
  });
});

app.listen(PORT, () => {
  console.log(`✅ TokLens Multi-Platform API listening on port ${PORT}`);
});
