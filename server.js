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

/* ─── Route: Get TikTok Video No-Watermark Link ──────────────── */
app.get("/download", async (req, res) => {
  const videoUrl = req.query.url;

  if (!videoUrl) {
    return res.status(400).json({ 
      success: false, 
      error: "অনুগ্রহ করে একটি সঠিক TikTok ভিডিও URL প্রদান করুন। (যেমন: ?url=https://www.tiktok.com/@user/video/123...)" 
    });
  }

  try {
    // আমরা এখানে tikwm এর পাবলিক API ব্যবহার করছি যা খুব জনপ্রিয় এবং ফ্রী
    const apiUrl = `https://www.tikwm.com/api/?url=${encodeURIComponent(videoUrl)}&hd=1`;

    const response = await axios.get(apiUrl, {
      headers: BROWSER_HEADERS,
      timeout: 10000,
    });

    const data = response.data;

    // API থেকে সফল রেসপন্স পেলে
    if (data.code === 0 && data.data) {
      const videoData = data.data;
      
      return res.json({
        success: true,
        original_url: videoUrl,
        title: videoData.title,
        author: videoData.author?.unique_id,
        author_name: videoData.author?.nickname,
        cover_image: videoData.cover,
        // ওয়াটারমার্ক ছাড়া সাধারণ কোয়ালিটির লিংক
        download_url_no_watermark: videoData.play, 
        // ওয়াটারমার্ক ছাড়া এইচডি (HD) কোয়ালিটির লিংক (যদি থাকে)
        download_url_hd: videoData.hdplay || videoData.play,
        // ব্যাকগ্রাউন্ড মিউজিক লিংক
        music_url: videoData.music 
      });
    } else {
      return res.status(404).json({ 
        success: false, 
        error: "ভিডিওর ডেটা পাওয়া যায়নি। ভিডিওটি হয়তো প্রাইভেট অথবা ডিলিট হয়ে গেছে।" 
      });
    }
  } catch (error) {
    console.log("Error fetching video:", error.message);
    return res.status(500).json({ 
      success: false, 
      error: "সার্ভারে কোনো সমস্যা হয়েছে। একটু পর আবার চেষ্টা করুন।" 
    });
  }
});

/* ─── Health Check Route ─────────────────────────────────────── */
app.get("/", (req, res) => res.json({ status: "✅ TikTok No-Watermark API is running!" }));

app.listen(PORT, () => console.log(`🚀 Server is running on port ${PORT}`));
