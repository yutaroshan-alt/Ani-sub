 
const axios = require("axios");

const FOLDER_ID = "1tAVD0EmmUBKGpQIgV7gfdJ0UlrnxMdLJ";
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes cache

let cachedFiles = null;
let lastFetchTime = 0;

const apiClient = axios.create({
    timeout: 8000,
    headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    }
});

const STATIC_CAPTION = 
`🎀 ••••••Owner Info•••••🐇

🦢 𝖭𝖺𝗆𝖾 : 0xMr_King x ┃ Tanin Islam
🐦‍🔥 𝖱𝗈𝗅𝖾 : 𝖠𝖽𝗆𝗂𝗇 / 𝖮𝗐𝗇𝖾𝗋
🐇 𝖡𝗂𝗈 : 𝖲𝗂𝗇𝗀𝗅𝖾 ⚡
🪐 Messenger Id : https://m.me/0xmrking
🎮 ━━ Mlbb Info ━━🎮

🆔 𝖨𝖦𝖭 : 0xMr_King
🔢 𝖨𝖖 : 2251640751 (19633)
⚔️ 𝖬𝖺𝗍𝖼𝗁𝖾𝗌 : Played for fun 
👍 𝖫𝗂𝗄𝖾𝗌 : Day by day Up and Uping
🏅 𝖧𝖾𝗋𝗈𝖾𝗌 : no need for others; 0xMr_King x ┃ Tanin Islam is a legend 🗿
🛡️ MesengerGc :https://m.me/j/NmI8lyXRwjQpyHbg/?send_source=gc%3Acopy_invite_link_t 

🪽••••••••••••••🪽`;

module.exports.config = {
    name: "owner",
    aliases: ["admin", "info"],
    version: "2.0.0",
    author: "0xMr_King x ┃ Tanin Islam",
    role: 0,
    category: "info",
    guide: { en: "Use {p}owner to view owner info and MLBB account details." }
};

async function fetchFolderFiles(forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && cachedFiles && cachedFiles.length > 0 && (now - lastFetchTime < CACHE_TTL)) {
        return cachedFiles;
    }

    const response = await apiClient.get(`https://drive.google.com/embeddedfolderview?id=${FOLDER_ID}`).catch(async () => {
        return await apiClient.get(`https://docs.google.com/uc?export=list&id=${FOLDER_ID}`);
    });

    const htmlData = response.data;
    const files = [];
    const seen = new Set();

    const regexPrimary = /"([^"]+)"\s*,\s*\[\s*"([^"]+)"\s*,\s*([0-9]+)\s*,\s*"([^"]+)"/g;
    let match;
    while ((match = regexPrimary.exec(htmlData)) !== null) {
        if (!seen.has(match[1])) {
            seen.add(match[1]);
            files.push(match[1]);
        }
    }

    if (files.length === 0) {
        const regexFallback = /\/file\/d\/([a-zA-Z0-9_-]+)\/view/g;
        while ((match = regexFallback.exec(htmlData)) !== null) {
            if (!seen.has(match[1])) {
                seen.add(match[1]);
                files.push(match[1]);
            }
        }
    }

    if (files.length > 0) {
        cachedFiles = files;
        lastFetchTime = now;
    }

    return files;
}

module.exports.onStart = async ({ api, event }) => {
    const { threadID, messageID } = event;

    try {
        // Fire reaction immediately for high responsiveness
        api.setMessageReaction("⚡", messageID, () => {}, true);

        const files = await fetchFolderFiles(false);

        if (!files || files.length === 0) {
            return api.sendMessage(STATIC_CAPTION, threadID, messageID);
        }

        const randomFileId = files[Math.floor(Math.random() * files.length)];
        const downloadUrl = `https://docs.google.com/uc?export=download&id=${randomFileId}`;

        const stream = await global.utils.getStreamFromURL(downloadUrl);

        return api.sendMessage({
            body: STATIC_CAPTION,
            attachment: [stream]
        }, threadID, messageID);

    } catch (err) {
        console.error(err);
        return api.sendMessage(STATIC_CAPTION, threadID, messageID);
    }
};
