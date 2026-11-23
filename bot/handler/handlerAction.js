const fs = require("fs");
const path = require("path");
const createFuncMessage = global.utils.message;
const handlerCheckDB = require("./handlerCheckData.js");

module.exports = (api, threadModel, userModel, dashBoardModel, globalModel, usersData, threadsData, dashBoardData, globalData) => {
	const devFile = path.join(__dirname, "handlerEvents.dev.js");
	const mainFile = path.join(__dirname, "handlerEvents.js");
	const handlerFile = process.env.NODE_ENV === "development" && fs.existsSync(devFile) ? devFile : mainFile;
	const handlerEvents = require(handlerFile)(api, threadModel, userModel, dashBoardModel, globalModel, usersData, threadsData, dashBoardData, globalData);

	return async function (event) {
		// Anti-Inbox check
		if (
			global.GoatBot.config.antiInbox == true &&
			(event.senderID == event.threadID || event.userID == event.senderID || event.isGroup == false) &&
			(event.senderID || event.userID || event.isGroup == false)
		)
			return;

		const message = createFuncMessage(api, event);

		// DB check/update
		await handlerCheckDB(usersData, threadsData, event);

		// Event handler load
		const handlerChat = await handlerEvents(event, message);
		if (!handlerChat)
			return;

		// Approval system
		if(global.GoatBot.config?.approval){
			const approvedtid = await globalData.get("approved", "data", {});
			if (!approvedtid.approved) {
				approvedtid.approved = [];
				await globalData.set("approved", approvedtid, "data");
			}
			if (!approvedtid.approved.includes(event.threadID)) return;
		}

		const {
			onAnyEvent, onFirstChat, onStart, onChat,
			onReply, onEvent, handlerEvent, onReaction,
			presence, read_receipt
		} = handlerChat;

		// run any event
		onAnyEvent();

		switch (event.type) {
			case "message":
			case "message_reply":
			case "message_unsend":
				onFirstChat();
				onChat();
				onStart();
				onReply();
				break;

			case "event":
				handlerEvent();
				onEvent();
				break;

			case "message_reaction":
				onReaction();

				const { delete: del, kick } = global.GoatBot.config?.reactBy || { delete: [], kick: [] };

				// 🗑️ Delete message
				if (del.includes(event.reaction)) {
					if (event.senderID === api.getCurrentUserID()) {
						if (global.GoatBot.config?.vipuser?.includes(event.userID)) {
							api.unsendMessage(event.messageID);
						}
					}
				}

				// 👟 Kick user
				if (kick.includes(event.reaction)) {
					if (global.GoatBot.config?.vipuser?.includes(event.userID)) {
						api.removeUserFromGroup(event.senderID, event.threadID, (err) => { 
							if (err) return console.log(err); 
						});
					}
				}

				// Reaction-based unsend (fork feature, opt-in via config.reactUnsend)
				const reactUnsend = global.GoatBot.config?.reactUnsend;
				if (reactUnsend && reactUnsend.enable && (reactUnsend.emojis || []).includes(event.reaction)) {
					const reactor = String(event.userID || event.senderID);
					const allowed = !reactUnsend.onlyAdmin ||
						(global.GoatBot.config.adminBot || []).map(String).includes(reactor) ||
						(global.GoatBot.config.vipuser || []).map(String).includes(reactor);
					if (event.senderID === api.getCurrentUserID() && allowed) {
						try { api.unsendMessage(event.messageID); } catch (err) { /* ignore */ }
					}
				}
				break;

			case "presence":
				presence();
				break;

			case "read_receipt":
				read_receipt();
				break;

			default:
				break;
		}
	};
};
