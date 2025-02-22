const express = require("express");
const ytSearch = require("yt-search");
const ytdl = require("@distube/ytdl-core");
const axios = require("axios");
const FormData = require("form-data");
const cors = require("cors");
const fs = require("fs")
const app = express();
const PORT = 7860;

app.use(cors());

const agent = ytdl.createAgent(require("./cookie.json"));

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

async function catbox(media, filename) {
try {
const form = new FormData();
form.append("files[]", media, filename)
const response = await axios.post("https://uguu.se/upload.php", form, {
headers: {
...form.getHeaders(),
},
});

return response.data.data.files[0]
} catch (error) {
throw error;
}
}

async function getVideoInfo(url) {
const info = await ytdl.getInfo(url, { agent });
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
const infoFull = await ytdl.getInfo(url, { agent });
let formats = infoFull.formats;
if (!Array.isArray(formats)) {
formats = Object.values(formats);
}
const videoFormat = ytdl.chooseFormat(formats, { filter: "videoandaudio", quality: "highest" });
const info = await getVideoInfo(url);
const videoStream = ytdl(url, { format: videoFormat, agent });

const videoUrl = await catbox(videoStream, "video.mp4");
res.json({
info,
result: {
quality: videoFormat.qualityLabel || "Tidak diketahui",
size: videoFormat.contentLength ? formatBytes(parseInt(videoFormat.contentLength)) : "Ukuran tidak tersedia",
url: videoUrl,
},
});
} catch (error) {
res.status(500).json({ error: "Gagal memproses video", details: error.message });
}
});

app.get("/audio", async (req, res) => {
const { url } = req.query;
if (!url || !ytdl.validateURL(url)) {
return res.status(400).json({ error: "URL tidak valid" });
}
try {
const infoFull = await ytdl.getInfo(url, { agent });
let formats = infoFull.formats;
if (!Array.isArray(formats)) {
formats = Object.values(formats);
}
const audioFormat = ytdl.chooseFormat(formats, { filter: "audioonly" });
const info = await getVideoInfo(url);
const audioStream = ytdl(url, { format: audioFormat, agent });

const audioUrl = await catbox(audioStream, "audio.mp3");
res.json({
info,
result: {
quality: `${audioFormat.audioBitrate} kbps`,
size: audioFormat.contentLength ? formatBytes(parseInt(audioFormat.contentLength)) : "Ukuran tidak tersedia",
url: audioUrl,
},
});
} catch (error) {
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
