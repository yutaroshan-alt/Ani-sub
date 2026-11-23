/**
 * supportgc - add the caller to the official support group.
 *
 * Works with both callback style and Promise style Messenger APIs:
 *   api.getThreadInfo(threadID, callback)
 *   api.addUserToGroup(userID, threadID, callback)
 *
 * If the bot cannot add the user (privacy setting, bot is not an admin, bot is
 * not in the group, etc.) the invite link is sent instead, so the user can
 * always join. All replies are in English.
 */
"use strict";

const DEFAULT_THREAD_ID = "1790059385622188";
const DEFAULT_INVITE_LINK = "https://m.me/j/NmI8lyXRwjQpyHbg/?send_source=gc%3Acopy_invite_link_t";

// Calls an API method that may use a callback, a Promise, or both.
function callApi(fn, args, timeoutMs = 12000) {
  return new Promise(resolve => {
    let done = false;
    let timer = null;
    const finish = (err, data) => {
      if (done) return;
      done = true;
      if (timer) clearTimeout(timer);
      resolve({ err: err || null, data: data === undefined ? null : data });
    };

    let returned;
    try {
      returned = fn(...args, (err, data) => finish(err, data));
    }
    catch (e) {
      return finish(e, null);
    }

    if (returned && typeof returned.then === "function")
      returned.then(data => finish(null, data)).catch(e => finish(e, null));

    timer = setTimeout(() => finish(null, null), timeoutMs);
  });
}

function supportSettings() {
  const cfg = (global.GoatBot && global.GoatBot.config) || {};
  const s = cfg.supportGroup || cfg.supportGc || cfg.supportGroupChat || {};
  return {
    threadID: String(s.threadID || s.threadId || s.groupID || s.id || DEFAULT_THREAD_ID),
    inviteLink: String(s.inviteLink || s.link || s.invite || DEFAULT_INVITE_LINK)
  };
}

function header() {
  return "Aliya V4 Support Group\n";
}

module.exports = {
  config: {
    name: "supportgc",
    aliases: ["support", "sgc", "supportgroup"],
    version: "2.0.0",
    author: "0xMr_King x ┃ Tanin Islam",
    countDown: 5,
    role: 0,
    shortDescription: "Join the official support group",
    longDescription: "Adds you to the official support group. If the bot cannot add you, you receive the invite link instead.",
    category: "system",
    guide: {
      en: "{p}supportgc"
    }
  },

  onStart: async function ({ api, event, message }) {
    const { threadID, messageID, senderID } = event;
    const { threadID: supportThreadID, inviteLink } = supportSettings();
    const userID = String(senderID || "");

    const reply = text => (message && typeof message.reply === "function")
      ? message.reply(text)
      : api.sendMessage(text, threadID, messageID);

    if (!userID || !/^\d+$/.test(userID))
      return reply("Could not detect your user ID. Please try again from a Messenger chat.");

    // 1. Check whether the user is already a member. If the check fails we
    //    still continue to the add attempt, so a missing permission here does
    //    not block the whole command.
    let alreadyMember = false;
    if (api && typeof api.getThreadInfo === "function") {
      const info = await callApi(api.getThreadInfo.bind(api), [supportThreadID], 8000);
      const ids = info.data && (info.data.participantIDs || info.data.participantID);
      if (Array.isArray(ids)) alreadyMember = ids.some(id => String(id) === userID);
    }

    if (alreadyMember)
      return reply(
        header() +
        "You are already a member of the official support group.\n" +
        "Group link: " + inviteLink
      );

    // 2. Try to add the user directly.
    if (api && typeof api.addUserToGroup === "function") {
      const added = await callApi(api.addUserToGroup.bind(api), [userID, supportThreadID], 12000);
      if (!added.err && added.data !== false)
        return reply(
          header() +
          "You have been added to the support group successfully.\n" +
          "Group link: " + inviteLink
        );
    }

    // 3. Direct add failed for any reason: always give the user a way in.
    return reply(
      header() +
      "The bot could not add you directly (your privacy setting, the bot is not an admin there, or the bot is not in that group).\n" +
      "Open this link to join manually:\n" +
      inviteLink
    );
  }
};
