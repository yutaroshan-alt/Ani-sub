/**
 * notification - short owner broadcast to every joined group.
 * Works like (all: sends only the given text + optional replied media,
 * tags members using the text characters so no extra text is added.
 */
"use strict";

const axios = require("axios");
const fs = require("fs-extra");
const os = require("os");
const path = require("path");

const AUTHOR = "0xMr_King x ┃ Tanin Islam";
const MEDIA_TYPES = /^(image|video|audio)\//i;

function callApi(fn, args, timeoutMs = 8000) {
	return new Promise(resolve => {
		let done = false;
		let timer = null;
		const finish = (err, data) => {
			if (done) return;
			done = true;
			if (timer) clearTimeout(timer);
			resolve({ err: err || null, data: data === undefined ? null : data });
		};

		let returned;
		try { returned = fn(...args, (err, data) => finish(err, data)); }
		catch (e) { return finish(e, null); }

		if (returned && typeof returned.then === "function")
			returned.then(data => finish(null, data)).catch(e => finish(e, null));

		timer = setTimeout(() => finish(null, null), timeoutMs);
	});
}

// all.js style: tag members using characters already present in the text.
function buildMentions(body, ids, max = 50) {
	const chars = Array.from(body);
	const mentions = [];
	const total = Math.min(chars.length, ids.length, max);
	for (let i = 0; i < total; i++) {
		mentions.push({ tag: chars[i], id: String(ids[i]), fromIndex: i });
	}
	return mentions;
}

function mediaExtension(attachment) {
	const mime = String(attachment.mimeType || "");
	const known = {
		"image/jpeg": ".jpg", "image/jpg": ".jpg", "image/png": ".png",
		"image/gif": ".gif", "image/webp": ".webp",
		"video/mp4": ".mp4", "video/webm": ".webm", "video/quicktime": ".mov",
		"audio/mpeg": ".mp3", "audio/mp3": ".mp3", "audio/mp4": ".m4a",
		"audio/ogg": ".ogg", "audio/wav": ".wav"
	};
	if (known[mime]) return known[mime];
	try {
		const match = new URL(attachment.url).pathname.match(/\.[a-z0-9]+$/i);
		if (match) return match[0].toLowerCase();
	}
	catch (e) { /* not a parseable URL */ }
	return ".bin";
}

async function downloadMedia(attachment, tempFiles) {
	const file = path.join(
		os.tmpdir(),
		`aliya_noti_${process.pid}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${mediaExtension(attachment)}`
	);
	const response = await axios.get(attachment.url, {
		responseType: "arraybuffer",
		timeout: 60000,
		maxContentLength: 60 * 1024 * 1024,
		headers: { "User-Agent": "Mozilla/5.0 (compatible; Aliya-Notification/4.0)" }
	});
	await fs.promises.writeFile(file, Buffer.from(response.data));
	tempFiles.push(file);
	return file;
}

function streamOf(file) {
	const stream = fs.createReadStream(file);
	stream.on("error", () => {});
	return stream;
}

module.exports = {
	config: {
		name: "notification",
		aliases: ["notice", "noti", "announce"],
		version: "4.1.0",
		author: AUTHOR,
		countDown: 5,
		role: 2,
		shortDescription: {
			en: "Short notice to every joined group (text / replied media)"
		},
		category: "owner",
		guide: {
			en: "   {pn} notification Hello fellas\n" +
				"   {pn} noti \"Hello fellas\" (reply to an image, mp3 or video to forward it too)"
		}
	},

	onStart: async function ({ api, event, args, threadsData, message }) {
		const { messageID } = event;
		const reply = text => (message && typeof message.reply === "function")
			? message.reply(text)
			: api.sendMessage(text, event.threadID, messageID);

		const replied = event.type === "message_reply" ? (event.messageReply || {}) : {};
		const attachments = (replied.attachments || []).filter(a => a && a.url && MEDIA_TYPES.test(String(a.mimeType || a.type || "")));

		let noticeMsg = args.join(" ").trim().replace(/^["'“”‘’]+|["'“”‘’]+$/g, "").trim();
		if (!noticeMsg) noticeMsg = String(replied.body || "").trim();
		if (!noticeMsg && !attachments.length) {
			return reply("Message dao: (noti tao message\nBa image/mp3/video-te reply kore (noti likho.");
		}

		try { api.setMessageReaction("📢", messageID, () => {}, true); }
		catch (e) { /* reaction is optional */ }

		const tempFiles = [];
		try {
			for (const attachment of attachments) await downloadMedia(attachment, tempFiles);

			const allThreads = await threadsData.getAll();
			const candidates = allThreads.filter(t =>
				t && t.isGroup !== false && String(t.threadID || "").length > 8
			);

			if (!candidates.length)
				return reply("Kono group record nei.");

			const botID = String(api.getCurrentUserID());
			let successCount = 0, skippedCount = 0, failCount = 0;

			for (const thread of candidates) {
				const tid = thread.threadID;

				const info = await callApi(api.getThreadInfo.bind(api), [tid], 8000);
				const participants = info.data && info.data.participantIDs;
				if (info.err || !Array.isArray(participants) || !participants.some(id => String(id) === botID)) {
					skippedCount++;
					continue;
				}

				const members = participants.map(String).filter(id => id !== botID);
				const payload = {
					body: noticeMsg,
					mentions: buildMentions(noticeMsg, members)
				};
				if (tempFiles.length) {
					const streams = tempFiles.map(streamOf);
					payload.attachment = streams.length === 1 ? streams[0] : streams;
				}

				const sent = await callApi(api.sendMessage.bind(api), [payload, tid], 30000);
				if (sent.err) failCount++;
				else successCount++;

				await new Promise(resolve => setTimeout(resolve, 1200));
			}

			try { api.setMessageReaction("✅", messageID, () => {}, true); }
			catch (e) { /* ignore */ }

			return reply(`✅ Sent ${successCount} | Skip ${skippedCount} | Fail ${failCount}`);
		}
		catch (error) {
			try { api.setMessageReaction("❌", messageID, () => {}, true); }
			catch (e) { /* ignore */ }
			return reply("⚠️ " + (error.message || error));
		}
		finally {
			await Promise.all(tempFiles.map(file => fs.promises.unlink(file).catch(() => {})));
		}
	}
};
