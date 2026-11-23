const fs = require("fs-extra");
const path = require("path");

function safeLanguageCode(code) {
	return String(code || "").trim().replace(/[^a-zA-Z0-9_-]/g, "") || "en";
}

function warnLanguage(message) {
	try {
		if (global.utils?.log?.warn) return global.utils.log.warn("LANGUAGE", message);
	}
	catch (err) { /* ignore */ }
	console.warn(`[LANGUAGE] ${message}`);
}

// Loads languages/cmds/<lang>.js or languages/events/<lang>.js. A missing or broken
// translation file must never stop a command: it falls back to en.js, then to the
// text embedded in the command file itself.
function loadCommandLanguage(langCode, folderOrPath, commandName) {
	let folder = String(folderOrPath || "").replace(/\\/g, "/").match(/\/languages\/(cmds|events)\//);
	folder = folder ? folder[1] : (folderOrPath === "events" ? "events" : "cmds");

	const baseDir = path.join(process.cwd(), "languages", folder);
	const code = safeLanguageCode(langCode);
	const candidates = [path.join(baseDir, `${code}.js`)];
	if (code !== "en") candidates.push(path.join(baseDir, "en.js"));

	for (const file of candidates) {
		if (!fs.existsSync(file)) continue;
		try {
			const loaded = require(file);
			const entry = loaded && loaded[commandName];
			if (entry && typeof entry === "object")
				return entry.text || {};
		}
		catch (err) {
			warnLanguage(`Could not load "${path.basename(file)}": ${err.message}`);
		}
	}
	return {};
}

function replaceShortcutInLang(text, prefix, commandName) {
	return String(text || "")
		.replace(/\{(?:p|prefix)\}/g, prefix)
		.replace(/\{(?:n|name)\}/g, commandName)
		.replace(/\{pn\}/g, `${prefix}${commandName}`);
}

function createGetText2(langCode, folderOrPath, prefix, command) {
	const commandName = command && command.config ? command.config.name : "";
	const hasCountDown = command && command.config && command.config.countDown !== undefined;
	const commandType = hasCountDown ? "command" : "command event";
	const customLang = loadCommandLanguage(langCode, folderOrPath, commandName);
	const inlineLangs = (command && command.langs) || {};
	const code = safeLanguageCode(langCode);

	return function (key, ...args) {
		let lang = inlineLangs[code]?.[key]
			|| inlineLangs[langCode]?.[key]
			|| customLang[key]
			|| inlineLangs.en?.[key]
			|| "";
		lang = replaceShortcutInLang(lang, prefix, commandName);
		lang = lang.replace(/%(\d+)/g, (match, n) => {
			const value = args[Number(n) - 1];
			return value === undefined ? match : String(value);
		});
		return lang || `❌ Can't find text on language "${code}" for ${commandType} "${commandName}" with key "${key}"`;
	};
}

module.exports = {
	createGetText2,
	loadCommandLanguage,
	replaceShortcutInLang,
	safeLanguageCode
};
