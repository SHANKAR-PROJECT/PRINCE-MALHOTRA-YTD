const express = require("express");
const ytSearch = require("yt-search");
const ytdl = require("@distube/ytdl-core");
const axios = require("axios");
const path = require("path");
const cors = require("cors");
const fs = require("fs")
const app = express();
const PORT = 7860;

const tempDir = '/tmp/public'//path.join(__dirname, 'public');
if (!fs.existsSync(tempDir)) {
fs.mkdirSync(tempDir);
}

app.use(cors());

app.use("/files", express.static(tempDir));

let agent;
try {
  agent = ytdl.createAgent(require("./cookie.json"));
} catch (error) {
  console.log("Cookie agent creation failed, using default");
  agent = null;
}

function formatBytes(bytes) {
if (bytes === 0) return "0 Bytes";
const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
const i = Math.floor(Math.log(bytes) / Math.log(1024));
return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + " " + sizes[i];
}

function formatDate(dateString) {
const months = [
"Januari", "Februari", "Maret", "April", "Mei", "Juni",
"Juli", "Agustus", "September", "Oktober", "November", "Desember"
];
const date = new Date(dateString);
return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
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
description: details.description || "Tidak ada deskripsi",
thumbnail: details.thumbnails.pop().url,
duration: `${Math.floor(details.lengthSeconds / 60)}:${details.lengthSeconds % 60} menit`,
uploader: details.author.name,
uploadDate: formatDate(details.uploadDate),
views: formatNumber(details.viewCount),
likes: formatNumber(details.likes || 0),
};
}

app.get("/video", async (req, res) => {
const { url } = req.query;
if (!url || !ytdl.validateURL(url)) {
return res.status(400).json({ error: "URL tidak valid" });
}
try {
const infoOptions = agent ? { agent } : {};
const infoFull = await ytdl.getInfo(url, infoOptions);
let formats = infoFull.formats;
if (!Array.isArray(formats)) {
formats = Object.values(formats);
}

// Try different format selection strategies
let videoFormat;
try {
  videoFormat = ytdl.chooseFormat(formats, { filter: "videoandaudio", quality: "highest" });
} catch (formatError) {
  console.log("Primary format selection failed, trying alternative");
  try {
    videoFormat = ytdl.chooseFormat(formats, { quality: "highest" });
  } catch (secondError) {
    videoFormat = formats.find(f => f.hasVideo && f.hasAudio) || formats[0];
  }
}
const info = await getVideoInfo(url);
const streamOptions = { format: videoFormat };
if (agent) streamOptions.agent = agent;
const videoStream = ytdl(url, streamOptions);
const filename = `video-${Date.now()}.mp4`
const writeStream = fs.createWriteStream(tempDir + '/' + filename);
videoStream.pipe(writeStream);
writeStream.on("finish", async () => {
res.json({
info,
result: {
quality: videoFormat.qualityLabel || "Tidak diketahui",
size: videoFormat.contentLength ? formatBytes(parseInt(videoFormat.contentLength)) : "Ukuran tidak tersedia",
url: `${req.protocol}://${req.get('host')}/files/${filename}`,
},
});
});
} catch (error) {
console.log(error)
res.status(500).json({ error: "Gagal memproses video", details: error.message });
}
});

app.get("/audio", async (req, res) => {
const { url } = req.query;
if (!url || !ytdl.validateURL(url)) {
return res.status(400).json({ error: "URL tidak valid" });
}
try {
const infoOptions = agent ? { agent } : {};
const infoFull = await ytdl.getInfo(url, infoOptions);
let formats = infoFull.formats;
if (!Array.isArray(formats)) {
formats = Object.values(formats);
}

let audioFormat;
try {
  audioFormat = ytdl.chooseFormat(formats, { filter: "audioonly" });
} catch (formatError) {
  console.log("Audio format selection failed, trying alternative");
  audioFormat = formats.find(f => f.hasAudio && !f.hasVideo) || formats.find(f => f.hasAudio);
}

const info = await getVideoInfo(url);
const streamOptions = { format: audioFormat };
if (agent) streamOptions.agent = agent;
const audioStream = ytdl(url, streamOptions);
const filename = `audio-${Date.now()}.mp3`
const writeStream = fs.createWriteStream(tempDir + '/' + filename);
audioStream.pipe(writeStream);
writeStream.on("finish", async () => {
res.json({
info,
result: {
quality: `${audioFormat.audioBitrate} kbps`,
size: audioFormat.contentLength ? formatBytes(parseInt(audioFormat.contentLength)) : "Ukuran tidak tersedia",
url: `${req.protocol}://${req.get('host')}/files/${filename}`,
},
});
});
} catch (error) {
console.log(error)
res.status(500).json({ error: "Gagal memproses audio", details: error.message });
}
});

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
thumbnail: video.thumbnail
}));

res.json({ query, results: videos });
} catch (error) {
console.error("Error fetching YouTube search:", error);
res.status(500).json({ error: "Failed to fetch search results", details: error.message });
}
});

app.listen(PORT, () => {
console.log(`Server berjalan di http://localhost:${PORT}`);
});
