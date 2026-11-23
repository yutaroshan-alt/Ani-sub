"use strict";

const fs = require("fs");
const path = require("path");

function config() {
	const g = global.GoatBot || (global.GoatBot = {});
	g.config = g.config || {};
	g.config.typingIndicator = g.config.typingIndicator || {};
	return g.config.typingIndicator;
}

function isEnabled() {
	const c = config();
	return c.enable !== false && c.enabled !== false;
}

function persist(enabled) {
	try {
		const file = path.join(process.cwd(), "config.json");
		const data = JSON.parse(fs.readFileSync(file, "utf8"));
		data.typingIndicator = data.typingIndicator || {};
		data.typingIndicator.enable = enabled;
		fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n", "utf8");
		return true;
	} catch (e) { return false; }
}

function stopNow() {
	try {
		const lib = require("../../bot/handler/typingIndicator.js");
		if (lib && typeof lib.stopAll === "function") lib.stopAll();
	} catch (e) { }
}

module.exports = {
	config: {
		name: "typing",
		aliases: ["typingindicator", "typingstatus"],
		version: "1.0.0",
		author: "0xMr_King x ┃ Tanin Islam",
		countDown: 3,
		role: 3,
		category: "owner",
		shortDescription: "Turn the typing indicator on or off",
		guide: { en: "{pn} on | {pn} off | {pn} status" }
	},

	onStart: async function ({ args, message, event }) {
		const p = (global.utils && typeof global.utils.getPrefix === "function"
			? global.utils.getPrefix(event.threadID)
			: null) || (global.GoatBot && global.GoatBot.config && global.GoatBot.config.prefix) || "(";
		const sub = String(args[0] || "status").toLowerCase();

		if (["on", "enable", "1", "start"].includes(sub)) {
			const c = config();
			c.enable = true;
			c.enabled = true;
			const saved = persist(true);
			return message.reply(
				"Typing indicator is now ON." + (saved ? "" : "\nCould not save config.json; this lasts until restart.")
			);
		}

		if (["off", "disable", "0", "stop"].includes(sub)) {
			const c = config();
			c.enable = false;
			c.enabled = false;
			stopNow();
			const saved = persist(false);
			return message.reply(
				"Typing indicator is now OFF." + (saved ? "" : "\nCould not save config.json; this lasts until restart.")
			);
		}

		return message.reply(
			`Typing indicator is ${isEnabled() ? "ON" : "OFF"}.\n` +
			`Usage: ${p}typing on | ${p}typing off | ${p}typing status\n` +
			`Also available: ${p}shell typing on | ${p}shell typing off`
		);
	}
};
