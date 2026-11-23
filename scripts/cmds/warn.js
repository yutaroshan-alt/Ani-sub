const AUTHOR = "0xMr_King x ┃ Tanin Islam";
const MAX_WARNS = 3;

function targetFrom(event, args, senderID) {
	if (Object.keys(event.mentions || {}).length) return Object.keys(event.mentions)[0];
	if (event.messageReply && event.messageReply.senderID) return event.messageReply.senderID;
	if (args[1] && !isNaN(args[1])) return args[1];
	return senderID;
}

function protectedUser(uid, api) {
	const cfg = (global.GoatBot && global.GoatBot.config) || {};
	const ids = [].concat(cfg.adminBot || [], cfg.developer || [], cfg.vipuser || []).map(String);
	return ids.includes(String(uid)) || String(uid) === String(api.getCurrentUserID());
}

module.exports = {
	config: {
		name: "warn",
		version: "2.0.0",
		author: AUTHOR,
		countDown: 5,
		role: 0,
		category: "group",
		shortDescription: "Warn members with automatic 3-strike kick",
		guide: {
			en: "{pn} @user <reason>   warn a member\n" +
				"{pn} list              list warned members\n" +
				"{pn} listban           list members at 3 warns\n" +
				"{pn} info [@user|uid]  show warning details\n" +
				"{pn} unwarn [@user|uid] remove the last warning\n" +
				"{pn} unban [@user|uid]  clear all warnings\n" +
				"{pn} reset             clear all warning data"
		}
	},

	onStart: async function ({ api, message, event, args, threadsData, usersData, prefix, role }) {
		const threadID = event.threadID;
		const mode = String(args[0] || "").toLowerCase();
		const warnList = await threadsData.get(threadID, "data.warn", []);
		if (!Array.isArray(warnList)) warnList.length = 0;

		const save = () => threadsData.set(threadID, warnList, "data.warn");

		if (!mode || mode === "help")
			return message.reply(
				`Warn system by ${AUTHOR}\n` +
				`Usage:\n${prefix}warn @user <reason>\n${prefix}warn list\n${prefix}warn listban\n` +
				`${prefix}warn info [@user|uid]\n${prefix}warn unwarn [@user|uid]\n` +
				`${prefix}warn unban [@user|uid]\n${prefix}warn reset`
			);

		if (mode === "list" || mode === "listban") {
			const rows = await Promise.all(warnList.map(async user => {
				const count = (user.list || []).length;
				if (mode === "listban" && count < MAX_WARNS) return null;
				const name = await usersData.getName(user.userID).catch(() => user.userID);
				return `• ${name} (${user.userID}): ${count} warning${count === 1 ? "" : "s"}`;
			}));
			const lines = rows.filter(Boolean);
			if (!lines.length) return message.reply(`No ${mode === "listban" ? "banned" : "warned"} members.`);
			return message.reply(`${mode === "listban" ? "Banned" : "Warned"} members:\n${lines.join("\n")}`);
		}

		if (mode === "info" || mode === "check") {
			const uid = targetFrom(event, args, event.senderID);
			if (!uid || isNaN(uid)) return message.reply("Please tag a user, reply, or give a valid UID.");
			const entry = warnList.find(user => String(user.userID) === String(uid));
			const name = await usersData.getName(uid).catch(() => uid);
			if (!entry || !(entry.list || []).length)
				return message.reply(`${name} (${uid}) has no warnings.`);
			const rows = entry.list.map((w, i) => `${i + 1}. ${w.reason || "No reason"} — ${w.dateTime}`);
			return message.reply(`Warnings for ${name} (${uid}):\n${rows.join("\n")}`);
		}

		if (Number(role || 0) < 1)
			return message.reply("Only group admins can manage warnings.");

		if (mode === "reset") {
			await threadsData.set(threadID, [], "data.warn");
			return message.reply("All warning data has been cleared.");
		}

		if (mode === "unwarn" || mode === "unban") {
			const uid = targetFrom(event, args, event.senderID);
			if (!uid || isNaN(uid)) return message.reply("Please tag a user, reply, or give a valid UID.");
			const index = warnList.findIndex(user => String(user.userID) === String(uid));
			if (index === -1) return message.reply(`No warning data found for ${uid}.`);

			if (mode === "unban") {
				if ((warnList[index].list || []).length < MAX_WARNS)
					return message.reply(`${uid} is not at the kick threshold.`);
				warnList.splice(index, 1);
				await save();
				return message.reply(`${uid} has been unbanned and all warnings were cleared.`);
			}

			const list = warnList[index].list || [];
			if (!list.length) {
				warnList.splice(index, 1);
				await save();
				return message.reply(`${uid} has no warnings to remove.`);
			}
			list.pop();
			if (!list.length) warnList.splice(index, 1);
			await save();
			return message.reply(`Removed the last warning from ${uid}. ${list.length} warning(s) remain.`);
		}

		if (mode === "warn") {
			const uid = targetFrom(event, args, event.messageReply ? event.messageReply.senderID : null);
			if (!uid || isNaN(uid))
				return message.reply("Please tag a user, reply to their message, or give a valid UID.");
			if (protectedUser(uid, api))
				return message.reply("That user is protected and cannot be warned.");

			const reason = args.slice(1).join(" ").trim() || "No reason given";
			const now = new Date().toLocaleString("en-GB");
			let entry = warnList.find(user => String(user.userID) === String(uid));
			if (!entry) {
				entry = { userID: String(uid), list: [] };
				warnList.push(entry);
			}
			entry.list.push({ reason, dateTime: now, by: event.senderID });
			await save();

			const name = await usersData.getName(uid).catch(() => uid);
			const count = entry.list.length;
			if (count < MAX_WARNS) {
				return message.reply(
					`⚠️ ${name} (${uid}) received warning ${count}/${MAX_WARNS}.\n` +
					`Reason: ${reason}\n${MAX_WARNS - count} more warning(s) before an automatic kick.`
				);
			}

			let kickNote = "";
			try {
				await api.removeUserFromGroup(uid, threadID);
				kickNote = "The member was kicked from the group.";
			}
			catch (err) {
				kickNote = "Bot needs admin permission to kick this member.";
			}
			return message.reply(
				`🚫 ${name} (${uid}) reached ${MAX_WARNS} warnings.\n` +
				`Reason: ${reason}\n${kickNote}\nUse ${prefix}warn unban ${uid} to clear the record.`
			);
		}

		return message.reply(`Unknown option "${mode}". Use ${prefix}warn for the command list.`);
	}
};
