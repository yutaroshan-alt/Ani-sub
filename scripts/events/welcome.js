"use strict";

const axios = require("axios");

const COOLDOWN_MS = 8000;
const IMAGE_URL = "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcS4Bajq7KeozS19EhsrKZXtn9MxZoTSyE0TxcaByeRNew&s=10";

// threadID -> { users: Map<uid, name>, timer }
const pending = new Map();

// Turn every "@Name" in the final text into a real Facebook mention.
function mentionAll(text, users) {
	const mentions = [];
	let cursor = 0;
	for (const user of users) {
		const tag = `@${user.name}`;
		let index = text.indexOf(tag, cursor);
		if (index === -1) index = text.indexOf(tag);
		if (index === -1) continue;
		mentions.push({ tag, id: String(user.id), fromIndex: index });
		cursor = index + tag.length;
	}
	return mentions;
}

async function flush(ctx, threadID) {
	const bucket = pending.get(threadID);
	if (!bucket) return;
	pending.delete(threadID);

	const users = [...bucket.users.values()];
	if (!users.length) return;

	const { api, usersData, threadsData, prefix, getLang } = ctx;
	const threadInfo = (await threadsData.get(threadID)) || {};
	if (threadInfo.settings && threadInfo.settings.sendWelcomeMessage === false) return;

	const threadName = threadInfo.threadName || "This Group";
	const systemPrefix = prefix;
	const groupPrefix = (threadInfo.data && threadInfo.data.prefix) || prefix;
	const names = users.map(u => `@${u.name}`).join(", ");
	const text = getLang("welcomeMsg", threadName, systemPrefix, groupPrefix, names);

	const payload = { body: text, mentions: mentionAll(text, users) };
	try {
		const res = await axios.get(IMAGE_URL, { responseType: "stream", timeout: 3000 });
		payload.attachment = res.data;
		await api.sendMessage(payload, threadID);
	}
	catch (e) {
		await api.sendMessage(payload, threadID);
	}
}

module.exports = {
	config: {
		name: "welcome",
		version: "7.0.0",
		author: "0xMr_King x ┃ Tanin Islam",
		category: "events"
	},

	langs: {
		en: {
			welcomeMsg:
				"🌸 𝖂𝖊𝖑𝖈𝖔𝖒𝖊 𝖙𝖔 𝖙𝖍𝖊 𝕲𝖗𝖔𝖚𝖕 🦢\n\n" +
				"✨ 𝖌𝖗𝖔𝖚𝖕 𝗻𝗮𝗺𝗲 : %1\n" +
				"📌 𝘀𝘆𝘀𝘁𝗲𝗺 𝗽𝗿𝗲𝗳𝗶𝘅 : %2\n" +
				"🔗 𝗴𝗿𝗼𝘂𝗽 𝗽𝗿𝗲𝗳𝗶𝘅 : %3\n\n" +
				"👋 𝖍𝖊𝖑𝖑𝖔 %4, welcome to the family! Enjoy your time here. 🎉\n\n" +
				"╭───────────────⬣\n" +
				"│ Made by 0xMr_King x ┃ Tanin Islam\n" +
				"╰───────────────⬣"
		}
	},

	onStart: async function (ctx) {
		const { api, usersData, event } = ctx;
		if (!event || event.logMessageType !== "log:subscribe") return;

		const threadID = event.threadID;
		const added = (event.logMessageData && event.logMessageData.addedParticipants) || [];
		const botID = String(api.getCurrentUserID());

		const fresh = [];
		for (const participant of added) {
			const id = String(participant.userFbId || "");
			if (!id || id === botID) continue;
			const name = participant.fullName || await usersData.getName(id) || "User";
			fresh.push({ id, name });
		}
		if (!fresh.length) return;

		let bucket = pending.get(threadID);
		if (!bucket) {
			bucket = { users: new Map(), timer: null };
			pending.set(threadID, bucket);
			bucket.timer = setTimeout(() => flush(ctx, threadID), COOLDOWN_MS);
		}
		for (const user of fresh) bucket.users.set(user.id, user);
	}
};
