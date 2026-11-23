module.exports = {
	config: {
		name: "leave",
		version: "1.0.0",
		author: "0xMr_King x ┃ Tanin Islam",
		category: "events"
	},

	langs: {
		en: {
			leaveMsg:
				"👋 %1 left the group.\n\n" +
				"📌 Group: %2\n" +
				"🕒 Time: %3\n\n" +
				"Made by 0xMr_King x ┃ Tanin Islam"
		}
	},

	onStart: async function ({ api, usersData, threadsData, event, getLang }) {
		if (event.logMessageType !== "log:unsubscribe") return;

		const threadID = event.threadID;
		const threadInfo = await threadsData.get(threadID) || {};
		if (threadInfo.settings && threadInfo.settings.sendLeaveMessage === false) return;

		const data = event.logMessageData || {};
		const leftIDs = data.leftParticipantsFbIds || data.removedParticipants || data.leftParticipants || [];
		const botID = api.getCurrentUserID();

		for (const rawID of leftIDs) {
			const userID = typeof rawID === "object" ? (rawID.userFbId || rawID.id) : rawID;
			if (!userID || String(userID) === String(botID)) continue;

			const name = await usersData.getName(userID) || (typeof rawID === "object" ? rawID.fullName : null) || "User";
			let custom = threadInfo.data && threadInfo.data.leaveMessage;
			let body;
			if (typeof custom === "string" && custom.trim()) {
				body = custom
					.replace(/\{userNameTag\}/g, `@${name}`)
					.replace(/\{userName\}/g, name)
					.replace(/\{type\}/g, "left")
					.replace(/\{threadName\}/g, threadInfo.threadName || "this group")
					.replace(/\{time\}/g, new Date().toLocaleString())
					.replace(/\{session\}/g, String(threadID));
			}
			else {
				body = getLang("leaveMsg", name, threadInfo.threadName || "this group", new Date().toLocaleString());
			}

			try {
				await api.sendMessage({
					body,
					mentions: [{ tag: name, id: userID }]
				}, threadID);
			}
			catch (err) {
				// A leave notice must never break the event handler.
			}
		}
	}
};
