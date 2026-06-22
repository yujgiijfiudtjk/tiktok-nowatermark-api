const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

/* ─── Common Browser Headers ─────────────────────────────────── */
const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
    "AppleWebKit/537.36 (KHTML, like Gecko) " +
    "Chrome/124.0.0.0 Safari/537.36",
  "Accept": "application/json, text/plain, */*",
};

/* ─── [আগের ফিচার] Route: Single Video Download ──────────────── */
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
      const videoData = data.data;
      return res.json({
        success: true,
        title: videoData.title,
        author: videoData.author?.unique_id,
        download_url_no_watermark: videoData.play,
        download_url_hd: videoData.hdplay || videoData.play,
        music_url: videoData.music
      });
    } else {
      return res.status(404).json({ success: false, error: "ভিডিওর ডেটা পাওয়া যায়নি।" });
    }
  } catch (error) {
    return res.status(500).json({ success: false, error: "সার্ভারে সমস্যা হয়েছে।" });
  }
});


/* ─── [ফিচার ১] Route: Bulk User Videos (ইউজারের সব ভিডিও) ─── */
// ব্যবহার করতে ব্রাউজারে লিখবেন: /user?username=ইউজারনেম
app.get("/user", async (req, res) => {
  const username = req.query.username;

  if (!username) {
    return res.status(400).json({ success: false, error: "অনুগ্রহ করে TikTok ইউজারনেম দিন (যেমন: ?username=shorna5988)" });
  }

  // ইউজারনেম থেকে @ চিহ্ন থাকলে তা বাদ দেওয়া
  const cleanUsername = username.replace("@", "");

  try {
    // tikwm এর ইউজার ভিডিও এপিআই (count=২০টি ভিডিও একবারে আনবে, আপনি চাইলে বাড়াতে পারেন)
    const apiUrl = `https://www.tikwm.com/api/user/posts?unique_id=${cleanUsername}&count=20`;
    const response = await axios.get(apiUrl, { headers: BROWSER_HEADERS, timeout: 12000 });
    const data = response.data;

    if (data.code === 0 && data.data && data.data.videos) {
      const videoList = data.data.videos.map(video => ({
        video_id: video.video_id,
        title: video.title,
        cover_image: video.cover,
        views: video.play_count,
        likes: video.digg_count,
        download_url_no_watermark: video.play // প্রতিটি ভিডিওর ওয়াটারমার্ক ছাড়া ডিরেক্ট ডাউনলোড লিংক
      }));

      return res.json({
        success: true,
        username: cleanUsername,
        total_fetched: videoList.length,
        has_more: data.data.hasMore, // আরও ভিডিও আছে কিনা (true/false)
        cursor: data.data.cursor, // পরের পেজের ভিডিও আনার টোকেন
        videos: videoList
      });
    } else {
      return res.status(404).json({ success: false, error: "এই ইউজারের কোনো ভিডিও পাওয়া যায়নি বা ইউজারনেম ভুল।" });
    }
  } catch (error) {
    console.log("User bulk error:", error.message);
    return res.status(500).json({ success: false, error: "ইউজারের ভিডিও লিস্ট আনতে সমস্যা হয়েছে।" });
  }
});


/* ─── [ফিচার ২] Route: Video Comment Scraper (ভিডিওর কমেন্ট) ─── */
// ব্যবহার করতে ব্রাউজারে লিখবেন: /comments?url=ভিডিও_লিংক
app.get("/comments", async (req, res) => {
  const videoUrl = req.query.url;

  if (!videoUrl) {
    return res.status(400).json({ success: false, error: "অনুগ্রহ করে টিকটক ভিডিওর URL দিন।" });
  }

  try {
    // tikwm এর কমেন্ট এপিআই
    const apiUrl = `https://www.tikwm.com/api/comment/list?url=${encodeURIComponent(videoUrl)}&count=20`;
    const response = await axios.get(apiUrl, { headers: BROWSER_HEADERS, timeout: 12000 });
    const data = response.data;

    if (data.code === 0 && data.data && data.data.comments) {
      const commentList = data.data.comments.map(comment => ({
        comment_id: comment.cid,
        comment_text: comment.text,
        comment_time: new Date(comment.create_time * 1000).toLocaleString(),
        likes: comment.digg_count,
        user: {
          username: comment.user?.unique_id,
          nickname: comment.user?.nickname,
          avatar: comment.user?.avatar_thumb?.url_list?.[0]
        }
      }));

      return res.json({
        success: true,
        total_comments_fetched: commentList.length,
        comments: commentList
      });
    } else {
      return res.status(404).json({ success: false, error: "এই ভিডিওতে কোনো কমেন্ট পাওয়া যায়নি বা এপিআই রেসপন্স খালি।" });
    }
  } catch (error) {
    console.log("Comments fetch error:", error.message);
    return res.status(500).json({ success: false, error: "কমেন্ট স্ক্র্যাপ করতে সমস্যা হয়েছে।" });
  }
});


/* ─── Health Check Route ─────────────────────────────────────── */
app.get("/", (req, res) => res.json({ status: "✅ TikTok Super API is running with Bulk & Comment features!" }));

app.listen(PORT, () => console.log(`🚀 Server is running on port ${PORT}`));
        
