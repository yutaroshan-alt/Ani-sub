/**
 * COMMAND: account — single-account info (account.txt only)
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ACCOUNT_FILE = path.join(__dirname, "..", "..", "account.txt");

module.exports = {
	config: {
		name: "account",
		aliases: ["acc", "accounts"],
		version: require("../../package.json").version,
		author: "0xMr_King x ┃ Tanin Islam",
		countDown: 3,
		role: 2,
		description: "Show the single bot account loaded from account.txt",
		category: "owner",
		guide: "{pn} account"
	},

	onStart: async function ({ message }) {
		let detail = "not found";
		try {
			if (fs.existsSync(ACCOUNT_FILE)) {
				const raw = fs.readFileSync(ACCOUNT_FILE, "utf8").trim();
				detail = raw ? `${raw.length} chars loaded from account.txt` : "account.txt is empty";
			}
		}
		catch (e) { detail = `read error: ${e.message}`; }

		return message.reply(
			"SINGLE ACCOUNT MODE\n" +
			"====================\n" +
			`Source : account.txt\n` +
			`State  : ${detail}\n` +
			`Bot UID: ${global.botID || "unknown"}\n` +
			"====================\n" +
			"Change the cookie in account.txt, then restart the bot."
		);
	}
};
