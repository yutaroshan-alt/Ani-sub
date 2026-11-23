const AUTHOR = "0xMr_King x ┃ Tanin Islam";

const cache = new Map();
const MAX_CACHE = 500;
const MAX_TEXT = 2000;

function remember(threadID, event) {
	if (!event.messageID) return;
	if (!cache.has(threadID)) cache.set(threadID, []);
	const list = cache.get(threadID);
	list.push({
		messageID: event.messageID,
		body: typeof event.body === "string" ? event.body.slice(0, MAX_TEXT) : "",
		senderID: event.senderID,
		attachments: (event.attachments || []).map(a => a.url).filter(Boolean).slice(0, 5)
	});
	if (list.length > MAX_CACHE) list.splice(0, list.length - MAX_CACHE);
}

module.exports = {
	config: {
		name: "antiunsend",
		aliases: ["nouns", "resend"],
		version: "2.0.0",
		author: AUTHOR,
		countDown: 5,
		role: 1,
		category: "group",
		shortDescription: "Repost deleted messages with their attachments",
		guide: {
			en: "{pn} on|off|status\nOpt-in per group; messages are cached in memory only."
		}
	},

	onStart: async function ({ message, event, args, threadsData, prefix }) {
		const mode = String(args[0] || "").toLowerCase();
		const threadID = event.threadID;

		if (["on", "off"].includes(mode)) {
			await threadsData.set(threadID, mode === "on", "settings.antiUnsend");
			if (mode === "off") cache.delete(threadID);
			return message.reply(`Deleted-message recovery is now ${mode === "on" ? "ON" : "OFF"}.`);
		}

		const enabled = await threadsData.get(threadID, "settings.antiUnsend", false);
		return message.reply(
			`Deleted-message recovery: ${enabled ? "ON" : "OFF"}\n` +
			`Usage: ${prefix}antiunsend on | off | status\nMade by ${AUTHOR}`
		);
	},

	onChat: async function ({ event }) {
		if (event.type !== "message" && event.type !== "message_reply") return;
		remember(event.threadID, event);
	},

	onAnyEvent: async function ({ api, event, threadsData, usersData }) {
		if (event.type !== "message_unsend") return;
		if (!event.messageID) return;
		if (String(event.senderID) === String(api.getCurrentUserID())) return;

		const enabled = await threadsData.get(event.threadID, "settings.antiUnsend", false);
		if (!enabled) return;

		const list = cache.get(event.threadID) || [];
		const index = list.findIndex(item => item.messageID === event.messageID);
		if (index === -1) return;
		const item = list.splice(index, 1)[0];

		const name = await usersData.getName(item.senderID).catch(() => item.senderID);
		let attachments = [];
		if (item.attachments.length && global.utils && typeof global.utils.getStreamFromURL === "function") {
			for (const url of item.attachments) {
				try {
					attachments.push(await global.utils.getStreamFromURL(url));
				} catch (e) { /* skip unavailable media */ }
			}
		}

		try {
			await api.sendMessage({
				body: `${name} removed a message:\n\n${item.body || "(media)"}\n\nMade by ${AUTHOR}`,
				attachment: attachments.length ? attachments : undefined
			}, event.threadID);
		} catch (e) { /* ignore */ }
	}
};
