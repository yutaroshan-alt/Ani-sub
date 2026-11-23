const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");
const execFileAsync = promisify(execFile);
const { resolveFfmpeg } = require("../../pinVideo.js");

module.exports = {
  config: {
    name: "songfinder",
    aliases: ["shazam", "findsong"],
    version: "2.0.0",
    author: "0xMr_King x ┃ Tanin Islam",
    countDown: 15,
    role: 0,
    shortDescription: "Recognize a song from an audio/video URL or reply",
    longDescription: "Recognizes song metadata (title, artist, album, cover) from a direct media URL or replied audio/video attachment. Uses remote API with offline Shazam fallback.",
    category: "media",
    guide: "{pn} [url] or reply to an audio/video message"
  },

  onStart: async function ({ api, message, event, args }) {
    let mediaUrl = args.join(" ").trim();

    if (!mediaUrl && event.messageReply && event.messageReply.attachments && event.messageReply.attachments.length > 0) {
      const att = event.messageReply.attachments.find(a => a.type === "audio" || a.type === "video" || a.type === "file");
      if (att && att.url) mediaUrl = att.url;
    }

    if (!mediaUrl) {
      return message.reply("Bounding box: audio/video link ba reply diye song pathan.");
    }

    try { api.setMessageReaction("🏯", event.messageID, () => {}, true); } catch (_e) {}

    const baseUrl = String(process.env.API_BASE_URL || "https://0x-mr-king-api-server-i73g.vercel.app").replace(/\/+$/, "");
    let track = null;

    // 1) Remote API
    try {
      const res = await axios.get(`${baseUrl}/api/songfinder`, {
        params: { url: mediaUrl, media_url: mediaUrl },
        timeout: 45000
      });
      const payload = res.data && res.data.data ? res.data.data : res.data;
      const candidate = payload && payload.result ? payload.result : payload;
      if (res.data && res.data.success !== false && candidate && (candidate.title || candidate.song || candidate.name)) {
        track = {
          title: candidate.title || candidate.song || candidate.name,
          artist: candidate.artist || candidate.artists || "Unknown Artist",
          album: candidate.album || "Unknown Album",
          release: candidate.release_date || candidate.released || "N/A",
          coverUrl: candidate.cover || candidate.thumbnail || candidate.image || candidate.artwork || null
        };
      }
    } catch (_e) {}

    // 2) Offline Shazam fallback
    if (!track) track = await recognizeOffline(mediaUrl);

    if (!track) {
      try { api.setMessageReaction("❌", event.messageID, () => {}, true); } catch (_e) {}
      return message.reply("🎧 Song chinhite parini. Clear audio link ba reply diye abar try korun.");
    }

    const infoCard =
      `╭─────────────────────────────────⬣\n` +
      `│ 𝐒𝐨𝐧𝐠 : ${track.title}\n` +
      `│ 𝐀𝐫𝐭𝐢𝐬𝐭 : ${track.artist}\n` +
      `│ 𝐀𝐥𝐛𝐮𝐦 : ${track.album}\n` +
      `│ 𝐑𝐞𝐥𝐞𝐚𝐬𝐞 : ${track.release}\n` +
      `│ Made by 0xMr_King x ┃ Tanin Islam\n` +
      `╰─────────────────────────────────⬣`;

    try { api.setMessageReaction("🐇", event.messageID, () => {}, true); } catch (_e) {}

    if (track.coverUrl) {
      try {
        const imgBuffer = (await axios.get(track.coverUrl, { responseType: "arraybuffer", timeout: 20000 })).data;
        const imgPath = path.join(__dirname, "cache", `songcover_${Date.now()}.jpg`);
        await fs.ensureDir(path.dirname(imgPath));
        fs.writeFileSync(imgPath, Buffer.from(imgBuffer));
        return message.reply(
          { body: infoCard, attachment: fs.createReadStream(imgPath) },
          () => { try { if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath); } catch (_e) {} }
        );
      } catch (_e) {}
    }

    return message.reply(infoCard);
  }
};

async function recognizeOffline(mediaUrl) {
  const work = path.join(__dirname, "cache");
  await fs.ensureDir(work);
  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const rawPath = path.join(work, `sf_${stamp}.bin`);
  const wavPath = path.join(work, `sf_${stamp}.wav`);
  const cleanup = async () => {
    await fs.remove(rawPath).catch(() => {});
    await fs.remove(wavPath).catch(() => {});
    try { if (fs.existsSync(path.join(process.cwd(), "node_shazam_temp.pcm"))) fs.unlinkSync(path.join(process.cwd(), "node_shazam_temp.pcm")); } catch (_e) {}
  };

  try {
    const res = await axios.get(mediaUrl, {
      responseType: "arraybuffer",
      timeout: 60000,
      maxContentLength: 40 * 1024 * 1024,
      headers: { "User-Agent": "Mozilla/5.0" }
    });
    fs.writeFileSync(rawPath, Buffer.from(res.data));

    const ffmpeg = resolveFfmpeg();
    await execFileAsync(ffmpeg, [
      "-y", "-hide_banner", "-loglevel", "error",
      "-i", rawPath, "-t", "25", "-ac", "1", "-ar", "16000",
      "-acodec", "pcm_s16le", wavPath
    ], { timeout: 120000, maxBuffer: 4 * 1024 * 1024 });

    // Render/linux: node-shazam uses its bundled @ffmpeg-installer binary directly.
    // Android/Termux has no such binary, so stub it with the resolved system ffmpeg.
    if (process.platform === "android") {
      try {
        const id = require.resolve("@ffmpeg-installer/ffmpeg");
        require.cache[id] = {
          id, filename: id, loaded: true, children: [], paths: [],
          exports: { path: ffmpeg }
        };
      } catch (_e) {}
    }

    const { Shazam } = require("node-shazam");
    const result = await new Shazam().recognise(wavPath, "en-US", false);
    await cleanup();

    const t = result && result.track;
    if (!t || !t.title) return null;

    const images = t.images || {};
    const sections = t.sections || [];
    const metaOf = key => {
      for (const sec of sections) {
        const found = (sec.metadata || []).find(m => m.title === key);
        if (found) return found.text;
      }
      return "N/A";
    };

    return {
      title: t.title,
      artist: t.subtitle || "Unknown Artist",
      album: metaOf("Album"),
      release: metaOf("Released") || t.year || "N/A",
      coverUrl: images.coverarthq || images.coverart || (images.hub && images.hub.avatar) || null
    };
  } catch (error) {
    await cleanup();
    if (process.env.DEBUG_API) console.error("Offline Shazam failed:", error.message);
    return null;
  }
}
