const AUTHOR = "0xMr_King x ┃ Tanin Islam";
const { findUid } = global.utils;

const lastNotice = new Map();

function notice(api, threadID, text) {
	const key = String(threadID);
	const now = Date.now();
	if (now - (lastNotice.get(key) || 0) < 10000) return;
	lastNotice.set(key, now);
	try { api.sendMessage(text, threadID); } catch (e) { /* ignore */ }
}

function nameOf(members, uid) {
	const member = (members || []).find(m => String(m.userID || m.id || m.userFbId) === String(uid));
	return (member && (member.name || member.fullName)) || null;
}

async function resolveTarget(event, args, startIndex) {
	const mentions = event.mentions || {};
	const keys = Object.keys(mentions);
	if (keys.length) return keys[0];
	if (event.messageReply && event.messageReply.senderID) return event.messageReply.senderID;
	const raw = String(args[startIndex] || "");
	if (!isNaN(raw)) return raw;
	if (/^https?:\/\//i.test(raw)) {
		try { return await findUid(raw); } catch (e) { return null; }
	}
	return null;
}

module.exports = {
	config: {
		name: "ban",
		aliases: ["gban"],
		version: "2.0.0",
		author: AUTHOR,
		countDown: 5,
		role: 1,
		category: "group",
		shortDescription: "Ban and auto-kick members from this group",
		guide: {
			en: "{pn} [@tag|uid|link|reply] [reason]\n{pn} unban [@tag|uid|reply]\n{pn} list\n{pn} check"
		}
	},

	onStart: async function ({ message, event, args, threadsData, usersData, api, role, prefix }) {
		if (Number(role || 0) < 1) return message.reply("Only group admins can manage the ban list.");

		const threadID = event.threadID;
		const thread = await threadsData.get(threadID);
		const members = (thread && thread.members) || [];
		const adminIDs = ((thread && thread.adminIDs) || []).map(String);
		const list = await threadsData.get(threadID, "data.bannedMembers", []);
		if (!Array.isArray(list)) list.length = 0;
		const save = () => threadsData.set(threadID, list, "data.bannedMembers");

		const mode = String(args[0] || "").toLowerCase();
		const start = ["unban", "list", "check"].includes(mode) ? 1 : 0;

		if (mode === "list") {
			if (!list.length) return message.reply("No members are banned from this group.");
			const rows = await Promise.all(list.map(async (item, i) => {
				const name = nameOf(members, item.id) || await usersData.getName(item.id).catch(() => item.id);
				return `${i + 1}. ${name} (${item.id})\n   Reason: ${item.reason || "No reason"}\n   Date: ${item.time || "unknown"}`;
			}));
			return message.reply(`Banned members:\n${rows.join("\n")}`);
		}

		if (mode === "check") {
			let kicked = 0;
			for (const item of list) {
				try {
					await api.removeUserFromGroup(item.id, threadID);
					kicked++;
				} catch (e) { /* bot may lack permission */ }
			}
			return message.reply(`Checked ${list.length} banned member(s); removed ${kicked}.`);
		}

		const uid = await resolveTarget(event, args, start);
		if (!uid || isNaN(uid)) return message.reply("Please tag a user, reply, or give a valid UID/link.");

		if (mode === "unban") {
			const index = list.findIndex(item => String(item.id) === String(uid));
			if (index === -1) return message.reply(`${uid} is not banned from this group.`);
			list.splice(index, 1);
			await save();
			return message.reply(`Unbanned ${uid} from this group.`);
		}

		if (String(uid) === String(event.senderID)) return message.reply("You cannot ban yourself.");
		if (adminIDs.includes(String(uid))) return message.reply("You cannot ban a group admin.");
		if (list.some(item => String(item.id) === String(uid))) return message.reply(`${uid} is already banned.`);

		const name = nameOf(members, uid) || await usersData.getName(uid).catch(() => uid);
		const time = new Date().toLocaleString("en-GB");
		const reason = args.slice(start).join(" ").replace(event.mentions ? Object.values(event.mentions)[0] || "" : "", "").trim() || "No reason given";
		list.push({ id: String(uid), reason, time, by: event.senderID });
		await save();

		let kickNote = "";
		try {
			await api.removeUserFromGroup(uid, threadID);
			kickNote = " The member was kicked.";
		} catch (e) {
			kickNote = " Bot needs admin permission to kick this member.";
		}
		return message.reply(`Banned ${name} (${uid}) from this group.${kickNote}\nReason: ${reason}\nUse ${prefix}ban unban ${uid} to undo.`);
	},

	onEvent: async function ({ api, event, threadsData }) {
		if (event.logMessageType !== "log:subscribe") return;
		const added = (event.logMessageData && event.logMessageData.addedParticipants) || [];
		if (!added.length) return;
		const list = await threadsData.get(event.threadID, "data.bannedMembers", []);
		if (!Array.isArray(list) || !list.length) return;

		for (const user of added) {
			const uid = String(user.userFbId || user.id || "");
			const hit = list.find(item => String(item.id) === uid);
			if (!hit) continue;
			try {
				await api.removeUserFromGroup(uid, event.threadID);
				notice(api, event.threadID, `🚫 ${user.fullName || uid} is banned from this group and was removed.\nReason: ${hit.reason || "No reason"}\nMade by ${AUTHOR}`);
			} catch (e) {
				notice(api, event.threadID, "Bot needs admin permission to kick a banned member who rejoined.");
			}
		}
	}
};
