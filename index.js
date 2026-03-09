const express = require("express");
const ytdl = require("@distube/ytdl-core");
const fs = require("fs");
const path = require("path");
const cors = require("cors");

const app = express();
const PORT = 7860;

const downloadDir = path.join(__dirname, "public");
if (!fs.existsSync(downloadDir)) {
    fs.mkdirSync(downloadDir, { recursive: true });
}

app.use(cors());
app.use("/files", express.static(downloadDir));

function formatBytes(bytes) {
    if (bytes === 0) return "0 Bytes";
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + " " + sizes[i];
}

async function getVideoInfo(url) {
    const info = await ytdl.getInfo(url);
    const details = info.videoDetails;
    return {
        title: details.title,
        thumbnail: details.thumbnails.pop().url,
        duration: `${Math.floor(details.lengthSeconds / 60)}:${details.lengthSeconds % 60} मिनट`,
        uploader: details.author.name,
        views: details.viewCount.toLocaleString(),
        uploadDate: details.uploadDate,
    };
}

app.get("/video", async (req, res) => {
    const { url } = req.query;
    if (!url || !ytdl.validateURL(url)) {
        return res.status(400).json({ error: "URL गलत है!" });
    }

    try {
        const info = await getVideoInfo(url);
        const videoFormat = await ytdl.getInfo(url).then(info => 
            ytdl.chooseFormat(info.formats, { quality: "highestvideo" })
        );

        const filename = `video-${Date.now()}.mp4`;
        const filepath = path.join(downloadDir, filename);
        const writeStream = fs.createWriteStream(filepath);

        ytdl(url, { format: videoFormat }).pipe(writeStream);

        writeStream.on("finish", () => {
            res.json({
                info,
                download: {
                    quality: videoFormat.qualityLabel || "Unknown",
                    size: videoFormat.contentLength ? formatBytes(parseInt(videoFormat.contentLength)) : "Unknown",
                    url: `${req.protocol}://${req.get('host')}/files/${filename}`,
                },
            });
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "वीडियो डाउनलोड करने में समस्या हुई!", details: error.message });
    }
});

app.get("/audio", async (req, res) => {
    const { url } = req.query;
    if (!url || !ytdl.validateURL(url)) {
        return res.status(400).json({ error: "URL गलत है!" });
    }

    try {
        const info = await getVideoInfo(url);
        const audioFormat = await ytdl.getInfo(url).then(info => 
            ytdl.chooseFormat(info.formats, { filter: "audioonly" })
        );

        const filename = `audio-${Date.now()}.mp3`;
        const filepath = path.join(downloadDir, filename);
        const writeStream = fs.createWriteStream(filepath);

        ytdl(url, { format: audioFormat }).pipe(writeStream);

        writeStream.on("finish", () => {
            res.json({
                info,
                download: {
                    quality: `${audioFormat.audioBitrate} kbps`,
                    size: audioFormat.contentLength ? formatBytes(parseInt(audioFormat.contentLength)) : "Unknown",
                    url: `${req.protocol}://${req.get('host')}/files/${filename}`,
                },
            });
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "ऑडियो डाउनलोड करने में समस्या हुई!", details: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 सर्वर चालू है: http://localhost:${PORT}`);
});
