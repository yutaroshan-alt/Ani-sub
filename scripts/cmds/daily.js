"use strict";

const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");
const moment = require("moment-timezone");

const DAILY_REWARD = { coin: 5000, exp: 300 };
const DAY_KEY_FORMAT = "DD/MM/YYYY";
const BACKGROUND_URL = "https://i.imgur.com/Kg8iZK2.jpeg";

const BOLD_MAP = (() => {
	const map = {};
	const plain = Array.from("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789");
	const glyphs = Array.from("𝐀𝐁𝐂𝐃𝐄𝐅𝐆𝐇𝐈𝐉𝐊𝐋𝐌𝐍𝐎𝐏𝐐𝐑𝐒𝐓𝐔𝐕𝐖𝐗𝐘𝐙𝐚𝐛𝐜𝐝𝐞𝐟𝐠𝐡𝐢𝐣𝐤𝐥𝐦𝐧𝐨𝐩𝐪𝐫𝐬𝐭𝐮𝐯𝐰𝐱𝐲𝐳𝟎𝟏𝟐𝟑𝟒𝟓𝟔𝟕𝟖𝟗");
	for (let i = 0; i < plain.length; i++) map[plain[i]] = glyphs[i];
	return map;
})();

function bold(text) {
	return Array.from(String(text == null ? "" : text)).map(c => BOLD_MAP[c] || c).join("");
}

const TASKS = [
	{ key: "slot", title: "Play Slot", detail: "Play slot 30 times", target: 30, reward: 1000000, match: n => n === "slot" },
	{ key: "dice", title: "Play Dice", detail: "Play dice 30 times", target: 30, reward: 1000000, match: n => n === "dice" || n === "roll" },
	{ key: "msg1", title: "Give 1 Msg", detail: "Give 1 msg", target: 1, reward: 10000, message: true },
	{ key: "msg200", title: "Msg 200 Times", detail: "Msg 200 times", target: 200, reward: 2000000, message: true },
	{ key: "wifuvid", title: "Use Wifuvid", detail: "Use wifuvid 10 times", target: 10, reward: 1000000, match: n => n === "wifuvid" },
	{ key: "pair", title: "Use Pair Cmds", detail: "Use any pair command", target: 1, reward: 1000000, match: n => /^pair/.test(n) },
	{ key: "word", title: "Play Word Game", detail: "Play word game", target: 1, reward: 50000, match: n => ["word", "wordgame", "wordle", "unscramble"].includes(n) }
];

const TASK_CAPTION = bold("Here is your dsily task bby");

function dayKey() {
	return moment.tz("Asia/Dhaka").format(DAY_KEY_FORMAT);
}

function safePrefix(prefix) {
	return String(prefix || (global.GoatBot && global.GoatBot.config && global.GoatBot.config.prefix) || "(");
}

function moneyText(n) {
	if (n >= 1e6) return (n / 1e6).toFixed(n % 1e6 ? 1 : 0) + "m";
	if (n >= 1e3) return (n / 1e3).toFixed(n % 1e3 ? 1 : 0) + "k";
	return String(n);
}

function ensureState(user) {
	if (!user.data || typeof user.data !== "object") user.data = {};
	const key = dayKey();
	let s = user.data.daily;
	if (!s || s.day !== key) s = { day: key, progress: {}, claimed: {} };
	if (!s.progress || typeof s.progress !== "object") s.progress = {};
	if (!s.claimed || typeof s.claimed !== "object") s.claimed = {};
	user.data.daily = s;
	return s;
}

const writeLocks = new Map();
function withLock(id, worker) {
	const prev = writeLocks.get(id) || Promise.resolve();
	const next = prev.catch(() => {}).then(worker);
	writeLocks.set(id, next);
	next.then(() => { if (writeLocks.get(id) === next) writeLocks.delete(id); }).catch(() => {});
	return next;
}

let usersDataRef = null;
function store() {
	if (global.dailyUsersData && typeof global.dailyUsersData.get === "function") return global.dailyUsersData;
	if (global.db && global.db.usersData && typeof global.db.usersData.get === "function") return global.db.usersData;
	return usersDataRef;
}

function bump(userID, keys) {
	const usersData = store();
	if (!usersData || typeof usersData.get !== "function" || !keys.length) return;
	withLock(String(userID), async () => {
		const user = await usersData.get(userID);
		if (!user) return;
		const state = ensureState(user);
		let changed = false;
		for (const t of TASKS) {
			if (!keys.includes(t.key)) continue;
			const current = Number(state.progress[t.key] || 0);
			if (current >= t.target) continue;
			state.progress[t.key] = current + 1;
			changed = true;
		}
		if (changed) await usersData.set(userID, { data: user.data });
	}).catch(() => {});
}

if (!global.__aliyaDailyTaskTracker) {
	global.__aliyaDailyTaskTracker = true;
	global.dailyTaskTracker = function (userID, commandName) {
		try {
			const name = String(commandName || "").toLowerCase();
			if (!name) return;
			const keys = TASKS.filter(t => typeof t.match === "function" && t.match(name)).map(t => t.key);
			if (keys.length) bump(userID, keys);
		} catch (e) { }
	};
	global.dailyMessageTracker = function (userID) {
		try { bump(userID, TASKS.filter(t => t.message).map(t => t.key)); }
		catch (e) { }
	};
}

async function fetchBuffer(url, timeout) {
	const r = await axios.get(url, { responseType: "arraybuffer", timeout: timeout || 12000 });
	return Buffer.from(r.data);
}

function rr(ctx, x, y, w, h, r) {
	r = Math.min(r, w / 2, h / 2);
	ctx.beginPath();
	ctx.moveTo(x + r, y);
	ctx.arcTo(x + w, y, x + w, y + h, r);
	ctx.arcTo(x + w, y + h, x, y + h, r);
	ctx.arcTo(x, y + h, x, y, r);
	ctx.arcTo(x, y, x + w, y, r);
	ctx.closePath();
}

function shortName(name, max) {
	const s = String(name || "Facebook User");
	return s.length > max ? s.slice(0, max - 1) + "..." : s;
}

function statusOf(task, state) {
	const done = Number(state.progress[task.key] || 0);
	if (state.claimed[task.key]) return { label: "CLAIMED", color: "#7dffb2" };
	if (done >= task.target) return { label: "READY", color: "#ffe27a" };
	return { label: "IN PROGRESS", color: "#8fd0ff" };
}

async function imageCard(name, uid, tasks, state, prefix) {
	let canvasLib;
	try { canvasLib = require("canvas"); }
	catch (e) { return null; }
	const { createCanvas, loadImage } = canvasLib;
	const W = 900;
	const topH = 190;
	const rowH = 96;
	const H = topH + tasks.length * rowH + 66;
	const canvas = createCanvas(W, H);
	const ctx = canvas.getContext("2d");

	let bg = null;
	try { bg = await loadImage(await fetchBuffer(BACKGROUND_URL, 12000)); }
	catch (e) { bg = null; }
	if (bg) {
		const s = Math.max(W / bg.width, H / bg.height);
		const dw = bg.width * s;
		const dh = bg.height * s;
		ctx.drawImage(bg, (W - dw) / 2, (H - dh) / 2, dw, dh);
	} else {
		const grad = ctx.createLinearGradient(0, 0, W, H);
		grad.addColorStop(0, "#0b1d3a");
		grad.addColorStop(1, "#0a6bd1");
		ctx.fillStyle = grad;
		ctx.fillRect(0, 0, W, H);
	}
	ctx.fillStyle = "rgba(5,14,34,0.68)";
	ctx.fillRect(0, 0, W, H);

	const avatar = null;

	ctx.save();
	ctx.beginPath();
	ctx.arc(78, 82, 52, 0, Math.PI * 2);
	ctx.closePath();
	ctx.clip();
	if (avatar) {
		const s = Math.min(avatar.width, avatar.height);
		ctx.drawImage(avatar, (avatar.width - s) / 2, (avatar.height - s) / 2, s, s, 26, 30, 104, 104);
	} else {
		ctx.fillStyle = "#1b3b63";
		ctx.fillRect(26, 30, 104, 104);
		ctx.fillStyle = "#d6e8ff";
		ctx.font = "bold 46px Arial";
		ctx.textAlign = "center";
		ctx.fillText(String(name || "?").charAt(0).toUpperCase(), 78, 96);
	}
	ctx.restore();

	ctx.textAlign = "left";
	ctx.fillStyle = "#ffffff";
	ctx.font = "bold 36px Arial";
	ctx.fillText(shortName(name, 26), 150, 72);
	ctx.fillStyle = "#ffd86b";
	ctx.font = "bold 22px Arial";
	ctx.fillText("ALIYA V4 DAILY TASKS", 150, 106);
	ctx.fillStyle = "rgba(220,238,255,0.75)";
	ctx.font = "18px Arial";
	ctx.fillText(String(uid), 150, 136);

	ctx.strokeStyle = "rgba(170,215,255,0.4)";
	ctx.lineWidth = 2;
	ctx.beginPath();
	ctx.moveTo(40, 162);
	ctx.lineTo(W - 40, 162);
	ctx.stroke();

	let y = topH;
	tasks.forEach((t, i) => {
		const done = Math.min(Number(state.progress[t.key] || 0), t.target);
		const st = statusOf(t, state);
		ctx.fillStyle = "rgba(3,16,40,0.62)";
		rr(ctx, 40, y + 6, W - 80, rowH - 14, 16);
		ctx.fill();
		ctx.fillStyle = st.color;
		ctx.fillRect(40, y + 18, 6, rowH - 38);

		ctx.textAlign = "left";
		ctx.fillStyle = "#ffffff";
		ctx.font = "bold 25px Arial";
		ctx.fillText(`${i + 1}. ${t.title}`, 66, y + 36);
		ctx.fillStyle = "rgba(220,238,255,0.82)";
		ctx.font = "18px Arial";
		ctx.fillText(t.detail, 66, y + 60);

		ctx.textAlign = "right";
		ctx.fillStyle = "#ffd86b";
		ctx.font = "bold 21px Arial";
		ctx.fillText(`+${moneyText(t.reward)}`, W - 66, y + 36);
		ctx.fillStyle = st.color;
		ctx.font = "18px Arial";
		ctx.fillText(`${done}/${t.target}  ${st.label}`, W - 66, y + 60);

		const bx = 66;
		const by = y + 70;
		const bw = W - 132;
		const bh = 9;
		ctx.fillStyle = "rgba(255,255,255,0.16)";
		rr(ctx, bx, by, bw, bh, 5);
		ctx.fill();
		if (done > 0) {
			ctx.fillStyle = st.color;
			rr(ctx, bx, by, Math.max(10, bw * done / t.target), bh, 5);
			ctx.fill();
		}
		y += rowH;
	});

	ctx.textAlign = "center";
	ctx.fillStyle = "rgba(220,238,255,0.8)";
	ctx.font = "17px Arial";
	ctx.fillText(`Rewards reset daily. Claim with ${prefix}daily claim all`, W / 2, H - 26);
	return canvas.toBuffer("image/png");
}

module.exports = {
	config: {
		name: "daily",
		aliases: ["dailyreward", "dly"],
		version: "4.0.0",
		author: "0xMr_King x ┃ Tanin Islam",
		countDown: 5,
		role: 0,
		description: { en: "Daily reward and daily task card" },
		category: "game",
		guide: { en: "{pn} | {pn} task | {pn} claim all | {pn} claim <1-7>" }
	},

	onStart: async function ({ api, event, args, message, usersData, prefix }) {
		const { senderID, messageID, threadID, messageReply, mentions } = event;
		const p = safePrefix(prefix);
		const sub = String(args[0] || "").toLowerCase();
		if (usersData && typeof usersData.get === "function") usersDataRef = usersData;

		const reply = body => (message && typeof message.reply === "function")
			? message.reply(body)
			: api.sendMessage(body, threadID, messageID);

		try {
			const date = dayKey();
			const user = await usersData.get(senderID) || {};
			const state = ensureState(user);
			await usersData.set(senderID, { data: user.data });

			if (!sub || sub === "info") {
				if (sub === "info")
					return reply(
						bold("DAILY INFO") + "\n" +
						bold("Reward") + `: ${DAILY_REWARD.coin} coin, ${DAILY_REWARD.exp} exp once per day\n` +
						bold("Tasks") + ": 7 fixed tasks, reset every day\n" +
						bold("View") + `: ${p}daily task\n` +
						bold("Claim") + `: ${p}daily claim all | ${p}daily claim 1`
					);

				if (state.lastDaily === date)
					return reply(bold("ALREADY RECEIVED") + "\nYou already claimed today's " + DAILY_REWARD.coin + " coin and " + DAILY_REWARD.exp + " exp.\nCome back tomorrow.");

				state.lastDaily = date;
				await usersData.set(senderID, {
					money: (user.money || 0) + DAILY_REWARD.coin,
					exp: (user.exp || 0) + DAILY_REWARD.exp,
					data: user.data
				});

				return reply(
					bold("DAILY REWARD CLAIMED") + "\n" +
					bold("User") + ": " + (user.name || "Facebook User") + "\n" +
					bold("Coin") + ": +" + DAILY_REWARD.coin + "\n" +
					bold("Exp") + ": +" + DAILY_REWARD.exp + "\n" +
					bold("Made with") + " 🤍 " + bold("by") + " 0xMr_King x ┃ Tanin Islam"
				);
			}

			if (sub === "task" || sub === "tasks") {
				let targetID = senderID;
				if (mentions && Object.keys(mentions).length) targetID = Object.keys(mentions)[0];
				else if (args[1] && /^\d{5,}$/.test(args[1])) targetID = args[1];
				else if (messageReply && messageReply.senderID) {
					const idInReply = String(messageReply.body || "").trim().match(/^\d{5,}$/);
					targetID = idInReply ? idInReply[0] : String(messageReply.senderID);
				}

				let target = user;
				let targetState = state;
				let name = user.name || "Facebook User";
				if (String(targetID) !== String(senderID)) {
					target = await usersData.get(targetID) || {};
					targetState = ensureState(target);
					name = (mentions && mentions[targetID]) || target.name || "Facebook User";
				}

				let buffer = null;
				try { buffer = await imageCard(name, targetID, TASKS, targetState, p); }
				catch (e) { buffer = null; }

				if (buffer) {
					const cacheDir = path.join(__dirname, "cache");
					await fs.ensureDir(cacheDir);
					const file = path.join(cacheDir, `daily_task_${Date.now()}.png`);
					await fs.writeFile(file, buffer);
					const payload = { body: TASK_CAPTION, attachment: fs.createReadStream(file) };
					return (message && typeof message.reply === "function")
						? message.reply(payload)
						: api.sendMessage(payload, threadID, messageID);
				}
				return reply(TASK_CAPTION);
			}

			if (sub === "claim") {
				const which = String(args[1] || "all").toLowerCase();
				let chosen;
				if (which === "all") chosen = TASKS;
				else {
					const n = Number(which);
					if (!Number.isInteger(n) || n < 1 || n > TASKS.length)
						return reply(bold("INVALID TASK") + `\nUse ${p}daily claim all or ${p}daily claim 1 to ${TASKS.length}.`);
					chosen = [TASKS[n - 1]];
				}

				const doneNames = [];
				let coin = 0;
				for (const t of chosen) {
					const progress = Number(state.progress[t.key] || 0);
					if (progress < t.target || state.claimed[t.key]) continue;
					state.claimed[t.key] = true;
					coin += t.reward;
					doneNames.push(t);
				}

				if (!doneNames.length)
					return reply(bold("NOTHING TO CLAIM") + "\nFinish the task first, or it was already claimed.");

				await usersData.set(senderID, {
					money: (user.money || 0) + coin,
					data: user.data
				});

				let out = bold("TASK REWARD CLAIMED") + "\n";
				for (const t of doneNames) out += `  ${t.title} -> +${moneyText(t.reward)}\n`;
				out += bold("Total") + `: +${moneyText(coin)}\n`;
				out += bold("Made with") + " 🤍 " + bold("by") + " 0xMr_King x ┃ Tanin Islam";
				return reply(out);
			}

			return reply(bold("DAILY COMMANDS") + "\n" +
				`${p}daily - claim ${DAILY_REWARD.coin} coin and ${DAILY_REWARD.exp} exp\n` +
				`${p}daily task - view your 7 daily tasks\n` +
				`${p}daily claim all - claim all finished tasks\n` +
				`${p}daily claim 1 - claim task 1`);
		} catch (err) {
			console.error("[daily]", err);
			try { api.setMessageReaction("❌", messageID, () => {}, true); }
			catch (e) { }
			return reply(bold("DAILY ERROR") + "\n" + (err.message || err));
		}
	}
};
