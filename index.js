const express = require("express");
const ytSearch = require("yt-search");
const ytdl = require("@distube/ytdl-core");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = 7860;

app.use(cors());

// Pastikan folder /tmp tersedia (di server cloud mungkin sudah ada)
const TMP_DIR = "/tmp";
if (!fs.existsSync(TMP_DIR)) {
    fs.mkdirSync(TMP_DIR);
}

const agent = ytdl.createAgent(require("./cookie.json"));

function formatBytes(bytes) {
    if (bytes === 0) return "0 Bytes";
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + " " + sizes[i];
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
        uploadDate: details.uploadDate,
        views: details.viewCount.toLocaleString(),
        likes: (details.likes || 0).toLocaleString(),
    };
}

app.get("/video", async (req, res) => {
    const { url } = req.query;
    if (!url || !ytdl.validateURL(url)) {
        return res.status(400).json({ error: "URL tidak valid" });
    }

    try {
        const infoFull = await ytdl.getInfo(url, { agent });
        const videoFormat = ytdl.chooseFormat(infoFull.formats, { filter: "videoandaudio", quality: "highest" });

        const filename = `video-${Date.now()}.mp4`;
        const filePath = path.join(TMP_DIR, filename);
        const videoStream = ytdl(url, { format: videoFormat, agent });

        const writeStream = fs.createWriteStream(filePath);
        videoStream.pipe(writeStream);

        writeStream.on("finish", async () => {
            const info = await getVideoInfo(url);
            res.json({
                info,
                result: {
                    quality: videoFormat.qualityLabel || "Tidak diketahui",
                    size: videoFormat.contentLength ? formatBytes(parseInt(videoFormat.contentLength)) : "Ukuran tidak tersedia",
                    url: `${req.hostname}/files/${filename}`, // Akses langsung ke file
                },
            });
        });
    } catch (error) {
        console.log(error);
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
        const audioFormat = ytdl.chooseFormat(infoFull.formats, { filter: "audioonly" });

        const filename = `audio-${Date.now()}.mp3`;
        const filePath = path.join(TMP_DIR, filename);
        const audioStream = ytdl(url, { format: audioFormat, agent });

        const writeStream = fs.createWriteStream(filePath);
        audioStream.pipe(writeStream);

        writeStream.on("finish", async () => {
            const info = await getVideoInfo(url);
            res.json({
                info,
                result: {
                    quality: `${audioFormat.audioBitrate} kbps`,
                    size: audioFormat.contentLength ? formatBytes(parseInt(audioFormat.contentLength)) : "Ukuran tidak tersedia",
                    url: `${req.hostname}/files/${filename}`, // Akses langsung ke file
                },
            });
        });
    } catch (error) {
        console.log(error);
        res.status(500).json({ error: "Gagal memproses audio", details: error.message });
    }
});

// Route untuk akses langsung file yang sudah didownload
app.use("/files", express.static(TMP_DIR));

app.listen(PORT, () => {
    console.log(`Server berjalan di http://localhost:${PORT}`);
});
