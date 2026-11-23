const fs = require("fs-extra");
const path = require("path");

const ownerInfo = {
  name: "new-bot",
  contact: "https://m.me/0xmrking",
  supportGroup: "https://m.me/j/AbY50_CsjwrZMPkP/?send_source=gc%3Acopy_invite_link_t"
};

module.exports = {
  config: {
    name: "pending",
    aliases: ["pen", "approve-base", "পেন্ডিং"],
    version: "4.0.0",
    author: "0xMr_King x ┃ Tanin Islam",
    countDown: 5,
    role: 2,
    shortDescription: {
      en: "Approve or refuse pending threads"
    },
    longDescription: {
      en: "Reply with thread numbers to approve or reply with c[number(s)] / cancel[number(s)] to refuse."
    },
    category: "admin"
  },

  langs: {
    en: {
      invaildNumber: "%1 is not a valid number",
      cancelSuccess: "Refused %1 thread(s)!",
      approveSuccess: "Approved successfully %1 thread(s)!",
      cantGetPendingList: "Can't get the pending list!",
      returnListPending:
        "𓍢ִ໋🌸✧ ── ͟͟͞͞Aliya v4 Pending List ── ✧🌸𓍢ִ໋🌷͙֒\n\nᥫ᭡ Total Pending Threads: %1\n\n%2\n\n💡 Guide:\n- Approve: Reply with numbers (e.g., 1 2 3)\n- Refuse: Reply with c[number] or cancel[number] (e.g., c 1 2 or cancel 3)",
      returnListClean: "𓍢ִ໋🌸✧ Pending list is completely clean! ✧🌸"
    }
  },

  onReply: async function ({ api, event, Reply, getLang, message, threadsData }) {
    if (String(event.senderID) !== String(Reply.author)) return;
    const { body } = event;
    let count = 0;
    const BOT_UID = api.getCurrentUserID();

    const lowerBody = body.trim().toLowerCase();

    if (lowerBody.startsWith("c") || lowerBody.startsWith("cancel")) {
      const trimmed = body.replace(/^(c|cancel)\s*/i, "").trim();
      const index = trimmed.split(/\s+/).filter(Boolean);

      if (index.length === 0)
        return message.reply("Please provide at least one thread number to cancel.");

      for (const i of index) {
        if (isNaN(i) || i <= 0 || i > Reply.pending.length) {
          message.reply(getLang("invaildNumber", i));
          continue;
        }

        const targetThreadID = Reply.pending[parseInt(i) - 1].threadID;
        try {
          if (typeof api.handleMessageRequest === "function") {
            await api.handleMessageRequest(targetThreadID, false).catch(() => {});
          }
        } catch (_) {}
        try {
          await api.removeUserFromGroup(BOT_UID, targetThreadID);
          count++;
        } catch (error) {
          console.error(`⚠️ Failed to remove bot from thread ${targetThreadID}:`, error.message);
        }
      }

      return message.reply(getLang("cancelSuccess", count));
    } else {
      const index = body.split(/\s+/).filter(Boolean);
      if (index.length === 0)
        return message.reply("Please provide at least one thread number to approve.");

      let configChanged = false;

      for (const i of index) {
        if (isNaN(i) || i <= 0 || i > Reply.pending.length) {
          message.reply(getLang("invaildNumber", i));
          continue;
        }

        const targetThread = Reply.pending[parseInt(i) - 1].threadID;
        const prefix = global.utils.getPrefix(targetThread);
        const nickNameBot = global.GoatBot.config.nickNameBot || "Aliya Bot v4";

        try {
          if (typeof api.handleMessageRequest === "function") {
            await api.handleMessageRequest(targetThread, true).catch(() => {});
          }
        } catch (_) {}

        try {
          if (threadsData && typeof threadsData.create === "function") {
            await threadsData.create(targetThread).catch(() => {});
          }
          if (threadsData && typeof threadsData.refreshInfo === "function") {
            await threadsData.refreshInfo(targetThread).catch(() => {});
          }
        } catch (_) {}

        try {
          const cfg = global.GoatBot.config || {};
          if (cfg.threadApproval && Array.isArray(cfg.threadApproval.approvedThreadIDs)) {
            const ids = cfg.threadApproval.approvedThreadIDs.map(String);
            if (!ids.includes(String(targetThread))) {
              cfg.threadApproval.approvedThreadIDs.push(String(targetThread));
              configChanged = true;
            }
          }
          if (cfg.whiteListModeThread && Array.isArray(cfg.whiteListModeThread.whiteListThreadIds)) {
            const ids = cfg.whiteListModeThread.whiteListThreadIds.map(String);
            if (!ids.includes(String(targetThread))) {
              cfg.whiteListModeThread.whiteListThreadIds.push(String(targetThread));
              configChanged = true;
            }
          }
        } catch (_) {}

        try {
          await api.changeNickname(nickNameBot, targetThread, BOT_UID);
        } catch (err) {
          console.warn(`⚠️ Nickname change failed for ${targetThread}:`, err.message);
        }

        try {
          const imagePath = path.join(__dirname, "../../func/botconnect.jpeg");

          const textMsg = 
`𓍢ִ໋🌸✧ ── ͟͟͞͞Group Connected Successfully ── ✧🌸𓍢ִ໋🌷͙֒  

ᥫ᭡ 𝐁𝐨𝐭 𝐏𝐫𝐞𝐟𝐢𝐱 : ${prefix}
ᥫ᭡ 𝐔𝐬𝐚𝐠𝐞 : Type ${prefix}help to see all commands

✧─────── ͟͟͞͞Aliya Bot System ───────✧
👑 𝐎𝐰𝐧𝐞𝐫 : ${ownerInfo.name}
💬 𝐂𝐨𝐧𝐭𝐚𝐜𝐭 : ${ownerInfo.contact}
🤖 𝐒𝐮𝐩𝐩𝐨𝐫𝐭 𝐆𝐂 : ${ownerInfo.supportGroup}`;

          await api.sendMessage(
            {
              body: textMsg,
              attachment: fs.createReadStream(imagePath)
            },
            targetThread
          );

        } catch (err) {
          console.error(`⚠️ Error sending botconnect message to ${targetThread}:`, err);

          const fallbackMsg = 
`𓍢ִ໋🌸✧ ── ͟͟͞͞Group Connected Successfully ── ✧🌸𓍢ִ໋🌷͙֒  

ᥫ᭡ 𝐁𝐨𝐭 𝐏𝐫𝐞𝐟𝐢𝐱 : ${prefix}
ᥫ᭡ 𝐔𝐬𝐚𝐠𝐞 : Type ${prefix}help to see all commands

✧─────── ͟͟͞͞Aliya Bot System ───────✧
👑 𝐎𝐰𝐧𝐞𝐫 : ${ownerInfo.name}
💬 𝐂𝐨𝐧𝐭𝐚𝐜𝐭 : ${ownerInfo.contact}
🤖 𝐒𝐮𝐩𝐩𝐨𝐫𝐭 𝐆𝐂 : ${ownerInfo.supportGroup}`;

          api.sendMessage(fallbackMsg, targetThread);
        }

        count++;
      }

      if (configChanged && global.client && global.client.dirConfig) {
        try {
          fs.writeFileSync(global.client.dirConfig, JSON.stringify(global.GoatBot.config, null, 2));
        } catch (_) {}
      }

      return message.reply(getLang("approveSuccess", count));
    }
  },

  onStart: async function ({ api, event, getLang, commandName, message }) {
    const { threadID, messageID } = event;
    let msg = "", index = 1;

    try {
      const fetchThreads = async (tag) => {
        const out = [];
        let before = null;
        for (let page = 0; page < 10; page++) {
          const batch = await api.getThreadList(100, before, [tag]) || [];
          out.push(...batch);
          if (batch.length < 100) break;
          const next = batch[batch.length - 1].timestamp;
          if (!next || next === before) break;
          before = next;
        }
        return out;
      };
      const pending = await fetchThreads("PENDING");
      const spam = await fetchThreads("OTHER");
      const seen = new Set();
      const list = [...pending, ...spam].filter(g => {
        if (!g || !g.isGroup) return false;
        const id = String(g.threadID);
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      });

      for (const item of list) msg += `${index++}. ${item.name} (${item.threadID})\n`;

      if (list.length !== 0) {
        return api.sendMessage(
          getLang("returnListPending", list.length, msg),
          threadID,
          (err, info) => {
            global.GoatBot.onReply.set(info.messageID, {
              commandName,
              messageID: info.messageID,
              author: event.senderID,
              pending: list
            });
          },
          messageID
        );
      } else {
        return message.reply(getLang("returnListClean"));
      }
    } catch (e) {
      return message.reply(getLang("cantGetPendingList"));
    }
  }
};
          
