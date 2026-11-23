const fs = require("fs-extra");
const path = require("path");

const AUTHOR = "0xMr_King x ┃ Tanin Islam";

function languageExists(code) {
	if (!code || !/^[a-z]{2}(?:_[a-z]{2})?$/i.test(code)) return false;
	const root = process.cwd();
	return fs.existsSync(path.join(root, "languages", `${code}.lang`)) ||
		fs.existsSync(path.join(root, "languages", "cmds", `${code}.js`));
}

module.exports = {
	config: {
		name: "setlang",
		version: "2.0.0",
		author: AUTHOR,
		countDown: 5,
		role: 0,
		category: "config",
		shortDescription: "Set bot language globally or for this group",
		guide: {
			en: "{pn} en              set language for this group\n" +
				"{pn} default          use the global language again\n" +
				"{pn} en -g            set global language (bot admin only)"
		}
	},

	onStart: async function ({ message, event, args, threadsData, role, prefix }) {
		const raw = String(args[0] || "").toLowerCase();
		if (!raw || raw === "help") {
			return message.reply(
				`Language control by ${AUTHOR}\n` +
				`Usage:\n${prefix}setlang <code>\n${prefix}setlang default\n${prefix}setlang <code> -g`
			);
		}

		const globalMode = ["-g", "-global", "all"].includes(String(args[1] || "").toLowerCase());
		const code = ["default", "reset"].includes(raw) ? null : raw;

		if (globalMode) {
			if (Number(role || 0) < 2)
				return message.reply("Only bot admins can change the global language.");
			if (code && !languageExists(code))
				return message.reply(`Language "${code}" is not installed.`);
			global.GoatBot.config.language = code || "en";
			try {
				fs.writeFileSync(global.client.dirConfig, JSON.stringify(global.GoatBot.config, null, 2) + "\n", "utf8");
			}
			catch (err) {
				return message.reply(`Could not save config.json: ${err.message}`);
			}
			return message.reply(`Global language set to ${global.GoatBot.config.language}. A restart is recommended.`);
		}

		if (code && !languageExists(code))
			return message.reply(`Language "${code}" is not installed.`);
		await threadsData.set(event.threadID, code, "data.lang");
		return message.reply(code ? `Language for this group set to ${code}.` : "This group now follows the global language.");
	}
};
