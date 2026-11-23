const fs = require("fs-extra");
const nullAndUndefined = [undefined, null];
const leven = require('leven');
const typing = require("./typingIndicator.js");
const { createGetText2 } = require("./commandLanguage.js");

// Global per-user command throttle — independent of each command's own cooldown.
const globalCommandTimestamps = new Map();

// Emoji-trigger guard: 7s per user, then a 30min bot-wide suspension for spam.
const EMOJI_COOLDOWN_MS = 7000;
const EMOJI_SUSPENSION_MS = 30 * 60 * 1000;
const EMOJI_SPAM_LIMIT = 3;
const emojiLastUsed = new Map();
const emojiSpamCount = new Map();
const runtimeSuspensions = new Map();

// ---- Concurrency helpers (so many groups can be handled at the same time) ----
// Dedupe simultaneous creation of the same user/thread record
const pendingUserCreate = new Map();
const pendingThreadCreate = new Map();

function createOnce(map, key, creator) {
	if (map.has(key)) return map.get(key);
	const p = Promise.resolve()
		.then(creator)
		.finally(() => map.delete(key));
	map.set(key, p);
	return p;
}

// Analytics: count in memory and flush in one batch (avoids lost updates from parallel read-modify-write)
const analyticsBuffer = {};
let analyticsFlushTimer = null;
let analyticsFlushing = false;

function trackAnalytics(globalData, commandName) {
	analyticsBuffer[commandName] = (analyticsBuffer[commandName] || 0) + 1;
	if (analyticsFlushTimer) return;
	analyticsFlushTimer = setTimeout(async () => {
		analyticsFlushTimer = null;
		if (analyticsFlushing) return;
		analyticsFlushing = true;
		try {
			const pending = { ...analyticsBuffer };
			for (const k of Object.keys(pending)) delete analyticsBuffer[k];
			const analytics = await globalData.get("analytics", "data", {});
			for (const [name, count] of Object.entries(pending))
				analytics[name] = (analytics[name] || 0) + count;
			await globalData.set("analytics", analytics, "data");
		} catch (err) {
			// silent: analytics must never break command handling
		} finally {
			analyticsFlushing = false;
		}
	}, 3000);
}

function getType(obj) {
	return Object.prototype.toString.call(obj).slice(8, -1);
}

// ---- Emoji spam / temporary suspension helpers ----
function normalizeEmoji(value) {
	return global.utils?.normalizeEmojiText
		? global.utils.normalizeEmojiText(value)
		: String(value == null ? "" : value).replace(/\uFE0F/g, "").trim();
}

function isEmojiCommandBody(body, command) {
	return global.utils?.isEmojiTriggerBody
		? global.utils.isEmojiTriggerBody(body, command)
		: false;
}

function anyEmojiCommandBody(body) {
	if (!normalizeEmoji(body)) return false;
	const GoatBot = global.GoatBot;
	for (const key of (GoatBot?.onChat || [])) {
		const command = GoatBot.commands.get(key);
		if (command && isEmojiCommandBody(body, command)) return true;
	}
	return false;
}

function suspensionUntil(userData, senderID) {
	const saved = Number(userData?.data?.emojiGuard?.suspendedUntil || 0);
	const runtime = Number(runtimeSuspensions.get(String(senderID)) || 0);
	return Math.max(saved, runtime);
}

async function suspendUser(usersData, userData, senderID, reason) {
	const until = Date.now() + EMOJI_SUSPENSION_MS;
	const key = String(senderID);
	runtimeSuspensions.set(key, until);
	emojiSpamCount.set(key, 0);
	emojiLastUsed.delete(key);

	if (userData && typeof userData === "object") {
		userData.data = userData.data || {};
		userData.data.emojiGuard = { ...(userData.data.emojiGuard || {}), suspendedUntil: until, reason };
	}
	try {
		await usersData?.set?.(senderID, { suspendedUntil: until, reason }, "data.emojiGuard");
	}
	catch (e) { /* runtime suspension still works */ }
	return until;
}

async function unsuspendUser(usersData, userData, senderID) {
	const key = String(senderID);
	runtimeSuspensions.delete(key);
	emojiSpamCount.delete(key);
	emojiLastUsed.delete(key);

	if (userData && typeof userData === "object" && userData.data) {
		userData.data.emojiGuard = { ...(userData.data.emojiGuard || {}), suspendedUntil: 0 };
	}
	try {
		await usersData?.set?.(senderID, { suspendedUntil: 0 }, "data.emojiGuard");
	}
	catch (e) { /* ignore */ }
}

async function notifySuspension(message, onReply, senderID, until, reason) {
	const left = Math.max(1, until - Date.now());
	const seconds = Math.ceil(left / 1000);
	const duration = global.utils?.formatDuration ? global.utils.formatDuration(seconds) : `${seconds}s`;
	const text =
		`🚫 You are suspended from using the bot for ${duration}.\n` +
		`Reason: ${reason || "emoji spam"}\n` +
		`A bot admin can reply to this message with "Unban" to restore your access.`;

	let info = null;
	try { info = await message.reply(text); }
	catch (e) { /* the user still stays suspended */ }

	if (info?.messageID && onReply) {
		// Keep only the newest suspension notice for this user.
		for (const [id, entry] of onReply) {
			if (entry?.type === "emojiGuardUnban" && String(entry.targetID) === String(senderID))
				onReply.delete(id);
		}
		onReply.set(info.messageID, {
			type: "emojiGuardUnban",
			commandName: "emojiGuard",
			targetID: String(senderID),
			reason: reason || "emoji spam",
			createdAt: Date.now()
		});
	}
	return info;
}

async function resolveSenderName(api, usersData, userData, senderID) {
	let name = userData?.name;
	if (name) return name;

	if (!isNaN(senderID)) {
		try {
			name = await usersData.getName(senderID, false);
		} catch (err) {}
	}

	if (!name && !isNaN(senderID) && typeof api?.getUserInfo === "function") {
		try {
			const userInfo = await api.getUserInfo(senderID);
			name = userInfo?.[senderID]?.name;
		} catch (err) {}
	}

	return name || "User";
}

function getRole(threadData, senderID) {
	const config = global.GoatBot.config;
	const adminBot = config.adminBot || [];
	const developer = config.developer || [];
	const vipuser = config.vipuser || []; 
    
	if (!senderID) return 0;
	const adminBox = threadData ? threadData.adminIDs || [] : [];
    
    if (developer.includes(senderID)) return 4;
    if (adminBot.includes(senderID)) return 3; 
	if (vipuser.includes(senderID)) return 2; 
    if (adminBox.includes(senderID)) return 1;
    
    return 0;
}

function getText(type, reason, time, targetID, lang) {
	const utils = global.utils;
	if (type == "userBanned")
		return utils.getText({ lang, head: "handlerEvents" }, "userBanned", reason, time, targetID);
	else if (type == "threadBanned")
		return utils.getText({ lang, head: "handlerEvents" }, "threadBanned", reason, time, targetID);
	else if (type == "onlyAdminBox")
		return utils.getText({ lang, head: "handlerEvents" }, "onlyAdminBox");
	else if (type == "onlyAdminBot")
		return utils.getText({ lang, head: "handlerEvents" }, "onlyAdminBot");
}

function replaceShortcutInLang(text, prefix, commandName) {
	return text
		.replace(/\{(?:p|prefix)\}/g, prefix)
		.replace(/\{(?:n|name)\}/g, commandName)
		.replace(/\{pn\}/g, `${prefix}${commandName}`);
}

function getRoleConfig(utils, command, isGroup, threadData, commandName) {
	let roleConfig;
	if (utils.isNumber(command.config.role)) {
		roleConfig = { onStart: command.config.role };
	} else if (typeof command.config.role == "object" && !Array.isArray(command.config.role)) {
		if (!command.config.role.onStart) command.config.role.onStart = 0;
		roleConfig = command.config.role;
	} else {
		roleConfig = { onStart: 0 };
	}

	if (isGroup)
		roleConfig.onStart = threadData.data.setRole?.[commandName] ?? roleConfig.onStart;

	for (const key of ["onChat", "onStart", "onReaction", "onReply"]) {
		if (roleConfig[key] == undefined)
			roleConfig[key] = roleConfig.onStart;
	}

	return roleConfig;
}

// Group approval. When config.threadApproval.enable is true the bot only works in the groups listed in
// threadApproval.approvedThreadIDs. Bot admins / developers can still use it anywhere (to run a "tid"
// command in a new group, etc). Private chats are not affected. Missing key = feature off.
function isThreadBlocked(isGroup, threadID, senderID) {
	const cfg = global.GoatBot.config.threadApproval;
	if (!cfg || cfg.enable !== true || !isGroup) return false;
	if ((cfg.approvedThreadIDs || []).map(String).includes(String(threadID))) return false;
	const { adminBot = [], developer = [] } = global.GoatBot.config;
	if (senderID && [...adminBot, ...developer].map(String).includes(String(senderID))) return false;
	return true;
}

function isBannedOrOnlyAdmin(userData, threadData, senderID, threadID, isGroup, commandName, message, lang) {
	const config = global.GoatBot.config;
	if (isThreadBlocked(isGroup, threadID, senderID)) return true; // silent: unapproved group
	const { adminBot, hideNotiMessage, developerOnly, vipOnly } = config; 
    const role = getRole(threadData, senderID); 

	const infoBannedUser = userData.banned || {};
	if (infoBannedUser.status == true) {
		const { reason, date } = infoBannedUser;
		if (hideNotiMessage.userBanned == false)
			message.reply(getText("userBanned", reason, date, senderID, lang));
		return true;
	}

	if (
		config.adminOnly.enable == true
		&& !adminBot.includes(senderID)
		&& !(config.developer || []).includes(senderID)
		&& !(config.vipuser || []).includes(senderID)
		&& !(config.adminOnly.ignoreCommand || []).includes(commandName)
	) {
		if (hideNotiMessage.adminOnly == false)
			message.reply(global.utils.getText({ lang, head: "handlerEvents" }, "onlyAdminBot", null, null, null, lang));
		return true;
	}
	
	if (
		(developerOnly?.enable == true)
		&& role < 4
		&& !(developerOnly?.ignoreCommand || []).includes(commandName)
	) {
		if ((hideNotiMessage.developerOnly ?? false) == false) 
			message.reply(global.utils.getText({ lang, head: "handlerEvents" }, "onlyDeveloper", null, null, null, lang)); 
		return true;
	}
    
	if (
		(vipOnly?.enable == true)
		&& role < 2
		&& !(vipOnly?.ignoreCommand || []).includes(commandName)
	) {
		if ((hideNotiMessage.vipOnly ?? false) == false)
			message.reply(global.utils.getText({ lang, head: "handlerEvents" }, "onlyVipUserGlobal", null, null, null, lang));
		return true;
	}

	if (isGroup == true) {
		if (
			threadData.data.onlyAdminBox === true
			&& !(threadData.adminIDs || []).includes(senderID)
			&& !(threadData.data.ignoreCommanToOnlyAdminBox || []).includes(commandName)
		) {
			if (!threadData.data.hideNotiMessageOnlyAdminBox)
				message.reply(getText("onlyAdminBox", null, null, null, lang));
			return true;
		}

		const infoBannedThread = threadData.banned || {};
		if (infoBannedThread.status == true) {
			const { reason, date } = infoBannedThread;
			if (hideNotiMessage.threadBanned == false)
				message.reply(getText("threadBanned", reason, date, threadID, lang));
			return true;
		}
	}
	return false;
}

module.exports = function (api, threadModel, userModel, dashBoardModel, globalModel, usersData, threadsData, dashBoardData, globalData) {
	return async function (event, message) {

		const { utils, client, GoatBot } = global;
		const { getPrefix, removeHomeDir, log, getTime } = utils;
		const { config, configCommands: { envGlobal, envCommands, envEvents } } = GoatBot;
		const { autoRefreshThreadInfoFirstTime } = config.database;
		let { hideNotiMessage = {} } = config;

		const { body, messageID, threadID, isGroup } = event;

		if (!threadID) return;

		const senderID = event.userID || event.senderID || event.author;

		if (usersData && typeof usersData.get === "function") global.dailyUsersData = usersData;

		if ((event.type === "message" || event.type === "message_reply") && senderID) {
			try {
				let botID = null;
				try { botID = api.getCurrentUserID && api.getCurrentUserID(); } catch (e) { }
				if (global.dailyMessageTracker && String(senderID) !== String(botID))
					global.dailyMessageTracker(senderID);
			} catch (e) { }
		}

		let threadData = global.db.allThreadData.find(t => t.threadID == threadID);
		let userData = global.db.allUserData.find(u => u.userID == senderID);

		if (!userData && !isNaN(senderID))
			userData = await createOnce(pendingUserCreate, senderID, () => usersData.create(senderID));

		if (!threadData && !isNaN(threadID)) {
			if (global.temp.createThreadDataError.includes(threadID)) return;
			threadData = await createOnce(pendingThreadCreate, threadID, () => threadsData.create(threadID));
			global.db.receivedTheFirstMessage[threadID] = true;
		} else {
			if (
				autoRefreshThreadInfoFirstTime === true
				&& !global.db.receivedTheFirstMessage[threadID]
			) {
				global.db.receivedTheFirstMessage[threadID] = true;
				await threadsData.refreshInfo(threadID);
			}
		}
		if (typeof threadData.settings?.hideNotiMessage == "object")
			hideNotiMessage = threadData.settings.hideNotiMessage;
				const prefix = getPrefix(threadID);
		const role = getRole(threadData, senderID);
		const senderName = await resolveSenderName(api, usersData, userData, senderID);

		// Temporary emoji-spam suspension blocks bot commands and emoji triggers, but not admin replies.
		const suspendedUntil = suspensionUntil(userData, senderID);
		if (suspendedUntil > Date.now() && role < 3) {
			const triesToUseBot = String(body || "").trim().startsWith(prefix) || anyEmojiCommandBody(body);
			if (triesToUseBot) {
				await notifySuspension(message, GoatBot.onReply, senderID, suspendedUntil, "emoji spam");
				return;
			}
		}

		const parameters = {
			api, usersData, threadsData, message, event,
			userModel, threadModel, prefix, dashBoardModel,
			globalModel, dashBoardData, globalData, envCommands,
			envEvents, envGlobal, role, senderName,
			removeCommandNameFromBody: function removeCommandNameFromBody(body_, prefix_, commandName_) {
				if ([body_, prefix_, commandName_].every(x => nullAndUndefined.includes(x)))
					throw new Error("Please provide parameters");
				return body_.replace(new RegExp(`^${prefix_}(\\s+|)${commandName_}`, "i"), "").trim();
			}
		};
		const langCode = threadData.data?.lang || config.language || "en";

		function createMessageSyntaxError(commandName) {
			message.SyntaxError = async function () {
				return await message.reply(utils.getText({ lang: langCode, head: "handlerEvents" }, "commandSyntaxError", prefix, commandName));
			};
		}
		let isUserCallCommand = false;

		async function onStart() {
			if (!body) return;

			let isPrefixlessCall = false;
			let cleanBody = body;

			const rawNpx = threadData.data?.npxConfig || {};
			const npxConfig = {
				all: rawNpx.all === true,
				commands: Array.isArray(rawNpx.commands) ? rawNpx.commands : [],
				roles: Array.isArray(rawNpx.roles) ? rawNpx.roles : []
			};
			
			if (body.startsWith(prefix)) {
				cleanBody = body.slice(prefix.length).trim();
			} else {
				// Prefix is required for EVERY user (developer included).
				// Prefix-less calls only work when the group admin enabled them via npx.
				const firstWord = body.trim().split(/ +/)[0].toLowerCase();
				const targetCmd = GoatBot.commands.get(firstWord) || GoatBot.commands.get(GoatBot.aliases.get(firstWord));
				
				if (targetCmd) {
					const realName = targetCmd.config.name;
					const canRunByAll = npxConfig.all === true;
					const canRunByCmd = npxConfig.commands.includes(realName);
					const canRunByRole = npxConfig.roles.includes(role);

					if (canRunByAll || canRunByCmd || canRunByRole) {
						isPrefixlessCall = true;
						cleanBody = body.trim();
					} else {
						return;
					}
				} else {
					return;
				}
			}

			const dateNow = Date.now();
			const args = cleanBody.split(/ +/);
			let commandName = args.shift().toLowerCase();
			let command = GoatBot.commands.get(commandName) || GoatBot.commands.get(GoatBot.aliases.get(commandName));

			const aliasesData = threadData.data?.aliases || {};
			for (const cmdName in aliasesData) {
				if (aliasesData[cmdName].includes(commandName)) {
					command = GoatBot.commands.get(cmdName);
					break;
				}
			}

			if (command) commandName = command.config.name;

			function removeCommandNameFromBody(body_, prefix_, commandName_) {
				const usedPrefix = isPrefixlessCall ? "" : prefix;
				return body_.replace(new RegExp(`^${usedPrefix}(\\s+|)${commandName_}`, "i"), "").trim();
			}

			if (isBannedOrOnlyAdmin(userData, threadData, senderID, threadID, isGroup, commandName, message, langCode))
				return;

			if (!command) {
				if (!hideNotiMessage.commandNotFound && !isPrefixlessCall) {
					const allCommands = Array.from(GoatBot.commands.keys());
					let closestCommand = null;
					let minDistance = 999;
					const distanceThreshold = 2;

					if (commandName) {
						for (const correctCommand of allCommands) {
							const distance = leven(commandName.toLowerCase(), correctCommand.toLowerCase());
							if (distance < minDistance && distance <= distanceThreshold) {
								minDistance = distance;
								closestCommand = correctCommand;
							}
						}
					}
					
					if (closestCommand) {
						return await message.reply(
							utils.getText({ lang: langCode, head: "handlerEvents" }, "commandNotFoundSuggestion", closestCommand, prefix)
						);
					} else {
						return await message.reply(
							commandName ?
								utils.getText({ lang: langCode, head: "handlerEvents" }, "commandNotFound", commandName, prefix) :
								utils.getText({ lang: langCode, head: "handlerEvents" }, "commandNotFound2", prefix)
						);
					}
				}
				return true;
			}

			const roleConfig = getRoleConfig(utils, command, isGroup, threadData, commandName);
			const needRole = roleConfig.onStart;

			if (needRole > role) {
				if (!hideNotiMessage.needRoleToUseCmd) {
					if (needRole == 1)
						return await message.reply(utils.getText({ lang: langCode, head: "handlerEvents" }, "onlyAdmin", commandName));
					else if (needRole == 2)
						return await message.reply(utils.getText({ lang: langCode, head: "handlerEvents" }, "onlyVipUser", commandName));
					else if (needRole == 3)
						return await message.reply(utils.getText({ lang: langCode, head: "handlerEvents" }, "onlyAdminBot", commandName));
					else if (needRole == 4)
						return await message.reply(utils.getText({ lang: langCode, head: "handlerEvents" }, "onlyDeveloper", commandName));
				}
				return true;
			}

			const spamGuard = config.commandSpamGuard || { enable: true, seconds: 7, notify: false };
			if (spamGuard.enable !== false) {
				const guardSeconds = Number(spamGuard.seconds) > 0 ? Number(spamGuard.seconds) : 7;
				const lastGlobal = globalCommandTimestamps.get(senderID) || 0;
				const globalLeft = lastGlobal + guardSeconds * 1000 - dateNow;
				if (globalLeft > 0) {
					if (spamGuard.notify)
						return await message.reply(utils.getText({ lang: langCode, head: "handlerEvents" }, "waitingForCommand", Math.ceil(globalLeft / 1000)));
					return true;
				}
				globalCommandTimestamps.set(senderID, dateNow);
			}

			if (!client.countDown[commandName]) client.countDown[commandName] = {};
			const timestamps = client.countDown[commandName];
			let getCoolDown = command.config.countDown;
			if (!getCoolDown && getCoolDown != 0 || isNaN(getCoolDown)) getCoolDown = 1;
			const cooldownCommand = getCoolDown * 1000;

			if (timestamps[senderID]) {
				const expirationTime = timestamps[senderID] + cooldownCommand;
				if (dateNow < expirationTime)
					return await message.reply(utils.getText({ lang: langCode, head: "handlerEvents" }, "waitingForCommand", ((expirationTime - dateNow) / 1000).toString().slice(0, 3)));
			}

			const time = getTime("DD/MM/YYYY HH:mm:ss");
			isUserCallCommand = true;

			const typingHandle = typing.start(api, threadID, "command");
			try {
				trackAnalytics(globalData, commandName);
				try {
					if (typeof global.dailyTaskTracker === "function") global.dailyTaskTracker(senderID, commandName);
				}
				catch (e) { /* task tracking must never break a command */ }

				createMessageSyntaxError(commandName);
				const getText2 = createGetText2(langCode, `${process.cwd()}/languages/cmds/${langCode}.js`, prefix, command);

				await command.onStart({
					...parameters,
					message,
					args,
					commandName,
					getLang: getText2,
					removeCommandNameFromBody
				});
				timestamps[senderID] = dateNow;
				log.info("CALL COMMAND", `${commandName} | ${senderName} | ${senderID} | ${threadID} | ${args.join(" ")}`);
			} catch (err) {
				log.err("CALL COMMAND", `An error occurred when calling the command ${commandName}`, err);
				return await message.reply(utils.getText({ lang: langCode, head: "handlerEvents" }, "errorOccurred", time, commandName, removeHomeDir(err.stack ? err.stack.split("\n").slice(0, 5).join("\n") : JSON.stringify(err, null, 2))));
			} finally {
				typingHandle.stop();
			}
		}

		async function onChat() {
			const allOnChat = GoatBot.onChat || [];
			const args = body ? body.split(/ +/) : [];
			const emojiCommands = new Set();

			for (const key of allOnChat) {
				const command = GoatBot.commands.get(key);
				if (command && isEmojiCommandBody(body, command))
					emojiCommands.add(String(command.config.name).toLowerCase());
			}

			let emojiAllowed = true;
			if (emojiCommands.size && role < 3) {
				const key = String(senderID);
				const now = Date.now();
				const last = emojiLastUsed.get(key) || 0;
				const left = last + EMOJI_COOLDOWN_MS - now;

				if (left > 0) {
					const count = (emojiSpamCount.get(key) || 0) + 1;
					emojiSpamCount.set(key, count);
					emojiAllowed = false;

					if (count >= EMOJI_SPAM_LIMIT) {
						const until = await suspendUser(usersData, userData, senderID, "emoji spam");
						await notifySuspension(message, GoatBot.onReply, senderID, until, "emoji spam");
					}
				} else {
					emojiLastUsed.set(key, now);
					emojiSpamCount.set(key, 0);
				}
			}

			for (const key of allOnChat) {
				const command = GoatBot.commands.get(key);
				if (!command) continue;
				const commandName = command.config.name;

				if (emojiCommands.has(String(commandName).toLowerCase()) && !emojiAllowed) continue;

				const roleConfig = getRoleConfig(utils, command, isGroup, threadData, commandName);
				const needRole = roleConfig.onChat;
				if (needRole > role) continue;

				const getText2 = createGetText2(langCode, `${process.cwd()}/languages/cmds/${langCode}.js`, prefix, command);
				const time = getTime("DD/MM/YYYY HH:mm:ss");
				createMessageSyntaxError(commandName);

				if (getType(command.onChat) == "Function") {
					const defaultOnChat = command.onChat;
					command.onChat = async function () { return defaultOnChat(...arguments); };
				}

				command.onChat({
					...parameters,
					isUserCallCommand,
					args,
					commandName,
					getLang: getText2
				}).then(async (handler) => {
					if (typeof handler == "function") {
						if (isBannedOrOnlyAdmin(userData, threadData, senderID, threadID, isGroup, commandName, message, langCode))
							return;
						try {
							await handler();
							log.info("onChat", `${commandName} | ${senderName} | ${senderID} | ${threadID} | ${args.join(" ")}`);
						} catch (err) {
							await message.reply(utils.getText({ lang: langCode, head: "handlerEvents" }, "errorOccurred2", time, commandName, removeHomeDir(err.stack ? err.stack.split("\n").slice(0, 5).join("\n") : JSON.stringify(err, null, 2))));
						}
					}
				}).catch(err => {
					log.err("onChat", `An error occurred when calling onChat ${commandName}`, err);
				});
			}
		}

		async function onAnyEvent() {
			if (isThreadBlocked(isGroup, threadID, senderID)) return;
			const allOnAnyEvent = GoatBot.onAnyEvent || [];
			let args = [];
			if (typeof event.body == "string" && event.body.startsWith(prefix))
				args = event.body.split(/ +/);

			for (const key of allOnAnyEvent) {
				if (typeof key !== "string") continue;
				const command = GoatBot.commands.get(key);
				if (!command) continue;
				const commandName = command.config.name;
				const time = getTime("DD/MM/YYYY HH:mm:ss");
				createMessageSyntaxError(commandName);

				const getText2 = createGetText2(langCode, `${process.cwd()}/languages/events/${langCode}.js`, prefix, command);

				if (getType(command.onAnyEvent) == "Function") {
					const defaultOnAnyEvent = command.onAnyEvent;
					command.onAnyEvent = async function () { return defaultOnAnyEvent(...arguments); };
				}

				command.onAnyEvent({
					...parameters,
					args,
					commandName,
					getLang: getText2
				}).then(async (handler) => {
					if (typeof handler == "function") {
						try {
							await handler();
							log.info("onAnyEvent", `${commandName} | ${senderID} | ${senderName} | ${threadID}`);
						} catch (err) {
							message.reply(utils.getText({ lang: langCode, head: "handlerEvents" }, "errorOccurred7", time, commandName, removeHomeDir(err.stack ? err.stack.split("\n").slice(0, 5).join("\n") : JSON.stringify(err, null, 2))));
						}
					}
				}).catch(err => {
					log.err("onAnyEvent", `An error occurred when calling onAnyEvent ${commandName}`, err);
				});
			}
		}

		async function onFirstChat() {
			const allOnFirstChat = GoatBot.onFirstChat || [];
			const args = body ? body.split(/ +/) : [];

			for (const itemOnFirstChat of allOnFirstChat) {
				const { commandName, threadIDsChattedFirstTime } = itemOnFirstChat;
				if (threadIDsChattedFirstTime.includes(threadID)) continue;
				const command = GoatBot.commands.get(commandName);
				if (!command) continue;

				itemOnFirstChat.threadIDsChattedFirstTime.push(threadID);
				const getText2 = createGetText2(langCode, `${process.cwd()}/languages/cmds/${langCode}.js`, prefix, command);
				const time = getTime("DD/MM/YYYY HH:mm:ss");
				createMessageSyntaxError(commandName);

				if (getType(command.onFirstChat) == "Function") {
					const defaultOnFirstChat = command.onFirstChat;
					command.onFirstChat = async function () { return defaultOnFirstChat(...arguments); };
				}

				command.onFirstChat({
					...parameters,
					isUserCallCommand,
					args,
					commandName,
					getLang: getText2
				}).then(async (handler) => {
					if (typeof handler == "function") {
						if (isBannedOrOnlyAdmin(userData, threadData, senderID, threadID, isGroup, commandName, message, langCode))
							return;
						try {
							await handler();
							log.info("onFirstChat", `${commandName} | ${senderName} | ${senderID} | ${threadID} | ${args.join(" ")}`);
						} catch (err) {
							await message.reply(utils.getText({ lang: langCode, head: "handlerEvents" }, "errorOccurred2", time, commandName, removeHomeDir(err.stack ? err.stack.split("\n").slice(0, 5).join("\n") : JSON.stringify(err, null, 2))));
						}
					}
				}).catch(err => {
					log.err("onFirstChat", `An error occurred when calling onFirstChat ${commandName}`, err);
				});
			}
		}

		async function onReply() {
			if (!event.messageReply) return;
			const { onReply } = GoatBot;
			const Reply = onReply.get(event.messageReply.messageID);
			if (!Reply) return;

			// Admin replies "Unban" to the suspension notice to restore that user.
			if (Reply.type === "emojiGuardUnban") {
				if (getRole(threadData, senderID) < 3) return;
				if (!/^\s*unban\b/i.test(String(body || ""))) return;

				await unsuspendUser(usersData, global.db.allUserData.find(u => String(u.userID) === String(Reply.targetID)), Reply.targetID);
				onReply.delete(event.messageReply.messageID);
				await message.reply(`✅ Unbanned <@${Reply.targetID}>. They can use the bot again.`);
				return;
			}

			Reply.delete = () => onReply.delete(messageID);
			const commandName = Reply.commandName;
			if (!commandName) return;
			const command = GoatBot.commands.get(commandName);
			if (!command) return;

			const roleConfig = getRoleConfig(utils, command, isGroup, threadData, commandName);
			const needRole = roleConfig.onReply;
			if (needRole > role) return;
			if (typeof command.onReply !== "function") return;

			const getText2 = createGetText2(langCode, `${process.cwd()}/languages/cmds/${langCode}.js`, prefix, command);
			const time = getTime("DD/MM/YYYY HH:mm:ss");
			const typingHandle = typing.start(api, threadID, "reply");
			try {
				const args = body ? body.split(/ +/) : [];
				createMessageSyntaxError(commandName);
				if (isBannedOrOnlyAdmin(userData, threadData, senderID, threadID, isGroup, commandName, message, langCode))
					return;
				await command.onReply({
					...parameters,
					Reply,
					args,
					commandName,
					getLang: getText2
				});
				log.info("onReply", `${commandName} | ${senderName} | ${senderID} | ${threadID} | ${args.join(" ")}`);
			} catch (err) {
				log.err("onReply", `An error occurred when calling onReply ${commandName}`, err);
			} finally {
				typingHandle.stop();
			}
		}

		async function onReaction() {
			const { onReaction } = GoatBot;
			const Reaction = onReaction.get(messageID);
			if (!Reaction) return;
			Reaction.delete = () => onReaction.delete(messageID);
			const commandName = Reaction.commandName;
			if (!commandName) return;
			const command = GoatBot.commands.get(commandName);
			if (!command) return;

			const roleConfig = getRoleConfig(utils, command, isGroup, threadData, commandName);
			const needRole = roleConfig.onReaction;
			if (needRole > role) return;
			if (typeof command.onReaction !== "function") return;

			const time = getTime("DD/MM/YYYY HH:mm:ss");
			const typingHandle = typing.start(api, threadID, "reaction");
			try {
				const getText2 = createGetText2(langCode, `${process.cwd()}/languages/cmds/${langCode}.js`, prefix, command);
				const args = [];
				createMessageSyntaxError(commandName);
				if (isBannedOrOnlyAdmin(userData, threadData, senderID, threadID, isGroup, commandName, message, langCode))
					return;
				await command.onReaction({
					...parameters,
					Reaction,
					args,
					commandName,
					getLang: getText2
				});
				log.info("onReaction", `${commandName} | ${senderName} | ${senderID} | ${threadID} | ${event.reaction}`);
			} catch (err) {
				log.err("onReaction", `An error occurred when calling onReaction ${commandName}`, err);
			} finally {
				typingHandle.stop();
			}
		}
		async function handlerEvent() {
			if (isThreadBlocked(isGroup, threadID, senderID)) return;
			const { author } = event;
			const allEventCommand = GoatBot.eventCommands.entries();
			for (const [key] of allEventCommand) {
				const getEvent = GoatBot.eventCommands.get(key);
				if (!getEvent) continue;
				const commandName = getEvent.config.name;
				const getText2 = createGetText2(langCode, `${process.cwd()}/languages/events/${langCode}.js`, prefix, getEvent);
				const time = getTime("DD/MM/YYYY HH:mm:ss");
				try {
					const handler = await getEvent.onStart({
						...parameters,
						commandName,
						getLang: getText2
					});
					if (typeof handler == "function") {
						await handler();
						log.info("EVENT COMMAND", `Event: ${commandName} | ${author} | ${senderName} | ${threadID}`);
					}
				} catch (err) {
					log.err("EVENT COMMAND", `An error occurred when calling event ${commandName}`, err);
				}
			}
		}

		async function onEvent() {
			if (isThreadBlocked(isGroup, threadID, senderID)) return;
			const allOnEvent = GoatBot.onEvent || [];
			const args = [];
			const { author } = event;
			for (const key of allOnEvent) {
				if (typeof key !== "string") continue;
				const command = GoatBot.commands.get(key);
				if (!command) continue;
				const commandName = command.config.name;
				const time = getTime("DD/MM/YYYY HH:mm:ss");
				createMessageSyntaxError(commandName);

				const getText2 = createGetText2(langCode, `${process.cwd()}/languages/events/${langCode}.js`, prefix, command);

				if (getType(command.onEvent) == "Function") {
					const defaultOnEvent = command.onEvent;
					command.onEvent = async function () { return defaultOnEvent(...arguments); };
				}

				command.onEvent({
					...parameters,
					args,
					commandName,
					getLang: getText2
				}).then(async (handler) => {
					if (typeof handler == "function") {
						try {
							await handler();
							log.info("onEvent", `${commandName} | ${author} | ${senderName} | ${threadID}`);
						} catch (err) {
							message.reply(utils.getText({ lang: langCode, head: "handlerEvents" }, "errorOccurred6", time, commandName, removeHomeDir(err.stack ? err.stack.split("\n").slice(0, 5).join("\n") : JSON.stringify(err, null, 2))));
						}
					}
				}).catch(err => {
					log.err("onEvent", `An error occurred when calling onEvent ${commandName}`, err);
				});
			}
		}

		async function presence() {}
		async function read_receipt() {}

		return {
			onAnyEvent,
			onFirstChat,
			onChat,
			onStart,
			onReaction,
			onReply,
			onEvent,
			handlerEvent,
			presence,
			read_receipt
		};
	};
};
