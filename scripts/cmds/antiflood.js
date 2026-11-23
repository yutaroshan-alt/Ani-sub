module.exports.config = {
    role: 1,
    countDown: 3,
    category: "admin",
    shortDescription: "গ্রুপে মেসেজ-ফ্লাড (স্প্যাম) প্রোটেকশন চালু/বন্ধ করুন",
    longDescription: "গ্রুপে মেসেজ-ফ্লাড (স্প্যাম) প্রোটেকশন চালু/বন্ধ করুন",
    guide: "{pn} <on|off>",
    author: "0xMr_King x ┃ Tanin Islam",
  
  name: "antiflood",
  aliases: ["antispamgroup"],
  version: "1.0.0",
  hasPermssion: 1,
  credits: "0xMr_King x ┃ Tanin Islam",
  description: "গ্রুপে মেসেজ-ফ্লাড (স্প্যাম) প্রোটেকশন চালু/বন্ধ করুন",
  commandCategory: "admin",
  usages: "<on|off>",
  cooldowns: 3
};

module.exports.onStart = async function ({ api, event, args, Threads }) {
  const { threadID, messageID } = event;
  const mode = String(args[0] || "").toLowerCase();

  if (!["on", "off", "status"].includes(mode)) {
    const cur = (await Threads.getData(threadID)) || {};
    const enabled = (cur.data || {}).antiFlood === true;
    return api.sendMessage(
      `ব্যবহার: ${global.config.PREFIX}antiflood on/off\nবর্তমান অবস্থা: ${enabled ? "চালু ✅" : "বন্ধ ❌"}`,
      threadID, messageID
    );
  }

  const record = (await Threads.getData(threadID)) || {};
  const data = record.data || {};

  if (mode === "status") {
    return api.sendMessage(`Anti-Flood বর্তমানে: ${data.antiFlood === true ? "চালু ✅" : "বন্ধ ❌"}`, threadID, messageID);
  }

  data.antiFlood = mode === "on";
  await Threads.setData(threadID, { data });
  global.data.threadData.set(threadID, data);

  return api.sendMessage(
    `✅ Anti-Flood প্রোটেকশন এখন ${mode === "on" ? "চালু করা হয়েছে" : "বন্ধ করা হয়েছে"}।`,
    threadID, messageID
  );
};
