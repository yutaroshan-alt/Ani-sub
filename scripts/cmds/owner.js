 
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

🦢 𝖭𝖺𝗆𝖾 : Su baru  x ┃ Tilu Soytan
🐦‍🔥 𝖱𝗈𝗅𝖾 : 𝖠𝖽𝗆𝗂𝗇 / 𝖮𝗐𝗇𝖾𝗋
🐇 𝖡𝗂𝗈 : 𝖲𝗂𝗇𝗀𝗅𝖾 pro Max⚡
🪐 Messenger Id : https://m.me/Naruhina000
🌚 ━━ Mlbb  ━👀
🍴Food    : Momo 🤤🤤
💔 Crush  :Anya 💔
🧒 🥹     :Innocent🥹
🪽••••••••••••••🪽`;

module.exports.config = {
    name: "owner",
    aliases: ["admin", "info"],
    version: "2.0.0",
    author: "Su baru  x ┃ Tilu Soytan 👿",
    role: 0,
    category: "info",
    guide: { en: "Use {p}owner to view owner info and MLBB account details." }
}

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
