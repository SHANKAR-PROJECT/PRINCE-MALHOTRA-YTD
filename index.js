const express = require("express");
const fs = require("fs");
const play = require("play-dl");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// ✅ Load cookies (Netscape format ya plain cookie string)
const cookie = fs.readFileSync("./cookie.txt", "utf8");
play.setToken({
  youtube: {
    cookie: cookie
  }
});

// Download endpoint
app.get("/download", async (req, res) => {
  try {
    const url = req.query.url;
    const type = req.query.type || "video"; // video | audio

    if (!url) {
      return res.status(400).json({ error: "Missing ?url parameter" });
    }

    // ---- Get video info ----
    const info = await play.video_info(url);
    const title = info.video_details.title.replace(/[^\w\s]/gi, "_");

    // ---- Stream ----
    const streamData = await play.stream(url, {
      quality: type === "audio" ? 128 : 720
    });

    const fileName = type === "audio" ? `${title}.mp3` : `${title}.mp4`;
    const filePath = path.join(__dirname, fileName);

    // ---- Save locally ----
    const writeStream = fs.createWriteStream(filePath);
    streamData.stream.pipe(writeStream);

    writeStream.on("finish", () => {
      console.log(`✅ File ready: ${fileName}`);
      res.download(filePath, fileName, (err) => {
        if (!err) fs.unlinkSync(filePath); // delete after sending
      });
    });

  } catch (err) {
    console.error("❌ Error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Root test
app.get("/", (req, res) => {
  res.send("✅ YouTube Downloader API is running!");
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
