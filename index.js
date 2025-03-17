const express = require("express");
const ytSearch = require("yt-search");
const ytdl = require("@distube/ytdl-core");
const axios = require("axios");
const FormData = require("form-data");
const cors = require("cors");

const app = express();
const PORT = 7860;

app.use(cors());

// ytdl के लिए cookie.json (अगर ज़रूरी हो)
const agent = ytdl.createAgent(require("./cookie.json"));

// 👉 Bytes को human-readable format में बदलना
function formatBytes(bytes) {
    if (bytes === 0) return "0 Bytes";
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + " " + sizes[i];
}

// 👉 YouTube वीडियो की जानकारी निकालना
async function getVideoInfo(url) {
    const info = await ytdl.getInfo(url, { agent });
    const details = info.videoDetails;
    return {
        title: details.title,
        description: details.description || "No description",
        thumbnail: details.thumbnails.pop().url,
        duration: `${Math.floor(details.lengthSeconds / 60)}:${details.lengthSeconds % 60} minutes`,
        uploader: details.author.name,
        views: details.viewCount.toLocaleString(),
        uploadDate: details.uploadDate
    };
}

// 👉 YouTube ऑडियो को buffer में डाउनलोड करना
async function downloadToBuffer(url, format) {
    const chunks = [];
    const stream = ytdl(url, { format, agent });
    return new Promise((resolve, reject) => {
        stream.on("data", chunk => chunks.push(chunk));
        stream.on("end", () => resolve(Buffer.concat(chunks)));
        stream.on("error", reject);
    });
}

// 👉 Catbox पर ऑडियो अपलोड करना
async function catbox(mediaBuffer, filename) {
    try {
        const form = new FormData();
        form.append("reqtype", "fileupload");
        form.append("fileToUpload", mediaBuffer, filename);

        const response = await axios.post("https://catbox.moe/user/api.php", form, {
            headers: { ...form.getHeaders() },
        });

        return response.data;
    } catch (error) {
        throw new Error("Failed to upload to Catbox");
    }
}

// 🎵 **Audio Download API**
app.get("/audio", async (req, res) => {
    try {
        const { url } = req.query;
        if (!url || !ytdl.validateURL(url)) {
            return res.status(400).json({ error: "Invalid URL" });
        }

        const infoFull = await ytdl.getInfo(url, { agent });
        const formats = infoFull.formats.filter(f => f.hasAudio && !f.hasVideo);

        if (!formats.length) {
            return res.status(500).json({ error: "No suitable audio format found" });
        }

        const audioFormat = ytdl.chooseFormat(formats, { filter: "audioonly" });
        const buffer = await downloadToBuffer(url, audioFormat);
        const audioUrl = await catbox(buffer, "audio.mp3");

        res.json({
            info: await getVideoInfo(url),
            result: {
                quality: `${audioFormat.audioBitrate} kbps`,
                size: audioFormat.contentLength ? formatBytes(parseInt(audioFormat.contentLength)) : "Size not available",
                url: audioUrl
            },
        });
    } catch (error) {
        res.status(500).json({ error: "Failed to process audio", details: error.message });
    }
});

// 🔍 **YouTube Search API**
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
            views: video.views.toLocaleString(),
            duration: video.timestamp,
            uploaded: video.ago,
            url: video.url,
            thumbnail: video.thumbnail
        }));

        res.json({ query, results: videos });
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch search results", details: error.message });
    }
});

// 🚀 **Server Start**
app.listen(PORT, () => {
    console.log(`Server चल रहा है: http://localhost:${PORT}`);
});
