const OWNER_CREDIT = "0xMr_King x ┃ Tanin Islam";

function creditOk() {
  return module.exports.config.credits === OWNER_CREDIT;
}

module.exports.config = {
    role: 0,
    countDown: 5,
    category: "Group",
    shortDescription: "Show group admins and bot admins",
    longDescription: "Show group admins and bot admins",
    guide: "{pn} adminlist | list admin | admin list",
  
  name: "adminlist",
  version: "1.0.0",
  hasPermssion: 0,
  credits: "0xMr_King x ┃ Tanin Islam",
  description: "Show group admins and bot admins",
  commandCategory: "Group",
  usages: "adminlist | list admin | admin list",
  cooldowns: 5
};

module.exports.onLoad = function () {
  if (!creditOk()) console.log("❌ [adminlist] Credit was changed, command disabled.");
};

// ---------- font: 𝙰𝙱𝙲𝙳 (monospace) ----------
function M(text) {
  return String(text).replace(/[A-Za-z0-9]/g, (c) => {
    const code = c.charCodeAt(0);
    if (code >= 65 && code <= 90) return String.fromCodePoint(0x1d670 + code - 65);
    if (code >= 97 && code <= 122) return String.fromCodePoint(0x1d68a + code - 97);
    return String.fromCodePoint(0x1d7f6 + code - 48);
  });
}

function getThread(api, threadID) {
  return new Promise((resolve) => {
    api.getThreadInfo(threadID, (err, data) => resolve(err ? null : data));
  });
}

function getUsers(api, ids) {
  return new Promise((resolve) => {
    if (!ids.length) return resolve({});
    api.getUserInfo(ids, (err, data) => resolve(err ? {} : data || {}));
  });
}

function formatList(ids, users, max) {
  if (!ids.length) return "┃ N/A";
  const lines = ids.slice(0, max).map((id, i) => {
    const name = (users[id] && users[id].name) || "Unknown";
    return `┃ ${i + 1}. ${name}\n┃ 🔗 https://facebook.com/${id}`;
  });
  if (ids.length > max) lines.push(`┃ +${ids.length - max} more`);
  return lines.join("\n");
}

async function sendList(api, event) {
  const { threadID, messageID } = event;

  // 🔒 Credit lock
  if (!creditOk()) {
    return api.sendMessage("⛔ Credit was changed! Command disabled.", threadID, messageID);
  }

  try {
    const t = await getThread(api, threadID);

    // Group admins
    const groupIDs = t && t.adminIDs
      ? t.adminIDs.map((a) => String(a.id || a))
      : [];

    // Bot admins (from config)
    const cfg = global.config || {};
    const botIDs = (cfg.adminBot || []).map(String);

    const allIDs = [...new Set([...groupIDs.slice(0, 15), ...botIDs.slice(0, 15)])];
    const users = await getUsers(api, allIDs);

    const body =
`╭━━━━━━━━━━━━━━╮
   🛡️ ${M("ADMIN LIST")}
╰━━━━━━━━━━━━━━╯
┏━ 👥 ${M("GROUP ADMINS")} (${M(groupIDs.length)})
${formatList(groupIDs, users, 15)}
┣━ 🤖 ${M("BOT ADMINS")} (${M(botIDs.length)})
${formatList(botIDs, users, 15)}
┗━━━━━━━━━━━━━━
👑 ${OWNER_CREDIT}`;

    return api.sendMessage(body, threadID, messageID);
  } catch (e) {
    console.log("adminlist error:", e);
    return api.sendMessage("❌ Something went wrong.", threadID, messageID);
  }
}

// Also works without the command name: "list admin", "admin list", "adminlist"
module.exports.handleEvent = function ({ api, event }) {
  try {
    if (!event || !event.body) return;
    if (event.type !== "message" && event.type !== "message_reply") return;

    const cfg = global.config || {};
    const threadData = global.data && global.data.threadData && global.data.threadData.get(String(event.threadID));
    const p = (threadData && threadData.PREFIX) || cfg.PREFIX || "";

    let text = event.body.trim().toLowerCase().replace(/\s+/g, " ");

    let hadPrefix = false;
    if (p && text.startsWith(p.toLowerCase())) {
      text = text.slice(p.length).trim();
      hadPrefix = true;
    }

    // "/adminlist" is handled by run(), skip it here to avoid a double reply
    if (hadPrefix && text === "adminlist") return;

    if (["adminlist", "list admin", "admin list", "listadmin"].includes(text)) {
      return sendList(api, event);
    }
  } catch (e) {
    console.log("adminlist error:", e);
  }
};

module.exports.onStart = function ({ api, event }) {
  return sendList(api, event);
};
