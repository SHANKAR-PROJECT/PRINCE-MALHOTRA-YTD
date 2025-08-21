import { Router } from 'itty-router'
import ytdl from '@distube/ytdl-core'
import ytSearch from 'yt-search'

const router = Router()

// YouTube Search
router.get('/search', async (req) => {
  const url = new URL(req.url)
  const query = url.searchParams.get('q')
  if (!query) return new Response(JSON.stringify({ error: "Query required" }), { status: 400 })

  const result = await ytSearch(query)
  const videos = result.videos.map(v => ({
    title: v.title,
    channel: v.author.name,
    views: v.views,
    duration: v.timestamp,
    url: v.url,
    thumbnail: v.thumbnail
  }))
  return Response.json({ query, results: videos })
})

// Video Download Link
router.get('/video', async (req) => {
  const url = new URL(req.url)
  const videoUrl = url.searchParams.get('url')
  if (!ytdl.validateURL(videoUrl)) return new Response("Invalid URL", { status: 400 })

  const info = await ytdl.getInfo(videoUrl)
  const format = ytdl.chooseFormat(info.formats, { quality: "18" }) // mp4 360p
  return Response.json({ title: info.videoDetails.title, download: format.url })
})

// Audio Download Link
router.get('/audio', async (req) => {
  const url = new URL(req.url)
  const videoUrl = url.searchParams.get('url')
  if (!ytdl.validateURL(videoUrl)) return new Response("Invalid URL", { status: 400 })

  const info = await ytdl.getInfo(videoUrl)
  const format = ytdl.chooseFormat(info.formats, { filter: "audioonly" })
  return Response.json({ title: info.videoDetails.title, download: format.url })
})

router.all('*', () => new Response("Not Found", { status: 404 }))

export default { fetch: router.handle }
