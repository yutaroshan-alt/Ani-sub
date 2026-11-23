const AUTHOR = "0xMr_King x ┃ Tanin Islam";

const lastWarning = new Map();

function escapeRegex(text) {
	return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchWord(body, word) {
	try {
		return new RegExp(`(^|\\W)${escapeRegex(word)}(?=\\W|$)`, "i").test(body);
	}
	catch (e) {
		return false;
	}
}

function parseWords(raw) {
	return String(raw || "").split(/[,|]/).map(w => w.trim().toLowerCase()).filter(Boolean);
}

function targetFrom(event, args) {
	if (Object.keys(event.mentions || {}).length) return Object.keys(event.mentions)[0];
	if (event.messageReply && event.messageReply.senderID) return event.messageReply.senderID;
	return args[1];
}

async function ensure(threadsData, threadID) {
	const data = await threadsData.get(threadID, "data.badWords", null);
	const clean = data && typeof data === "object" ? data : {};
	clean.words = Array.isArray(clean.words) ? clean.words : [];
	clean.violations = clean.violations && typeof clean.violations === "object" ? clean.violations : {};
	clean.enable = clean.enable === true;
	return clean;
}

function warnThrottled(api, threadID, text) {
	const key = `${threadID}`;
	const now = Date.now();
	if (now - (lastWarning.get(key) || 0) < 8000) return;
	lastWarning.set(key, now);
	try { api.sendMessage(text, threadID); } catch (e) { /* ignore */ }
}

module.exports = {
	config: {
		name: "badwords",
		aliases: ["badword"],
		version: "2.0.0",
		author: AUTHOR,
		countDown: 5,
		role: 1,
		category: "group",
		shortDescription: "Manage per-group banned words with warn and kick escalation",
		guide: {
			en: "{pn} on|off|status\n" +
				"{pn} add word1,word2\n" +
				"{pn} delete word1,word2\n" +
				"{pn} list [hide]\n" +
				"{pn} unwarn [@user|uid]"
		}
	},

	onStart: async function ({ message, event, args, threadsData, api, prefix, role }) {
		const threadID = event.threadID;
		const data = await ensure(threadsData, threadID);
		const mode = String(args[0] || "").toLowerCase();
		const save = () => threadsData.set(threadID, data, "data.badWords");

		if (!mode || mode === "help" || mode === "status")
			return message.reply(
				`Banned-word filter: ${data.enable ? "ON" : "OFF"}\n` +
				`Words: ${data.words.length}\n` +
				`Usage: ${prefix}badwords on|off|add|delete|list|unwarn`
			);

		if (["on", "off"].includes(mode)) {
			if (Number(role || 0) < 1) return message.reply("Only group admins can change this setting.");
			data.enable = mode === "on";
			await save();
			return message.reply(`Banned-word filter is now ${mode === "on" ? "ON" : "OFF"}.`);
		}

		if (Number(role || 0) < 1)
			return message.reply("Only group admins can manage banned words.");

		if (["add", "delete", "del", "-d"].includes(mode)) {
			const words = parseWords(args.slice(1).join(" "));
			if (!words.length) return message.reply("Please provide at least one word.");
			const adding = mode === "add";
			const changed = [];
			for (const word of words) {
				if (word.length < 2) continue;
				const index = data.words.indexOf(word);
				if (adding && index === -1) {
					data.words.push(word);
					changed.push(word);
				}
				else if (!adding && index > -1) {
					data.words.splice(index, 1);
					changed.push(word);
				}
			}
			await save();
			return message.reply(changed.length
				? `${adding ? "Added" : "Removed"}: ${changed.join(", ")}`
				: "No words were changed.");
		}

		if (mode === "list") {
			if (!data.words.length) return message.reply("The banned-word list is empty.");
			const hide = String(args[1] || "").toLowerCase() === "hide";
			const shown = data.words.map(w => hide ? `${w[0]}***` : w);
			return message.reply(`Banned words:\n${shown.join(", ")}`);
		}

		if (mode === "unwarn") {
			const uid = targetFrom(event, args);
			if (!uid || isNaN(uid)) return message.reply("Please tag a user, reply, or give a valid UID.");
			if (!(uid in data.violations)) return message.reply(`${uid} has no banned-word violation.`);
			delete data.violations[uid];
			await save();
			return message.reply(`Cleared banned-word violations for ${uid}.`);
		}

		return message.reply(`Unknown option "${mode}". Use ${prefix}badwords for the command list.`);
	},

	onChat: async function ({ api, event, threadsData, role }) {
		if (!event.body || typeof event.body !== "string") return;
		if (Number(role || 0) >= 1) return;
		if (event.senderID === api.getCurrentUserID()) return;

		let prefix = "(";
		try {
			if (global.utils && typeof global.utils.getPrefix === "function")
				prefix = global.utils.getPrefix(event.threadID) || prefix;
		}
		catch (e) { /* keep default */ }
		if (event.body.startsWith(prefix)) return;

		const data = await ensure(threadsData, event.threadID);
		if (!data.enable || !data.words.length) return;

		const hit = data.words.find(word => matchWord(event.body, word));
		if (!hit) return;

		const uid = String(event.senderID);
		const count = Number(data.violations[uid] || 0) + 1;
		data.violations[uid] = count;
		await threadsData.set(event.threadID, data, "data.badWords");

		if (count < 2) {
			warnThrottled(api, event.threadID,
				`⚠️ Banned word detected: "${hit}". A second violation will remove you from the group.\nMade by ${AUTHOR}`);
			return;
		}

		try {
			await api.removeUserFromGroup(event.senderID, event.threadID);
			api.sendMessage(`🚫 ${uid} was removed after a second banned-word violation.\nMade by ${AUTHOR}`, event.threadID);
		}
		catch (err) {
			api.sendMessage("Bot needs admin permission to remove repeat offenders.", event.threadID);
		}
	}
};
