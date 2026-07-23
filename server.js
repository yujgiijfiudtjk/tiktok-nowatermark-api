const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;

// CORS এবং JSON মিডেলওয়্যার
app.use(cors());
app.use(express.json());

/* ─── ব্রাউজার হেডার্স (আপডেটেড Chrome 124 → 136) ──────────────────── */
const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "Origin": "https://www.tiktok.com",
  "Referer": "https://www.tiktok.com/",
  "sec-ch-ua": '"Chromium";v="136", "Google Chrome";v="136", "Not.A/Brand";v="99"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"Windows"',
  "sec-fetch-dest": "empty",
  "sec-fetch-mode": "cors",
  "sec-fetch-site": "same-origin"
};

/* ─── সাহায্যকারী: retry সহ axios রিকোয়েস্ট ─────────────────────────── */
async function fetchWithRetry(url, options = {}, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await axios.get(url, {
        headers: BROWSER_HEADERS,
        timeout: 15000,
        ...options
      });
      return res;
    } catch (err) {
      if (i === retries) throw err;
      // retry-র আগে একটু অপেক্ষা
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
}

/* ─── সাহায্যকারী: অ্যাকাউন্ট বয়স ক্যালকুলেট ────────────────────────── */
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

/* ─── সাহায্যকারী: music URL নিরাপদে বের করা ────────────────────────── */
function getMusicUrl(v) {
  // tikwm API পরিবর্তনের কারণে একাধিক ফিল্ড চেক করা হচ্ছে
  if (typeof v.music === "string" && v.music.startsWith("http")) return v.music;
  if (v.music_info && v.music_info.play_url) return v.music_info.play_url;
  if (v.music_info && v.music_info.play) return v.music_info.play;
  return null;
}

/* ───────────────────────────────────────────────────────────────
   ১. ট্যাব ১: সিঙ্গেল ভিডিও ডাউনলোডার এন্ডপয়েন্ট (/download)
   ─────────────────────────────────────────────────────────────── */
app.get("/download", async (req, res) => {
  const videoUrl = req.query.url;
  if (!videoUrl) {
    return res.status(400).json({ success: false, error: "ভিডিও URL প্রদান করুন।" });
  }

  try {
    const apiUrl = `https://www.tikwm.com/api/?url=${encodeURIComponent(videoUrl)}&hd=1`;
    const response = await fetchWithRetry(apiUrl);
    const data = response.data;

    if (data.code === 0 && data.data) {
      const v = data.data;

      // author ফিল্ড: tikwm কখনো author object, কখনো author_id/nickname আলাদা দেয়
      const authorId =
        (v.author && (v.author.unique_id || v.author.uniqueId)) ||
        v.author_unique_id ||
        "Unknown";
      const authorName =
        (v.author && v.author.nickname) ||
        v.author_nickname ||
        "Unknown";

      return res.json({
        success: true,
        title: v.title || "TikTok Video",
        author: authorId,
        author_name: authorName,
        cover_image: v.cover || v.origin_cover || null,
        download_url_no_watermark: v.play || null,
        download_url_hd: v.hdplay || v.play || null,
        music_url: getMusicUrl(v)
      });
    } else {
      return res.status(404).json({ success: false, error: "ভিডিওর ডেটা পাওয়া যায়নি বা লিংকটি ভুল।" });
    }
  } catch (error) {
    const msg = error.response
      ? `tikwm সার্ভার এরর: ${error.response.status}`
      : "সার্ভারে সমস্যা হয়েছে। আবার চেষ্টা করুন।";
    return res.status(500).json({ success: false, error: msg });
  }
});

/* ───────────────────────────────────────────────────────────────
   ২. ট্যাব ২: ইউজারের সব ভিডিও এন্ডপয়েন্ট (/user)
   ─────────────────────────────────────────────────────────────── */
app.get("/user", async (req, res) => {
  const username = req.query.username;
  if (!username) {
    return res.status(400).json({ success: false, error: "ইউজারনেম প্রদান করুন।" });
  }

  const cleanUser = username.replace("@", "").trim();

  // ─── পদ্ধতি ১: tikwm user/posts (প্রাথমিক) ───
  try {
    const apiUrl = `https://www.tikwm.com/api/user/posts?unique_id=${encodeURIComponent(cleanUser)}&count=50`;
    const response = await fetchWithRetry(apiUrl);
    const data = response.data;

    if (data.code === 0 && data.data) {
      // tikwm কখনো data.videos, কখনো data.list নামে পাঠায়
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

        return res.json({
          success: true,
          username: cleanUser,
          total_fetched: videoList.length,
          videos: videoList
        });
      }
    }
  } catch (_) {
    // tikwm ব্লক বা ফেল করলে পরের পদ্ধতিতে যাও
  }

  // ─── পদ্ধতি ২: প্রতিটি ভিডিও আলাদাভাবে আনা (user/info দিয়ে fallback) ───
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
        note: "ভিডিও তালিকা লোড করা যায়নি (tikwm সীমাবদ্ধতা)। প্রোফাইল তথ্য পাওয়া গেছে।",
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

  // ─── পদ্ধতি ৩: oEmbed ব্যাকআপ ───
  try {
    const fallback = await axios.get(
      `https://www.tiktok.com/oembed?url=https://www.tiktok.com/@${encodeURIComponent(cleanUser)}`,
      { timeout: 8000 }
    );
    if (fallback.data && fallback.data.author_name) {
      return res.json({
        success: true,
        username: cleanUser,
        total_fetched: 1,
        videos: [{
          title: `${fallback.data.author_name}'s Profile Content`,
          cover_image: fallback.data.thumbnail_url,
          download_url_no_watermark: `https://www.tiktok.com/@${cleanUser}`,
          views: "N/A",
          likes: "N/A"
        }]
      });
    }
  } catch (_) {}

  return res.status(404).json({ success: false, error: "ইউজারের ভিডিও পাওয়া যায়নি বা অ্যাকাউন্টটি প্রাইভেট।" });
});

/* ───────────────────────────────────────────────────────────────
   ৩. ট্যাব ৩: ভিডিও কমেন্ট স্ক্র্যাপার এন্ডপয়েন্ট (/comments)
   ─────────────────────────────────────────────────────────────── */
app.get("/comments", async (req, res) => {
  const videoUrl = req.query.url;
  if (!videoUrl) {
    return res.status(400).json({ success: false, error: "ভিডিও URL আবশ্যক।" });
  }

  try {
    const apiUrl = `https://www.tikwm.com/api/comment/list?url=${encodeURIComponent(videoUrl)}&count=50`;
    const response = await fetchWithRetry(apiUrl);
    const data = response.data;

    if (data.code === 0 && data.data && data.data.comments) {
      const commentList = data.data.comments.map(c => ({
        // ফিল্ড নাম পরিবর্তন: আগে c.cid ছিল, এখন c.id
        comment_id: c.cid || c.id || null,
        comment_text: c.text || "",
        comment_time: c.create_time
          ? new Date(c.create_time * 1000).toLocaleString()
          : "Unknown",
        likes: c.digg_count || 0,
        user: {
          username: (c.user && (c.user.unique_id || c.user.uniqueId)) || "unknown",
          nickname: (c.user && c.user.nickname) || "Anonymous",
          // আগে c.user.avatar_thumb.url_list[0] ছিল, এখন c.user.avatar সরাসরি
          avatar:
            (c.user && c.user.avatar) ||
            (c.user &&
              c.user.avatar_thumb &&
              c.user.avatar_thumb.url_list &&
              c.user.avatar_thumb.url_list[0]) ||
            ""
        }
      }));

      return res.json({
        success: true,
        total_comments_fetched: commentList.length,
        comments: commentList
      });
    } else {
      return res.status(404).json({ success: false, error: "এই ভিডিওতে কোনো কমেন্ট পাওয়া যায়নি।" });
    }
  } catch (error) {
    return res.status(500).json({ success: false, error: "কমেন্ট লোড করতে ব্যর্থ হয়েছে।" });
  }
});

/* ───────────────────────────────────────────────────────────────
   ৪. ট্যাব ৪: প্রোফাইল ইনফো ও চেকার এন্ডপয়েন্ট (/user/info)
   ─────────────────────────────────────────────────────────────── */
app.get("/user/info", async (req, res) => {
  const username = req.query.username;
  if (!username) {
    return res.status(400).json({ success: false, error: "ইউজারনেম দিন।" });
  }

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
        // ফিল্ড পরিবর্তন: heartCount বা heart উভয়ই সাপোর্ট
        likes: stats.heartCount || stats.heart || stats.diggCount || 0,
        videos: stats.videoCount || stats.video_count || 0,
        creationDate: timeInfo.creationDate,
        accountAge: timeInfo.accountAge
      });
    } else {
      // oEmbed ব্যাকআপ
      const fallback = await axios.get(
        `https://www.tiktok.com/oembed?url=https://www.tiktok.com/@${encodeURIComponent(cleanUser)}`,
        { timeout: 8000 }
      );
      if (fallback.data && fallback.data.author_name) {
        return res.json({
          success: true,
          username: cleanUser,
          nickname: fallback.data.author_name,
          avatar: fallback.data.thumbnail_url || null,
          bio: "TikTok Profile",
          verified: false,
          followers: "N/A",
          following: "N/A",
          likes: "N/A",
          videos: "N/A",
          creationDate: "Unknown",
          accountAge: "Unknown"
        });
      }
      return res.status(404).json({ success: false, error: "প্রোফাইল ডেটা পাওয়া যায়নি।" });
    }
  } catch (error) {
    return res.status(500).json({ success: false, error: "প্রোফাইল চেক করতে সমস্যা হয়েছে।" });
  }
});

/* ─── রুট রুট (সার্ভার লাইভ চেক) ─────────────────────────────────────── */
app.get("/", (req, res) => {
  res.json({ status: "🚀 TikTok Advanced Multi-Tab API is perfectly running!" });
});

// সার্ভার চালু করা
app.listen(PORT, () => {
  console.log(`Server hosted successfully on port ${PORT}`);
});
