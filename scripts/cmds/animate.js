const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const stream = require('stream');
const { promisify } = require('util');
const pipeline = promisify(stream.pipeline);

const API_ENDPOINT = "https://metakexbyneokex.fly.dev/animate";
const CACHE_DIR = __dirname + "/cache";

module.exports.config = {
    role: 0,
    countDown: 5,
    category: "AI Tools",
    shortDescription: "Generate animated video using AI prompt",
    longDescription: "Generate animated video using AI prompt",
    guide: "{pn} animate <prompt>",
    author: "0xMr_King x ┃ Tanin Islam",
  
    name: "animate",
    version: "1.0",
    hasPermssion: 0,
    credits: "0xMr_King x ┃ Tanin Islam",
    description: "Generate animated video using AI prompt",
    commandCategory: "AI Tools",
    usages: "animate <prompt>",
    cooldowns: 5,
};

module.exports.onStart = async ({ api, event, args }) => {
    try {
        const prompt = args.join(" ").trim();
        if (!prompt) return api.sendMessage("⚠️ Prompt likh: animate a cat riding bike", event.threadID, event.messageID);

        if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR);

        api.setMessageReaction("⏳", event.messageID, () => {}, true);
        const fullApiUrl = `${API_ENDPOINT}?prompt=${encodeURIComponent(prompt)}`;
        
        const apiResponse = await axios.get(fullApiUrl, { timeout: 120000 });
        const data = apiResponse.data;

        if (!data.success || !data.video_urls || data.video_urls.length === 0) {
            api.setMessageReaction("❌", event.messageID, () => {}, true);
            return api.sendMessage("⚠️ API kono video return kore nai!", event.threadID);
        }

        const videoUrl = data.video_urls[0];

        const videoDownloadResponse = await axios.get(videoUrl, {
            responseType: 'stream',
            timeout: 120000,
        });

        const filePath = path.join(CACHE_DIR, `animate_${Date.now()}.mp4`);
        await pipeline(videoDownloadResponse.data, fs.createWriteStream(filePath));

        api.setMessageReaction("✅", event.messageID, () => {}, true);

        return api.sendMessage({
            body: `🎬 AI Video Generated!\n📝 Prompt: ${prompt}`,
            attachment: fs.createReadStream(filePath)
        }, event.threadID, () => {
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        });

    } catch (err) {
        api.sendMessage("❌ Failed to generate video!\nServer busy or error.", event.threadID);
        console.log(err);
    }
};
