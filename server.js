const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;

// CORS এবং JSON মিডেলওয়্যার (আপনার ফ্রন্টএন্ড যেন ডেটা পায়)
app.use(cors());
app.use(express.json());

/* ─── ব্রাউজার হেডার্স (টিকটক ব্লকিং এড়ানোর জন্য) ────────────────── */
const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9"
};

const http = axios.create({
  timeout: 15000,
  headers: BROWSER_HEADERS,
  // HTTP 4xx/5xx response-কে exception না বানিয়ে আমরা নিচে পরিষ্কার error পাঠাব।
  validateStatus: () => true
});

function isTikTokVideoUrl(value) {
  try {
    const parsed = new URL(value);
    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
    return ["tiktok.com", "vm.tiktok.com", "vt.tiktok.com", "m.tiktok.com"].includes(hostname);
  } catch {
    return false;
  }
}

function upstreamError(response) {
  const status = response?.status;
  if (status === 429) return { status: 429, message: "ভিডিও সার্ভিসে সাময়িক রেট-লিমিট হয়েছে। কিছুক্ষণ পরে আবার চেষ্টা করুন।" };
  if (status >= 500) return { status: 502, message: "ভিডিও ডেটা সার্ভিসটি সাময়িকভাবে সাড়া দিচ্ছে না। পরে আবার চেষ্টা করুন।" };
  return { status: 502, message: "ভিডিও ডেটা সার্ভিস থেকে বৈধ উত্তর পাওয়া যায়নি।" };
}

async function getTikwmVideo(videoUrl) {
  let lastResponse;
  // ক্ষণস্থায়ী network/upstream সমস্যার জন্য একবার retry।
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await http.get("https://www.tikwm.com/api/", {
        params: { url: videoUrl, hd: 1 }
      });
      lastResponse = response;
      if (response.status === 200 && response.data?.code === 0 && response.data?.data) {
        return response.data.data;
      }
      if (response.status < 500 && response.status !== 429) break;
    } catch (error) {
      console.error("TikWM network error:", error.code || error.message);
    }
    if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 700));
  }

  const error = new Error("TikWM request failed");
  error.upstream = lastResponse;
  throw error;
}

/* ─── সাহায্যকারী ফাংশন (অ্যাকাউন্ট বয়স ক্যালকুলেট করার জন্য) ─── */
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

/* ───────────────────────────────────────────────────────────────
   ১. ট্যাব ১: সিঙ্গেল ভিডিও ডাউনলোডার এন্ডপয়েন্ট (/download)
   ─────────────────────────────────────────────────────────────── */
app.get("/download", async (req, res) => {
  const videoUrl = typeof req.query.url === "string" ? req.query.url.trim() : "";
  if (!videoUrl) {
    return res.status(400).json({ success: false, error: "ভিডিও URL প্রদান করুন।" });
  }
  if (!isTikTokVideoUrl(videoUrl)) {
    return res.status(400).json({ success: false, error: "একটি বৈধ TikTok ভিডিও URL দিন।" });
  }

  try {
    const v = await getTikwmVideo(videoUrl);
    return res.json({
      success: true,
      title: v.title || "TikTok Video",
      author: v.author?.unique_id || "Unknown",
      author_name: v.author?.nickname || "Unknown",
      cover_image: v.cover || "",
      download_url_no_watermark: v.play || "",
      download_url_hd: v.hdplay || v.play || "",
      music_url: v.music || ""
    });
  } catch (error) {
    const failure = upstreamError(error.upstream);
    console.error("/download failed:", error.upstream?.status || error.message);
    return res.status(failure.status).json({ success: false, error: failure.message });
  }
});

/* ───────────────────────────────────────────────────────────────
   ২. ট্যাব ২: ইউজারের সব ভিডিও এন্ডপয়েন্ট (/user)
   ─────────────────────────────────────────────────────────────── */
app.get("/user", async (req, res) => {
  const username = typeof req.query.username === "string" ? req.query.username : "";
  const cleanUser = username.replace(/^@/, "").trim();
  const count = Math.min(Math.max(Number.parseInt(req.query.count, 10) || 50, 1), 50);
  const cursor = Math.max(Number.parseInt(req.query.cursor, 10) || 0, 0);

  if (!cleanUser) {
    return res.status(400).json({ success: false, error: "ইউজারনেম প্রদান করুন।" });
  }
  if (!/^[A-Za-z0-9._-]{1,80}$/.test(cleanUser)) {
    return res.status(400).json({ success: false, error: "ইউজারনেমটি সঠিক নয়। @ ছাড়া username দিন।" });
  }

  try {
    // TikWM এক রিকোয়েস্টে সর্বোচ্চ ৫০টি ভিডিও দেয়। পরের পেজের জন্য next_cursor ব্যবহার করুন।
    const response = await http.get("https://www.tikwm.com/api/user/posts", {
      params: { unique_id: cleanUser, count, cursor }
    });
    const data = response.data;

    if (response.status === 200 && data?.code === 0 && Array.isArray(data?.data?.videos)) {
      const videoList = data.data.videos.map((video) => ({
        video_id: video.video_id || video.id || "",
        title: video.title || "No Title",
        cover_image: video.cover || "",
        views: video.play_count || 0,
        likes: video.digg_count || 0,
        download_url_no_watermark: video.play || "",
        download_url_hd: video.hdplay || video.play || ""
      }));

      return res.json({
        success: true,
        username: cleanUser,
        total_fetched: videoList.length,
        has_more: Boolean(data.data.hasMore ?? data.data.has_more),
        next_cursor: data.data.cursor ?? data.data.next_cursor ?? null,
        videos: videoList
      });
    }

    // Cloudflare/রিকোয়েস্ট ব্লককে আর internal 500 হিসেবে দেখানো হবে না।
    const failure = upstreamError(response);
    console.error("/user upstream failed:", response.status, data?.msg || "non-JSON response");
    return res.status(failure.status).json({
      success: false,
      error: failure.message,
      details: response.status === 403
        ? "ভিডিও-লিস্ট provider টি এই server-এর request ব্লক করেছে।"
        : (data?.msg || "ইউজারের ভিডিও পাওয়া যায়নি বা অ্যাকাউন্টটি প্রাইভেট।")
    });
  } catch (error) {
    console.error("/user network failed:", error.code || error.message);
    return res.status(502).json({
      success: false,
      error: "ভিডিও-লিস্ট সার্ভিসে সংযোগ করা যায়নি। পরে আবার চেষ্টা করুন।"
    });
  }
});

/* ───────────────────────────────────────────────────────────────
   ৩. ট্যাব ৩: ভিডিও কমেন্ট স্ক্র্যাপার এন্ডপয়েন্ট (/comments)
   ─────────────────────────────────────────────────────────────── */
app.get("/comments", async (req, res) => {
  const videoUrl = req.query.url;
  if (!videoUrl) {
    return res.status(400).json({ success: false, error: "ভিডিও URL আবশ্যক।" });
  }

  try {
    // এখানে count=50 করা হয়েছে যাতে ২০টির চেয়ে বেশি কমেন্ট একসাথে আসে
    const apiUrl = `https://www.tikwm.com/api/comment/list?url=${encodeURIComponent(videoUrl)}&count=50`;
    const response = await axios.get(apiUrl, { headers: BROWSER_HEADERS, timeout: 12000 });
    const data = response.data;

    if (data.code === 0 && data.data && data.data.comments) {
      const commentList = data.data.comments.map(c => ({
        comment_id: c.cid,
        comment_text: c.text,
        comment_time: new Date(c.create_time * 1000).toLocaleString(),
        likes: c.digg_count || 0,
        user: {
          username: c.user?.unique_id || "unknown",
          nickname: c.user?.nickname || "Anonymous",
          avatar: c.user?.avatar_thumb?.url_list?.[0] || ""
        }
      }));

      return res.json({
        success: true,
        total_comments_fetched: commentList.length,
        comments: commentList
      });
    } else {
      return res.status(404).json({ success: false, error: "এই ভিডিওতে কোনো কমেন্ট পাওয়া যায়নি।" });
    }
  } catch (error) {
    return res.status(500).json({ success: false, error: "কমেন্ট লোড করতে ব্যর্থ হয়েছে।" });
  }
});

/* ───────────────────────────────────────────────────────────────
   ৪. ট্যাব ৪: প্রোফাইল ইনফো ও চেকার এন্ডপয়েন্ট (/profile বা /user/info)
   ─────────────────────────────────────────────────────────────── */
app.get("/user/info", async (req, res) => {
  const username = req.query.username;
  if (!username) {
    return res.status(400).json({ success: false, error: "ইউজারনেম দিন।" });
  }

  const cleanUser = username.replace("@", "").trim();

  try {
    const apiUrl = `https://www.tikwm.com/api/user/info?unique_id=${cleanUser}`;
    const response = await axios.get(apiUrl, { headers: BROWSER_HEADERS, timeout: 10000 });
    const data = response.data;

    if (data.code === 0 && data.data && data.data.user) {
      const u = data.data.user;
      const stats = data.data.stats || {};
      const timeInfo = getDateInfo(u.createTime);

      return res.json({
        success: true,
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
    } else {
      // ওএম্বেড ব্যাকআপ প্রোফাইলের জন্য
      const fallback = await axios.get(`https://www.tiktok.com/oembed?url=https://www.tiktok.com/@${cleanUser}`, { timeout: 8000 });
      if (fallback.data && fallback.data.author_name) {
        return res.json({
          success: true,
          username: cleanUser,
          nickname: fallback.data.author_name,
          avatar: fallback.data.thumbnail_url,
          bio: "TikTok Profile",
          verified: false,
          followers: "N/A",
          following: "N/A",
          likes: "N/A",
          creationDate: "Unknown",
          accountAge: "Unknown"
        });
      }
      return res.status(404).json({ success: false, error: "প্রোফাইল ডেটা পাওয়া যায়নি।" });
    }
  } catch (error) {
    return res.status(500).json({ success: false, error: "প্রোফাইল চেক করতে সমস্যা হয়েছে।" });
  }
});

/* ─── রুট রুট (সার্ভার লাইভ আছে কিনা দেখার জন্য) ────────────────── */
app.get("/", (req, res) => {
  res.json({ status: "🚀 TikTok Advanced Multi-Tab API is perfectly running!" });
});

// সার্ভার চালু করা
app.listen(PORT, () => {
  console.log(`Server hosted successfully on port ${PORT}`);
});
                                              
