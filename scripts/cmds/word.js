"use strict";

const WORDS = [
	"aliya", "king", "messenger", "reward", "daily", "slot", "dice", "magic",
	"queen", "prince", "friend", "happy", "smile", "sweet", "baby", "romance",
	"flower", "nature", "school", "college", "music", "dance", "movie", "anime",
	"memory", "future", "dream", "light", "night", "river", "forest", "sunset",
	"coffee", "pizza", "chocolate", "garden", "winter", "summer", "spring",
	"autumn", "planet", "rocket", "castle", "dragon", "tiger", "eagle", "ocean",
	"island", "desert", "thunder", "silver", "golden", "crystal", "puzzle",
	"victory", "journey", "secret", "silence", "wonder", "bright", "shadow"
];

function scramble(word) {
	const a = word.split("");
	for (let i = a.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		const tmp = a[i];
		a[i] = a[j];
		a[j] = tmp;
	}
	if (a.join("") === word && a.length > 1) {
		const tmp = a[0];
		a[0] = a[1];
		a[1] = tmp;
	}
	return a.join("");
}

function parseSmartAmount(str) {
	if (typeof str !== "string") return parseFloat(str);
	const units = { k: 1e3, m: 1e6 };
	const match = str.toLowerCase().match(/^(\d+(?:\.\d+)?)([km]?)$/);
	if (!match) return parseFloat(str);
	return parseFloat(match[1]) * (units[match[2]] || 1);
}

function formatNumber(num) {
	if (num >= 1e6) return (num / 1e6).toFixed(2) + "M";
	if (num >= 1e3) return (num / 1e3).toFixed(2) + "K";
	return num.toLocaleString();
}

module.exports = {
	config: {
		name: "word",
		aliases: ["wordgame", "wordle", "unscramble"],
		version: "1.0.0",
		author: "0xMr_King x ┃ Tanin Islam",
		countDown: 5,
		role: 0,
		shortDescription: { en: "Unscramble the word and win" },
		category: "Game",
		guide: { en: "{pn} [bet] - reply with the correct word (bet 1K - 1M, optional)" }
	},

	onStart: async function ({ args, message, event, usersData }) {
		const { senderID } = event;
		const word = WORDS[Math.floor(Math.random() * WORDS.length)];
		const scrambled = scramble(word);
		const raw = args[0];
		let bet = 0;

		if (raw) {
			bet = parseSmartAmount(raw);
			if (!Number.isFinite(bet) || bet < 1000)
				return message.reply("⚠️ | 𝐌𝐢𝐧𝐢𝐦𝐮𝐦 𝐛𝐞𝐭 𝐢𝐬 $𝟏𝐊.");
			if (bet > 1000000)
				return message.reply("❌ | 𝐌𝐚𝐱𝐢𝐦𝐮𝐦 𝐛𝐞𝐭 𝐢𝐬 $𝟏𝐌.");
			const user = await usersData.get(senderID);
			if ((user.money || 0) < bet)
				return message.reply(`❌ | 𝐁𝐚𝐛𝐲, 𝐲𝐨𝐮 𝐨𝐧𝐥𝐲 𝐡𝐚𝐯𝐞 $${formatNumber(user.money || 0)}.`);
			await usersData.set(senderID, { money: (user.money || 0) - bet });
		}

		const body =
			">🔤 ( 𝐖𝐎𝐑𝐃 𝐆𝐀𝐌𝐄 )\n" +
			"━━━━━━━━━━━━━━━━━━\n" +
			`🔀 | ${scrambled}\n` +
			"💡 | 𝐑𝐞𝐩𝐥𝐲 𝐰𝐢𝐭𝐡 𝐭𝐡𝐞 𝐜𝐨𝐫𝐫𝐞𝐜𝐭 𝐰𝐨𝐫𝐝.\n" +
			"⏰ | 𝟔𝟎 𝐬𝐞𝐜𝐨𝐧𝐝𝐬.\n" +
			(bet ? `💰 | 𝐁𝐞𝐭: $${formatNumber(bet)}\n` : "") +
			"━━━━━━━━━━━━━━━━━━";

		return message.reply(body, (err, info) => {
			if (err || !info || !info.messageID) return;
			if (!global.GoatBot || !global.GoatBot.onReply) return;
			global.GoatBot.onReply.set(info.messageID, {
				commandName: module.exports.config.name,
				messageID: info.messageID,
				author: senderID,
				word,
				bet,
				expires: Date.now() + 60000
			});
		});
	},

	onReply: async function ({ Reply, event, message, usersData }) {
		if (String(event.senderID) !== String(Reply.author)) return;
		if (global.GoatBot && global.GoatBot.onReply) global.GoatBot.onReply.delete(Reply.messageID);

		const guess = String(event.body || "").trim().toLowerCase();
		const answer = String(Reply.word || "").toLowerCase();
		if (Date.now() > (Reply.expires || 0))
			return message.reply(`⏰ | 𝐓𝐢𝐦𝐞 𝐢𝐬 𝐮𝐩. 𝐓𝐡𝐞 𝐰𝐨𝐫𝐝 𝐰𝐚𝐬: ${Reply.word}`);

		if (guess !== answer)
			return message.reply(`❌ | 𝐖𝐫𝐨𝐧𝐠 𝐚𝐧𝐬𝐰𝐞𝐫. 𝐓𝐡𝐞 𝐰𝐨𝐫𝐝 𝐰𝐚𝐬: ${Reply.word}`);

		if (Reply.bet > 0) {
			const user = await usersData.get(event.senderID);
			const win = Reply.bet * 2;
			const balance = (user.money || 0) + win;
			await usersData.set(event.senderID, { money: balance });
			return message.reply(
				"🏆 | 𝐂𝐎𝐑𝐑𝐄𝐂𝐓! 🎉\n" +
				`💰 | +$${formatNumber(win)}\n` +
				`🪙 | 𝐁𝐚𝐥𝐚𝐧𝐜𝐞: $${formatNumber(balance)}`
			);
		}

		return message.reply(`🏆 | 𝐂𝐎𝐑𝐑𝐄𝐂𝐓! 🎉\n🔤 | 𝐓𝐡𝐞 𝐰𝐨𝐫𝐝 𝐰𝐚𝐬 ${Reply.word}.`);
	}
};
