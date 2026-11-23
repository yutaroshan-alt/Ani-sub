const AUTHOR = "0xMr_King x ┃ Tanin Islam";

function applyTemplate(template, uid, name) {
	return String(template || "")
		.replace(/\{userName\}/gi, name || "")
		.replace(/\{userID\}/gi, uid || "")
		.trim();
}

module.exports = {
	config: {
		name: "autosetname",
		aliases: ["autonick"],
		version: "2.0.0",
		author: AUTHOR,
		countDown: 5,
		role: 1,
		category: "group",
		shortDescription: "Automatically nickname new members",
		guide: {
			en: "{pn} set <template>\n{pn} on|off\n{pn} view\nTemplates: {userName}, {userID}"
		}
	},

	onStart: async function ({ message, event, args, threadsData, prefix }) {
		const mode = String(args[0] || "").toLowerCase();
		const threadID = event.threadID;

		if (["set", "add", "config"].includes(mode)) {
			const template = args.slice(1).join(" ").trim();
			if (!template) return message.reply(`Usage: ${prefix}autosetname set {userName} 🚀`);
			await threadsData.set(threadID, template, "data.autoSetNameTemplate");
			return message.reply(`Auto-nickname template set to: ${template}`);
		}

		if (["on", "off"].includes(mode)) {
			await threadsData.set(threadID, mode === "on", "settings.enableAutoSetName");
			return message.reply(`Auto-nickname is now ${mode === "on" ? "ON" : "OFF"}.`);
		}

		const template = await threadsData.get(threadID, "data.autoSetNameTemplate", null);
		const enabled = await threadsData.get(threadID, "settings.enableAutoSetName", false);
		return message.reply(
			`Auto-nickname: ${enabled ? "ON" : "OFF"}\nTemplate: ${template || "not set"}\n` +
			`Usage: ${prefix}autosetname set <template> | on | off | view`
		);
	},

	onEvent: async function ({ api, event, threadsData }) {
		if (event.logMessageType !== "log:subscribe") return;
		const enabled = await threadsData.get(event.threadID, "settings.enableAutoSetName", false);
		if (!enabled) return;
		const template = await threadsData.get(event.threadID, "data.autoSetNameTemplate", null);
		if (!template) return;

		const added = (event.logMessageData && event.logMessageData.addedParticipants) || [];
		for (const user of added) {
			const uid = String(user.userFbId || user.id || "");
			if (!uid) continue;
			const nickname = applyTemplate(template, uid, user.fullName || "");
			if (!nickname) continue;
			try {
				await api.changeNickname(nickname, event.threadID, uid);
			} catch (e) {
				// Missing permission or invite-link groups; never break the event flow.
				return;
			}
		}
	}
};
