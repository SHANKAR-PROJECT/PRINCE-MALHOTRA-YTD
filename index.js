const express = require("express");
const ytSearch = require("yt-search");
const ytdl = require("@distube/ytdl-core");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = 7860;

const tempDir = path.join(__dirname, "public");
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir);
}

app.use(cors());
app.use("/files", express.static(tempDir));

let agent;
try {
  agent = ytdl.createAgent(require("./cookie.json")); // load cookies
  console.log("✅ Cookie agent loaded");
} catch (error) {
  console.log("⚠️ Cookie agent creation failed, using default");
  agent = null;
}

// Utility formatters
function formatBytes(bytes) {
  if (bytes === 0) return "0 Bytes";
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + " " + sizes[i];
}

function formatNumber(num) {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

async function getVideoInfo(url) {
  const infoOptions = agent ? { agent } : {};
  const info = await ytdl.getInfo(url, infoOptions);
  const details = info.videoDetails;
  return {
    title: details.title,
    description: details.description || "No description",
    thumbnail: details.thumbnails.pop().url,
    duration: `${Math.floor(details.lengthSeconds / 60)}:${details.lengthSeconds % 60} minutes`,
    uploader: details.author.name,
    uploadDate: details.uploadDate,
    views: formatNumber(details.viewCount),
    likes: formatNumber(details.likes || 0),
  };
}

// 🎥 Download Video
app.get("/video", async (req, res) => {
  const { url } = req.query;
  if (!url || !ytdl.validateURL(url)) {
    return res.status(400).json({ error: "Invalid YouTube URL" });
  }

  try {
    const infoOptions = agent ? { agent } : {};
    const infoFull = await ytdl.getInfo(url, infoOptions);
    let formats = infoFull.formats;

    let videoFormat;
    try {
      videoFormat = ytdl.chooseFormat(formats, { filter: "audioandvideo", quality: "highest" });
    } catch {
      videoFormat = formats.find(f => f.hasVideo && f.hasAudio) || formats[0];
    }

    const info = await getVideoInfo(url);
    const filename = `video-${Date.now()}.mp4`;
    const filePath = path.join(tempDir, filename);

    const streamOptions = { format: videoFormat };
    if (agent) streamOptions.agent = agent;

    const videoStream = ytdl(url, streamOptions);
    const writeStream = fs.createWriteStream(filePath);

    videoStream.pipe(writeStream);
    writeStream.on("finish", () => {
      res.json({
        info,
        result: {
          quality: videoFormat.qualityLabel || "Unknown",
          size: videoFormat.contentLength ? formatBytes(parseInt(videoFormat.contentLength)) : "Unavailable",
          url: `${req.protocol}://${req.get("host")}/files/${filename}`,
        },
      });
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to process video", details: error.message });
  }
});

// 🎵 Download Audio
app.get("/audio", async (req, res) => {
  const { url } = req.query;
  if (!url || !ytdl.validateURL(url)) {
    return res.status(400).json({ error: "Invalid YouTube URL" });
  }

  try {
    const infoOptions = agent ? { agent } : {};
    const infoFull = await ytdl.getInfo(url, infoOptions);
    let formats = infoFull.formats;

    let audioFormat;
    try {
      audioFormat = ytdl.chooseFormat(formats, { filter: "audioonly" });
    } catch {
      audioFormat = formats.find(f => f.hasAudio && !f.hasVideo) || formats.find(f => f.hasAudio);
    }

    const info = await getVideoInfo(url);
    const filename = `audio-${Date.now()}.mp3`;
    const filePath = path.join(tempDir, filename);

    const streamOptions = { format: audioFormat };
    if (agent) streamOptions.agent = agent;

    const audioStream = ytdl(url, streamOptions);
    const writeStream = fs.createWriteStream(filePath);

    audioStream.pipe(writeStream);
    writeStream.on("finish", () => {
      res.json({
        info,
        result: {
          quality: `${audioFormat.audioBitrate || "??"} kbps`,
          size: audioFormat.contentLength ? formatBytes(parseInt(audioFormat.contentLength)) : "Unavailable",
          url: `${req.protocol}://${req.get("host")}/files/${filename}`,
        },
      });
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to process audio", details: error.message });
  }
});

// 🔍 Search
app.get("/search", async (req, res) => {
  const query = req.query.q;
  if (!query) {
    return res.status(400).json({ error: "Query parameter 'q' is required" });
  }

  try {
    const result = await ytSearch(query);
    const videos = result.videos.map(video => ({
      title: video.title,
      channel: video.author.name,
      views: formatNumber(video.views),
      duration: video.timestamp,
      uploaded: video.ago,
      url: video.url,
      thumbnail: video.thumbnail,
    }));
    res.json({ query, results: videos });
  } catch (error) {
    console.error("Error fetching YouTube search:", error);
    res.status(500).json({ error: "Failed to fetch search results", details: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
