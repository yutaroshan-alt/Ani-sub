"use strict";

const rolling = new Set();

function parseSmartAmount(str) {
	if (typeof str !== "string") return parseFloat(str);
	const units = { k: 1e3, m: 1e6, b: 1e9, t: 1e12 };
	const match = str.toLowerCase().match(/^(\d+(?:\.\d+)?)([kmbt]?)$/);
	if (!match) return parseFloat(str);
	return parseFloat(match[1]) * (units[match[2]] || 1);
}

function formatNumber(num) {
	if (num >= 1e12) return (num / 1e12).toFixed(2) + "T";
	if (num >= 1e9) return (num / 1e9).toFixed(2) + "B";
	if (num >= 1e6) return (num / 1e6).toFixed(2) + "M";
	if (num >= 1e3) return (num / 1e3).toFixed(2) + "K";
	return num.toLocaleString();
}

function rollDie() {
	return Math.floor(Math.random() * 6) + 1;
}

function rollDicePair(shouldWin, winSum) {
	let a;
	let b;
	do {
		a = rollDie();
		b = rollDie();
	} while ((a + b >= winSum) !== shouldWin);
	return [a, b];
}

function diceFace(n) {
	return ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"][n - 1];
}

module.exports = {
	config: {
		name: "dice",
		aliases: ["roll"],
		version: "1.1.0",
		author: "0xMr_King x ┃ Tanin Islam",
		countDown: 8,
		role: 0,
		shortDescription: { en: "Roll the dice and test your luck!" },
		category: "Game",
		guide: { en: "{pn} <amount>   (1K - 20M, supports k/m/b/t)" }
	},

	onStart: async function ({ args, message, event, usersData }) {
		const { senderID } = event;
		if (rolling.has(senderID))
			return message.reply("⏳ | 𝐁𝐚𝐛𝐲, 𝐰𝐚𝐢𝐭 𝐟𝐨𝐫 𝐲𝐨𝐮𝐫 𝐥𝐚𝐬𝐭 𝐫𝐨𝐥𝐥!");

		rolling.add(senderID);
		try {
			const MIN_BET = 1e3;
			const MAX_BET = 2e7;
			const WIN_RATE = 0.4;
			const PAYOUT = 2;
			const WIN_SUM = 8;

			const userData = await usersData.get(senderID);
			const money = userData.money || 0;
			const name = await usersData.getName(senderID);
			const betInput = args[0];
			if (!betInput) {
				return message.reply(
					">🎲 ( 𝐃𝐈𝐂𝐄 𝐆𝐀𝐌𝐄 )\n" +
					"━━━━━━━━━━━━━━━━━━\n" +
					"⚠️ | 𝐁𝐚𝐛𝐲, 𝐞𝐧𝐭𝐞𝐫 𝐚𝐧 𝐚𝐦𝐨𝐮𝐧𝐭! (𝐄𝐱: 𝟏𝐊 𝐨𝐫 𝟐𝟎𝐌)\n" +
					`🎯 | 𝐋𝐢𝐦𝐢𝐭: $${formatNumber(MIN_BET)} - $${formatNumber(MAX_BET)}\n` +
					"━━━━━━━━━━━━━━━━━━\n" +
					"🍀 | 𝐆𝐨𝐨𝐝 𝐥𝐮𝐜𝐤, 𝐛𝐚𝐛𝐲!"
				);
			}

			const betAmount = parseSmartAmount(betInput);
			if (!Number.isFinite(betAmount) || betAmount <= 0)
				return message.reply("⚠️ | 𝐁𝐚𝐛𝐲, 𝐞𝐧𝐭𝐞𝐫 𝐚 𝐯𝐚𝐥𝐢𝐝 𝐚𝐦𝐨𝐮𝐧𝐭!");
			if (betAmount < MIN_BET || betAmount > MAX_BET)
				return message.reply(`❌ | 𝐁𝐚𝐛𝐲, 𝐛𝐞𝐭 𝐥𝐢𝐦𝐢𝐭 𝐢𝐬 $${formatNumber(MIN_BET)} - $${formatNumber(MAX_BET)}!`);
			if (betAmount > money)
				return message.reply(`❌ | 𝐁𝐚𝐛𝐲, 𝐲𝐨𝐮 𝐨𝐧𝐥𝐲 𝐡𝐚𝐯𝐞 $${formatNumber(money)}!`);

			const quota = global.utils.playQuotaStatus(userData.diceLimit);
			if (!quota.allowed) {
				const wait = global.utils.formatDuration(Math.ceil((quota.resetAt - Date.now()) / 1000));
				return message.reply(`>🎲 ( 𝐋𝐢𝐦𝐢𝐭 𝐑𝐞𝐚𝐜𝐡𝐞𝐝 )\n━━━━━━━━━━━━━━━━━━\n🚫 | 𝐁𝐚𝐛𝐲, 𝐲𝐨𝐮 𝐡𝐚𝐯𝐞 𝐟𝐢𝐧𝐢𝐬𝐡𝐞𝐝 𝐲𝐨𝐮𝐫 𝟒𝟎 𝐫𝐨𝐥𝐥𝐬!\n⏳ | 𝐂𝐨𝐦𝐞 𝐛𝐚𝐜𝐤 𝐚𝐟𝐭𝐞𝐫 ${wait}.`);
			}

			const isWin = Math.random() < WIN_RATE;
			const [d1, d2] = rollDicePair(isWin, WIN_SUM);
			const sum = d1 + d2;
			const balanceChange = isWin ? betAmount * (PAYOUT - 1) : -betAmount;
			await usersData.set(senderID, { money: money + balanceChange, diceLimit: quota.nextQuota });

			const header = `>🎲 (  ${name} )\n━━━━━━━━━━━━━━━━━━\n`;
			const footer = `\n━━━━━━━━━━━━━━━━━━\n🎲 | 𝐑𝐨𝐥𝐥𝐬: ${quota.nextQuota.count}/𝟒𝟎\n• 𝐄𝐧𝐣𝐨𝐲 𝐛𝐛𝐲🐉 🍀`;
			const diceLine = `🎲 | [ ${diceFace(d1)} | ${diceFace(d2)} ] = ${sum}\n`;

			if (isWin) {
				return message.reply(
					`${header}🏆 | 𝐘𝐎𝐔 𝐖𝐎𝐍! 🎉\n` +
					diceLine +
					`💰 | 𝐏𝐚𝐲𝐨𝐮𝐭: $${formatNumber(betAmount * PAYOUT)} (${PAYOUT}x)\n` +
					`🪙 | 𝐁𝐚𝐥𝐚𝐧𝐜𝐞: $${formatNumber(money + balanceChange)}${footer}`
				);
			}

			return message.reply(
				`${header}💀 | 𝐘𝐎𝐔 𝐋𝐎𝐒𝐓! 😢\n` +
				diceLine +
				`💸 | 𝐋𝐨𝐬𝐭: $${formatNumber(betAmount)}\n` +
				`🪙 | 𝐁𝐚𝐥𝐚𝐧𝐜𝐞: $${formatNumber(money + balanceChange)}${footer}`
			);
		} finally {
			rolling.delete(senderID);
		}
	}
};
