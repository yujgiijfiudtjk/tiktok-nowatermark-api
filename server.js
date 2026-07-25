/* ═══════════════════════════════════════════════════════════════
   TokLens — Multi-Platform Downloader API
   Platforms: TikTok · Facebook · Instagram · Pinterest · YouTube
   Author: RX HASNAT
   ─── এই একটি ফাইল পুরনো server.js এর জায়গায় বসিয়ে দিন ───
   ═══════════════════════════════════════════════════════════════ */

const express = require("express");
const cors    = require("cors");
const axios   = require("axios");

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

const TT_HEADERS = {
  ...BROWSER_HEADERS,
  "Origin": "https://www.tiktok.com",
  "Referer": "https://www.tiktok.com/"
};

/* ─── retry সহ axios GET ─────────────────────────────────────── */
async function fetchWithRetry(url, options = {}, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await axios.get(url, {
        headers: options.headers || TT_HEADERS,
        timeout: options.timeout || 20000,
        ...options
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
  const body = new URLSearchParams(form).toString();
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await axios.post(url, body, {
        headers: {
          ...(options.headers || BROWSER_HEADERS),
          "Content-Type": "application/x-www-form-urlencoded"
        },
        timeout: options.timeout || 25000
      });
      return res;
    } catch (err) {
      if (i === retries) throw err;
      await new Promise(r => setTimeout(r, 900 * (i + 1)));
    }
  }
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
   ১. TikTok — সিঙ্গেল ভিডিও ডাউনলোডার (/download)
   ─────────────────────────────────────────────────────────────── */
app.get("/download", async (req, res) => {
  const videoUrl = req.query.url;
  if (!videoUrl) return res.status(400).json({ success: false, error: "ভিডিও URL প্রদান করুন।" });

  try {
    const apiUrl = `https://www.tikwm.com/api/?url=${encodeURIComponent(videoUrl)}&hd=1`;
    const response = await fetchWithRetry(apiUrl);
    const data = response.data;

    if (data.code === 0 && data.data) {
      const v = data.data;
      const authorId =
        (v.author && (v.author.unique_id || v.author.uniqueId)) ||
        v.author_unique_id || "Unknown";
      const authorName =
        (v.author && v.author.nickname) || v.author_nickname || "Unknown";

      return res.json({
        success: true,
        platform: "tiktok",
        title: v.title || "TikTok Video",
        author: authorId,
        author_name: authorName,
        cover_image: v.cover || v.origin_cover || null,
        download_url_no_watermark: v.play || null,
        download_url_hd: v.hdplay || v.play || null,
        music_url: getMusicUrl(v)
      });
    }
    return res.status(404).json({ success: false, error: "ভিডিওর ডেটা পাওয়া যায়নি বা লিংকটি ভুল।" });
  } catch (error) {
    const msg = error.response ? `tikwm সার্ভার এরর: ${error.response.status}` : "সার্ভারে সমস্যা হয়েছে। আবার চেষ্টা করুন।";
    return res.status(500).json({ success: false, error: msg });
  }
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
    const response = await fetchWithRetry(apiUrl);
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
    const infoRes = await fetchWithRetry(infoUrl);
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
    const response = await fetchWithRetry(apiUrl);
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
    const response = await fetchWithRetry(apiUrl);
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
   ৫. Facebook / Instagram / Pinterest / YouTube ডাউনলোডার
   ── SnapSave / SnapDownloader / RapidSave ব্যাকএন্ড proxy ────
   ═══════════════════════════════════════════════════════════════ */

/* সহায়ক: JSON থেকে best video url বের করা */
function pickBestFromRapidCdn(data){
  if (!data || typeof data !== 'object') return null;
  // চেষ্টা: data.medias কে iterate করি
  const medias = data.medias || data.data || data.links || [];
  const list = Array.isArray(medias) ? medias : [];
  let best = null;
  for (const m of list) {
    const url = m.url || m.link || m.download_url;
    if (!url) continue;
    const q = (m.quality || m.label || m.resolution || '').toString().toLowerCase();
    const type = (m.type || m.extension || '').toString().toLowerCase();
    if (type.includes('audio') || url.match(/\.(m4a|mp3)($|\?)/i)) continue;
    if (!best) best = { url, quality: q || 'sd' };
    if (q.includes('hd') || q.includes('720') || q.includes('1080')) return { url, quality: q };
  }
  return best;
}

/* ────────── Facebook Reels/Posts (/fb) ────────── */
app.get("/fb", async (req, res) => {
  const videoUrl = req.query.url;
  if (!videoUrl) return res.status(400).json({ success: false, error: "Facebook video URL প্রদান করুন।" });
  if (!/facebook\.com|fb\.watch|fb\.com/i.test(videoUrl)) {
    return res.status(400).json({ success: false, error: "সঠিক Facebook লিংক দিন।" });
  }

  // পদ্ধতি ১: snapsave.app JSON endpoint
  try {
    const r = await postWithRetry("https://snapsave.app/action.php?lang=en", { url: videoUrl }, {
      headers: { ...BROWSER_HEADERS, "Origin": "https://snapsave.app", "Referer": "https://snapsave.app/" }
    });
    const html = typeof r.data === 'string' ? r.data : (r.data && r.data.data) || '';
    const links = [];
    const re = /href="(https?:\/\/[^"]+?\.mp4[^"]*)"/gi;
    let m;
    while ((m = re.exec(html)) !== null) links.push(m[1].replace(/&amp;/g, '&'));
    // Thumbnail
    const thumbMatch = html.match(/<img[^>]+src="(https?:\/\/[^"]+?\.(?:jpg|jpeg|webp|png)[^"]*)"/i);
    if (links.length) {
      return res.json({
        success: true, platform: "facebook",
        title: "Facebook Video",
        cover_image: thumbMatch ? thumbMatch[1].replace(/&amp;/g, '&') : null,
        download_url_no_watermark: links[0],
        download_url_hd: links[links.length > 1 ? 0 : 0],
        download_url_sd: links[links.length - 1] || null
      });
    }
  } catch (_) {}

  // পদ্ধতি ২: getmyfb.com
  try {
    const r = await postWithRetry("https://getmyfb.com/api/ajaxSearch", { q: videoUrl, lang: 'en' }, {
      headers: { ...BROWSER_HEADERS, "Origin": "https://getmyfb.com", "Referer": "https://getmyfb.com/" }
    });
    const html = (r.data && r.data.data) || '';
    const links = [];
    const re = /href="(https?:\/\/[^"]+?\.mp4[^"]*)"/gi;
    let m; while ((m = re.exec(html)) !== null) links.push(m[1].replace(/&amp;/g,'&'));
    if (links.length) {
      return res.json({
        success: true, platform: "facebook", title: "Facebook Video",
        cover_image: null,
        download_url_hd: links[0],
        download_url_no_watermark: links[0],
        download_url_sd: links[1] || links[0]
      });
    }
  } catch (_) {}

  return res.status(404).json({ success: false, error: "Facebook ভিডিও রিসলভ করা যায়নি। লিংকটি Public কিনা যাচাই করুন।" });
});

/* ────────── Instagram Post/Reel (/ig) ────────── */
app.get("/ig", async (req, res) => {
  const videoUrl = req.query.url;
  if (!videoUrl) return res.status(400).json({ success: false, error: "Instagram URL প্রদান করুন।" });
  if (!/instagram\.com|instagr\.am/i.test(videoUrl)) {
    return res.status(400).json({ success: false, error: "সঠিক Instagram লিংক দিন।" });
  }

  // পদ্ধতি ১: snapinsta.app
  try {
    const r = await postWithRetry("https://snapinsta.app/api/ajaxSearch", { q: videoUrl, t: 'media', lang: 'en' }, {
      headers: { ...BROWSER_HEADERS, "Origin": "https://snapinsta.app", "Referer": "https://snapinsta.app/" }
    });
    const html = (r.data && r.data.data) || '';
    const media = [];
    const reMp4 = /href="(https?:\/\/[^"]+?\.mp4[^"]*)"/gi;
    const reImg = /<img[^>]+src="(https?:\/\/[^"]+?\.(?:jpg|jpeg|webp|png)[^"]*)"/gi;
    let m;
    while ((m = reMp4.exec(html)) !== null) media.push({ type:'video', url: m[1].replace(/&amp;/g,'&') });
    let firstThumb = null;
    while ((m = reImg.exec(html)) !== null) {
      const u = m[1].replace(/&amp;/g,'&');
      if (!firstThumb) firstThumb = u;
      if (!/logo|icon/i.test(u)) media.push({ type:'image', url:u });
    }
    if (media.length) {
      const firstVid = media.find(x => x.type === 'video');
      return res.json({
        success: true, platform: "instagram", title: "Instagram Media",
        cover_image: firstThumb,
        download_url_no_watermark: firstVid ? firstVid.url : (media[0] && media[0].url),
        download_url_hd: firstVid ? firstVid.url : (media[0] && media[0].url),
        media_list: media.slice(0, 20)
      });
    }
  } catch (_) {}

  // পদ্ধতি ২: saveinsta.app
  try {
    const r = await postWithRetry("https://saveinsta.app/core/ajax.php", { url: videoUrl, action: 'post', lang: 'en' }, {
      headers: { ...BROWSER_HEADERS, "Origin": "https://saveinsta.app", "Referer": "https://saveinsta.app/" }
    });
    const html = (r.data && (r.data.data || r.data.html)) || (typeof r.data === 'string' ? r.data : '');
    const links = [];
    const re = /href="(https?:\/\/[^"]+?\.mp4[^"]*)"/gi;
    let m; while ((m = re.exec(html)) !== null) links.push(m[1].replace(/&amp;/g,'&'));
    if (links.length) {
      return res.json({
        success: true, platform: "instagram", title: "Instagram Media",
        cover_image: null,
        download_url_no_watermark: links[0],
        download_url_hd: links[0]
      });
    }
  } catch (_) {}

  return res.status(404).json({ success: false, error: "Instagram media রিসলভ করা যায়নি। প্রোফাইলটি Public কিনা যাচাই করুন।" });
});

/* ────────── Pinterest Post/Video (/pin) ────────── */
app.get("/pin", async (req, res) => {
  const videoUrl = req.query.url;
  if (!videoUrl) return res.status(400).json({ success: false, error: "Pinterest URL প্রদান করুন।" });
  if (!/pinterest\.com|pin\.it|pinterest\.[a-z]{2,3}/i.test(videoUrl)) {
    return res.status(400).json({ success: false, error: "সঠিক Pinterest লিংক দিন।" });
  }

  // পদ্ধতি ১: Direct HTML স্ক্র্যাপিং
  try {
    const r = await fetchWithRetry(videoUrl, {
      headers: { ...BROWSER_HEADERS, "Referer": "https://www.pinterest.com/" },
      maxRedirects: 5
    });
    const html = typeof r.data === 'string' ? r.data : '';
    // JSON hunt
    let videoUrlFound = null, imgUrlFound = null, title = "Pinterest Pin";
    // ভিডিও URL
    const vm = html.match(/"url":"(https:\\?\/\\?\/v\d?\.pinimg\.com\\?\/[^"]+?\.mp4[^"]*)"/i) ||
               html.match(/(https:\/\/v\d?\.pinimg\.com\/[^"' ]+?\.mp4[^"'? ]*)/i);
    if (vm && vm[1]) videoUrlFound = vm[1].replace(/\\\//g,'/').replace(/&amp;/g,'&');
    // ইমেজ URL
    const im = html.match(/"orig":\{"width":\d+,"height":\d+,"url":"(https:\\?\/\\?\/i\.pinimg\.com\\?\/[^"]+)"/i) ||
               html.match(/property="og:image"\s+content="([^"]+)"/i);
    if (im && im[1]) imgUrlFound = im[1].replace(/\\\//g,'/').replace(/&amp;/g,'&');
    // টাইটেল
    const tm = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i);
    if (tm && tm[1]) title = tm[1];

    if (videoUrlFound || imgUrlFound) {
      return res.json({
        success: true, platform: "pinterest", title,
        cover_image: imgUrlFound || null,
        download_url_no_watermark: videoUrlFound || imgUrlFound,
        download_url_hd: videoUrlFound || imgUrlFound,
        media_type: videoUrlFound ? 'video' : 'image'
      });
    }
  } catch (_) {}

  // পদ্ধতি ২: pinterestdownloader.io API
  try {
    const r = await postWithRetry("https://pinterestdownloader.io/frontendService/DownloaderService", { url: videoUrl }, {
      headers: { ...BROWSER_HEADERS, "Origin": "https://pinterestdownloader.io", "Referer": "https://pinterestdownloader.io/" }
    });
    const data = r.data || {};
    if (data && (data.mediaList || data.data)) {
      const list = data.mediaList || data.data || [];
      const first = Array.isArray(list) ? list[0] : null;
      const url = first && (first.url || first.download_url);
      if (url) {
        return res.json({
          success: true, platform: "pinterest", title: "Pinterest Pin",
          cover_image: first.image || first.thumbnail || null,
          download_url_no_watermark: url,
          download_url_hd: url,
          media_type: /\.mp4/i.test(url) ? 'video' : 'image'
        });
      }
    }
  } catch (_) {}

  return res.status(404).json({ success: false, error: "Pinterest media রিসলভ করা যায়নি।" });
});

/* ────────── YouTube Video/Shorts (/yt) ────────── */
app.get("/yt", async (req, res) => {
  const videoUrl = req.query.url;
  if (!videoUrl) return res.status(400).json({ success: false, error: "YouTube URL প্রদান করুন।" });
  if (!/youtube\.com|youtu\.be/i.test(videoUrl)) {
    return res.status(400).json({ success: false, error: "সঠিক YouTube লিংক দিন।" });
  }

  // পদ্ধতি ১: y2mate CDN endpoint
  try {
    const idMatch = videoUrl.match(/(?:v=|\/shorts\/|youtu\.be\/)([\w-]{11})/);
    const vid = idMatch ? idMatch[1] : null;
    if (vid) {
      // Analyze
      const r1 = await postWithRetry("https://www.y2mate.com/mates/analyzeV2/ajax", {
        k_query: `https://www.youtube.com/watch?v=${vid}`,
        k_page: "home", hl: "en", q_auto: "0"
      }, {
        headers: { ...BROWSER_HEADERS, "Origin": "https://www.y2mate.com", "Referer": "https://www.y2mate.com/" }
      });
      const info = r1.data || {};
      const title = info.title || "YouTube Video";
      const thumb = info.thumbnail || (vid ? `https://i.ytimg.com/vi/${vid}/hqdefault.jpg` : null);
      const links = (info.links && (info.links.mp4 || info.links.MP4)) || {};
      // best pick (720p বা তার নিচে)
      let bestKey = null, bestQ = 0;
      let audioKey = null;
      Object.keys(links).forEach(k => {
        const item = links[k];
        const q = parseInt((item.q || '').replace(/\D/g,''), 10) || 0;
        if (item.f === 'mp4' && q >= bestQ && q <= 1080) { bestQ = q; bestKey = item.k; }
      });
      const audios = (info.links && (info.links.mp3 || info.links.MP3)) || {};
      Object.keys(audios).forEach(k => {
        if (!audioKey) audioKey = audios[k].k;
      });

      async function convert(key){
        if (!key) return null;
        try {
          const r2 = await postWithRetry("https://www.y2mate.com/mates/convertV2/index", {
            vid, k: key
          }, {
            headers: { ...BROWSER_HEADERS, "Origin":"https://www.y2mate.com", "Referer":"https://www.y2mate.com/" }
          });
          return (r2.data && r2.data.dlink) || null;
        } catch(e){ return null; }
      }

      const videoLink = await convert(bestKey);
      const audioLink = await convert(audioKey);

      if (videoLink || audioLink) {
        return res.json({
          success: true, platform: "youtube",
          title,
          author: info.a || "YouTube",
          cover_image: thumb,
          download_url_no_watermark: videoLink,
          download_url_hd: videoLink,
          music_url: audioLink,
          quality: bestQ ? (bestQ + 'p') : 'auto'
        });
      }
    }
  } catch (_) {}

  // পদ্ধতি ২: ssyoutube / savefrom-style ফলব্যাক (ID শুধু thumbnail)
  try {
    const idMatch = videoUrl.match(/(?:v=|\/shorts\/|youtu\.be\/)([\w-]{11})/);
    if (idMatch) {
      const vid = idMatch[1];
      const thumb = `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`;
      return res.json({
        success: true, platform: "youtube",
        title: "YouTube Video (Direct)",
        author: "YouTube",
        cover_image: thumb,
        download_url_no_watermark: null,
        download_url_hd: null,
        music_url: null,
        note: "সরাসরি ডাউনলোড লিংক তৈরি করা যায়নি — YouTube সার্ভার সাময়িকভাবে রিসলভার ব্লক করছে। কিছুক্ষণ পরে আবার চেষ্টা করুন।"
      });
    }
  } catch (_) {}

  return res.status(404).json({ success: false, error: "YouTube ভিডিও রিসলভ করা যায়নি।" });
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
