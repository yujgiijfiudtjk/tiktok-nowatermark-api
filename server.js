const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;

// CORS এবং JSON মিডেলওয়্যার (আপনার ফ্রন্টএন্ড যেন ডেটা পায়)
app.use(cors());
app.use(express.json());

/* ─── ব্রাউজার হেডারส์ (টিকটক ব্লকিং এড়ানোর জন্য) ────────────────── */
const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "Origin": "https://www.tiktok.com",
  "Referer": "https://www.tiktok.com/"
};

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
   🌟 নতুন যুক্ত হওয়া প্রক্সি ডাউনলোডার রাউট (/stream)
   এটি ব্রাউজারে ফাইল প্লে হওয়া বন্ধ করে সরাসরি ডাউনলোড নিশ্চিত করবে
   ─────────────────────────────────────────────────────────────── */
app.get("/stream", async (req, res) => {
  const fileUrl = req.query.url;
  const type = req.query.type || "video"; // video অথবা music

  if (!fileUrl) {
    return res.status(400).send("ফাইলের ইউআরএল প্রয়োজন।");
  }

  try {
    // টিকটকের এপিআই সার্ভার থেকে ফাইলটি স্ট্রিম আকারে রিকোয়েস্ট করা
    const fileStream = await axios({
      method: "get",
      url: fileUrl,
      headers: BROWSER_HEADERS,
      responseType: "stream",
      timeout: 20000
    });

    // ব্রাউজারকে বাধ্য করার জন্য প্রয়োজনীয় রেসপন্স হেডার সেট করা
    res.setHeader("Access-Control-Allow-Origin", "*");
    
    if (type === "music") {
      res.setHeader("Content-Disposition", 'attachment; filename="tiktok_audio.mp3"');
      res.setHeader("Content-Type", "audio/mpeg");
    } else {
      res.setHeader("Content-Disposition", 'attachment; filename="tiktok_video.mp4"');
      res.setHeader("Content-Type", "video/mp4");
    }

    // ফাইলটি সরাসরি ইউজারের ব্রাউজারে পাইপ (Pipe) বা পুশ করে দেওয়া
    fileStream.data.pipe(res);

  } catch (error) {
    console.error("Streaming Error:", error.message);
    res.status(500).send("ফাইলটি ডাউনলোড করতে সমস্যা হয়েছে। দয়া করে আবার চেষ্টা করুন।");
  }
});

/* ───────────────────────────────────────────────────────────────
   ১. ট্যাব ১: সিঙ্গেল ভিডিও ডাউনলোডার এন্ডপয়েন্ট (/download)
   ─────────────────────────────────────────────────────────────── */
app.get("/download", async (req, res) => {
  const videoUrl = req.query.url;
  if (!videoUrl) {
    return res.status(400).json({ success: false, error: "ভিডিও URL প্রদান করুন।" });
  }

  try {
    const apiUrl = `https://www.tikwm.com/api/?url=${encodeURIComponent(videoUrl)}&hd=1`;
    const response = await axios.get(apiUrl, { headers: BROWSER_HEADERS, timeout: 10000 });
    const data = response.data;

    if (data.code === 0 && data.data) {
      const v = data.data;
      
      // আপনার নিজস্ব এপিআই এর ডোমেইন (যেমন: Render বা Localhost)
      const host = `${req.protocol}://${req.get("host")}`;

      // লিংকগুলোকে আমাদের নতুন প্রক্সি রাউটের মাধ্যমে রি-রুট করা হলো
      return res.json({
        success: true,
        title: v.title || "TikTok Video",
        author: v.author?.unique_id || "Unknown",
        author_name: v.author?.nickname || "Unknown",
        cover_image: v.cover,
        download_url_no_watermark: `${host}/stream?type=video&url=${encodeURIComponent(v.play)}`,
        download_url_hd: `${host}/stream?type=video&url=${encodeURIComponent(v.hdplay || v.play)}`,
        music_url: v.music ? `${host}/stream?type=music&url=${encodeURIComponent(v.music)}` : null
      });
    } else {
      return res.status(404).json({ success: false, error: "ভিডিওর ডেটা পাওয়া যায়নি বা লিংকটি ভুল।" });
    }
  } catch (error) {
    return res.status(500).json({ success: false, error: "সার্ভারে সমস্যা হয়েছে। আবার চেষ্টা করুন।" });
  }
});

/* ───────────────────────────────────────────────────────────────
   ২. ট্যাব ২: ইউজারের সব ভিডিও এন্ডপয়েন্ট (/user)
   ─────────────────────────────────────────────────────────────── */
app.get("/user", async (req, res) => {
  const username = req.query.username;
  if (!username) {
    return res.status(400).json({ success: false, error: "ইউজারনেম প্রদান করুন।" });
  }

  const cleanUser = username.replace("@", "").trim();

  try {
    const apiUrl = `https://www.tikwm.com/api/user/posts?unique_id=${cleanUser}&count=50`;
    const response = await axios.get(apiUrl, { headers: BROWSER_HEADERS, timeout: 12000 });
    const data = response.data;

    if (data.code === 0 && data.data && data.data.videos) {
      const host = `${req.protocol}://${req.get("host")}`;

      const videoList = data.data.videos.map(video => ({
        video_id: video.video_id,
        title: video.title || "No Title",
        cover_image: video.cover,
        views: video.play_count || 0,
        likes: video.digg_count || 0,
        // এখানেও ডাউনলোড লিংক প্রক্সি রাউটে পাঠানো হলো
        download_url_no_watermark: `${host}/stream?type=video&url=${encodeURIComponent(video.play)}`
      }));

      return res.json({
        success: true,
        username: cleanUser,
        total_fetched: videoList.length,
        videos: videoList
      });
    } else {
      const fallback = await axios.get(`https://www.tiktok.com/oembed?url=https://www.tiktok.com/@${cleanUser}`, { timeout: 8000 });
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
      return res.status(404).json({ success: false, error: "ইউজারের ভিডিও পাওয়া যায়নি বা অ্যাকাউন্টটি প্রাইভেট।" });
    }
  } catch (error) {
    return res.status(500).json({ success: false, error: "ইউজার ডেটা রিকোয়েস্ট টাইমআউট হয়েছে।" });
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
          
