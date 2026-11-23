const axios = require("axios");
const { execSync } = require("child_process");
const fs = require("fs-extra");
const path = require("path");
const cheerio = require("cheerio");
const { builtinModules } = require("module");

const { log } = global.utils;

function configStore() {
	return global.GoatBot.configCommands || {};
}

function configCommandsPath() {
	return global.client?.dirConfigCommands || path.join(process.cwd(), "configCommands.json");
}

// Atomic write: the config watcher must never read a half-written JSON file.
function writeConfigStore(store) {
	const target = configCommandsPath();
	const tmp = `${target}.tmp-${process.pid}`;
	fs.writeFileSync(tmp, JSON.stringify(store, null, 2), "utf8");
	fs.renameSync(tmp, target);
}

function safeFileName(name) {
	let clean = path.basename(String(name || "").trim());
	if (!clean) clean = "command.js";
	if (!clean.endsWith(".js")) clean += ".js";
	return clean;
}

function getDomain(url) {
	const regex = /^(?:https?:\/\/)?(?:[^@\n]+@)?(?:www\.)?([^:/\n]+)/im;
	const match = url.match(regex);
	return match ? match[1] : null;
}

function isURL(str) {
	try {
		new URL(str);
		return true;
	} catch (e) {
		return false;
	}
}

function isBuiltinOrInstalled(name) {
	const pkg = String(name || "");
	if (!pkg) return true;
	if (pkg.startsWith("node:") || builtinModules.includes(pkg) || builtinModules.includes(pkg.replace(/^node:/, ""))) return true;
	try {
		require.resolve(pkg, { paths: [process.cwd()] });
		return true;
	}
	catch (e) { /* not resolvable yet */ }
	try {
		require.resolve(path.join(process.cwd(), "node_modules", pkg));
		return true;
	}
	catch (e) { return false; }
}

function installMissingPackages(contentFile, fileName) {
	const regExpCheckPackage = /require\s*\(\s*[`'"]([^`'"]+)[`'"\s]*\)/g;
	const packages = new Set();
	let match;

	while ((match = regExpCheckPackage.exec(contentFile)) !== null) {
		let pkg = match[1];
		if (pkg.startsWith(".") || pkg.startsWith("/") || pkg.startsWith("node:")) continue;
		pkg = pkg.startsWith("@") ? pkg.split("/").slice(0, 2).join("/") : pkg.split("/")[0];
		if (!isBuiltinOrInstalled(pkg)) packages.add(pkg);
	}

	for (const packageName of packages) {
		try {
			execSync(`npm install ${packageName} --save --no-audit --no-fund`, { stdio: "pipe" });
		}
		catch (err) {
			if (packageName === "sharp") {
				try {
					execSync(`npm install sharp @img/sharp-wasm32 --save --no-audit --no-fund`, { stdio: "pipe" });
					continue;
				}
				catch (e2) { /* fall through to the real error */ }
			}
			throw new Error(`Can't install package ${packageName}: ${err.message}`);
		}
	}
}

function extractRawCode(event, args, fileName) {
	const body = String(event.body || "");
	const firstArg = String(args[1] || "");
	const lastArg = String(args[args.length - 1] || "");
	const installIndex = body.toLowerCase().indexOf("install");

	// (cmd install bike.js <code>) — file first, code after it.
	if (firstArg.endsWith(".js")) {
		const index = body.indexOf(firstArg);
		if (index !== -1) return body.slice(index + firstArg.length).trim();
	}

	// (cmd install <code> bike.js) — code first, file name last.
	if (lastArg.endsWith(".js")) {
		const index = body.lastIndexOf(lastArg);
		if (index !== -1 && installIndex !== -1) return body.slice(installIndex + "install".length, index).trim();
	}

	return "";
}

module.exports = {
	config: {
		name: "cmd",
		version: "5.0.0",
		author: "0xMr_King x ┃ Tanin Islam",
		countDown: 2,
		role: 4,
		description: {
			en: "Auto Package Installer, Command Manager & Unloader"
		},
		category: "owner",
		guide: {
			en: "   {pn} install <url> <file.js>\n   {pn} install <file.js> <code>\n   {pn} load <file.js>\n   {pn} unload <file.js>"
		}
	},

	langs: {
		en: {
			missingFileName: "Command file name lacks .js extension or missing.",
			loaded: "Command \"%1\" loaded successfully!",
			loadedError: "Failed to load command \"%1\"\n%2: %3",
			missingCommandNameUnload: "Please enter the file name of the command you want to unload.",
			unloaded: "Unloaded command \"%1\" successfully!",
			unloadedError: "Failed to unload command \"%1\"\n%2: %3",
			missingUrlCodeOrFileName: "Syntax: {pn} install <url/code> <filename.js>",
			invalidUrl: "Invalid URL provided.",
			invalidUrlOrCode: "Failed to extract valid code from source.",
			alreadExist: "File already exists. Bot Dev react to this message to overwrite.",
			installed: "Successfully installed \"%1\"\nSaved: %2",
			installedError: "Failed to install \"%1\"\n%2: %3"
		}
	},

	onStart: async ({ args, message, api, threadModel, userModel, dashBoardModel, globalModel, threadsData, usersData, dashBoardData, globalData, event, commandName, getLang }) => {
		const action = (args[0] || "").toLowerCase();
		const configCommands = configStore();

		// —──────────────── LOAD COMMAND —──────────────── //
		if (action === "load" && args.length === 2) {
			if (!args[1]) return message.reply(getLang("missingFileName"));
			const infoLoad = await loadScripts("cmds", args[1], log, configCommands, api, threadModel, userModel, dashBoardModel, globalModel, threadsData, usersData, dashBoardData, globalData, getLang, null, api, event.messageID);
			if (infoLoad.status === "success") return message.reply(getLang("loaded", infoLoad.name));
			return message.reply(getLang("loadedError", infoLoad.name, infoLoad.error.name, infoLoad.error.message));
		}

		// —──────────────── UNLOAD COMMAND —──────────────── //
		else if (action === "unload") {
			if (!args[1]) return message.reply(getLang("missingCommandNameUnload"));
			const fileName = safeFileName(args[1]);

			try {
				const infoUnload = unloadScripts("cmds", fileName, configCommands, getLang);
				return message.reply(getLang("unloaded", infoUnload.name));
			} catch (err) {
				return message.reply(getLang("unloadedError", fileName, err.name || "Error", err.message || err));
			}
		}

		// —──────────────── INSTALL COMMAND —──────────────── //
		else if (action === "install") {
			let source = args[1];
			let fileName = args[2];
			let rawCode = "";

			if (!source || !fileName) return message.reply(getLang("missingUrlCodeOrFileName"));

			if (source.endsWith(".js") && !isURL(source)) {
				const tmp = fileName;
				fileName = source;
				source = tmp;
			}

			fileName = safeFileName(fileName);

			if (source && isURL(source)) {
				if (!fileName.endsWith(".js")) return message.reply(getLang("missingFileName"));
				const domain = getDomain(source);
				if (!domain) return message.reply(getLang("invalidUrl"));

				if (domain === "pastebin.com")
					source = source.replace(/https:\/\/pastebin\.com\/(?!raw\/)(.*)/, "https://pastebin.com/raw/$1");
				else if (domain === "github.com")
					source = source.replace(/https:\/\/github\.com\/(.*)\/blob\/(.*)/, "https://raw.githubusercontent.com/$1/$2");

				try {
					const res = await axios.get(source, { timeout: 30000, responseType: "text", transformResponse: [data => data] });
					rawCode = typeof res.data === "string" ? res.data : JSON.stringify(res.data);
				} catch (e) {
					return message.reply(getLang("invalidUrlOrCode"));
				}

				if (domain === "savetext.net") {
					const $ = cheerio.load(rawCode);
					rawCode = $("#content").text();
				}
			} else {
				rawCode = extractRawCode(event, args, fileName);
			}

			if (!rawCode || !rawCode.trim()) return message.reply(getLang("invalidUrlOrCode"));

			const targetPath = path.join(process.cwd(), "scripts", "cmds", fileName);

			if (fs.existsSync(targetPath)) {
				return message.reply(getLang("alreadExist"), (err, info) => {
					if (err || !info) return;
					global.GoatBot.onReaction.set(info.messageID, {
						commandName,
						messageID: info.messageID,
						type: "install",
						data: { fileName, rawCode }
					});
				});
			}

			const infoLoad = await loadScripts("cmds", fileName, log, configCommands, api, threadModel, userModel, dashBoardModel, globalModel, threadsData, usersData, dashBoardData, globalData, getLang, rawCode, api, event.messageID);
			if (infoLoad.status === "success")
				return message.reply(getLang("installed", infoLoad.name, `/scripts/cmds/${fileName}`));
			return message.reply(getLang("installedError", infoLoad.name, infoLoad.error.name, infoLoad.error.message));
		} else {
			message.SyntaxError();
		}
	},

	onReaction: async function ({ Reaction, message, event, api, threadModel, userModel, dashBoardModel, globalModel, threadsData, usersData, dashBoardData, globalData, getLang, role }) {
		if (role < 4 || !Reaction || !Reaction.data) return;

		const { fileName, rawCode } = Reaction.data;
		const infoLoad = await loadScripts("cmds", fileName, log, configStore(), api, threadModel, userModel, dashBoardModel, globalModel, threadsData, usersData, dashBoardData, globalData, getLang, rawCode, api, event.messageID);
		if (infoLoad.status === "success")
			return message.reply(getLang("installed", infoLoad.name, `/scripts/cmds/${fileName}`));
		return message.reply(getLang("installedError", infoLoad.name, infoLoad.error.name, infoLoad.error.message));
	}
};

// —──────────────── LOAD SCRIPT FUNCTION —──────────────── //
async function loadScripts(folder, fileName, log, configCommands, api, threadModel, userModel, dashBoardModel, globalModel, threadsData, usersData, dashBoardData, globalData, getLang, rawCode, fcaApi, targetMessageID) {
	let wroteFile = false;
	let pathCommand = "";

	try {
		fileName = safeFileName(fileName);
		const contentFile = String(rawCode || "");
		pathCommand = path.normalize(path.join(process.cwd(), "scripts", folder, fileName));

		if (rawCode) {
			// Parse BEFORE saving, so a broken command never lands in scripts/cmds.
			new Function("module", "exports", "require", "__dirname", "__filename", contentFile);
			await fs.promises.writeFile(pathCommand, contentFile, "utf8");
			wroteFile = true;
		}

		const source = await fs.promises.readFile(pathCommand, "utf8");
		installMissingPackages(source, fileName);

		const resolved = require.resolve(pathCommand);
		if (require.cache[resolved]) delete require.cache[resolved];

		const command = require(pathCommand);
		command.location = pathCommand;
		const configCommand = command.config;
		if (!configCommand || typeof configCommand !== "object") throw new Error("config of command must be an object");
		if (!configCommand.name) throw new Error("name of command is missing");
		if (typeof command.onStart !== "function") throw new Error("onStart of command must be a function");

		const scriptName = String(configCommand.name);
		const lowerName = scriptName.toLowerCase();
		const { GoatBot } = global;
		const existing = GoatBot.commands.get(lowerName);
		if (existing && String(existing.location || "") !== pathCommand)
			throw new Error(`command "${scriptName}" already exists with file "${path.basename(existing.location || "unknown")}"`);

		const aliases = configCommand.aliases || [];
		if (!Array.isArray(aliases)) throw new Error("config.aliases must be an array");
		for (const alias of aliases) {
			const owner = GoatBot.aliases.get(String(alias));
			if (owner && owner !== lowerName)
				throw new Error(`alias "${alias}" already exists in command "${owner}"`);
		}

		if (configCommand.onLoad) {
			if (typeof configCommand.onLoad !== "function" && typeof command.onLoad !== "function")
				throw new Error("onLoad must be a function");
		}
		if (typeof command.onLoad === "function") {
			await command.onLoad({ api, threadModel, userModel, dashBoardModel, globalModel, threadsData, usersData, dashBoardData, globalData });
		}

		// Replacing the same file: clear old runtime hooks before adding fresh ones.
		unregisterRuntime(lowerName, pathCommand);
		for (const alias of aliases) GoatBot.aliases.set(String(alias), lowerName);

		if (typeof command.onChat === "function") GoatBot.onChat.push(lowerName);
		if (typeof command.onFirstChat === "function") GoatBot.onFirstChat.push({ commandName: lowerName, threadIDsChattedFirstTime: [] });
		if (typeof command.onEvent === "function") GoatBot.onEvent.push(lowerName);
		if (typeof command.onAnyEvent === "function") GoatBot.onAnyEvent.push(lowerName);

		GoatBot.commands.set(lowerName, command);

		const store = configCommands || configStore();
		if (configCommand.envGlobal && typeof configCommand.envGlobal === "object") {
			store.envGlobal = store.envGlobal || {};
			Object.assign(store.envGlobal, configCommand.envGlobal);
		}
		if (configCommand.envConfig && typeof configCommand.envConfig === "object") {
			store.envCommands = store.envCommands || {};
			store.envCommands[lowerName] = { ...(store.envCommands[lowerName] || {}), ...configCommand.envConfig };
		}

		const keyUnloadCommand = folder === "cmds" ? "commandUnload" : "commandEventUnload";
		if (Array.isArray(store[keyUnloadCommand])) {
			const index = store[keyUnloadCommand].indexOf(fileName);
			if (index !== -1) store[keyUnloadCommand].splice(index, 1);
		}

		global.temp.contentScripts[folder][fileName] = source;
		global.GoatBot.commandFilesPath.push({
			filePath: pathCommand,
			commandName: [scriptName, ...aliases.map(String)]
		});
		global.utils.clearEmojiTriggerCache(scriptName);
		global.utils.clearEmojiTriggerCache(lowerName);

		writeConfigStore(store);

		return { status: "success", name: fileName, command };
	}
	catch (err) {
		if (wroteFile && rawCode) {
			try { await fs.promises.unlink(pathCommand); }
			catch (e) { /* keep the original error */ }
		}
		return { status: "failed", name: fileName, error: err };
	}
}

function unregisterRuntime(commandName, filePath) {
	const GoatBot = global.GoatBot;
	const old = GoatBot.commands.get(commandName);
	if (old && old.config && Array.isArray(old.config.aliases)) {
		for (const alias of old.config.aliases) {
			if (GoatBot.aliases.get(String(alias)) === commandName) GoatBot.aliases.delete(String(alias));
		}
	}

	const filterHook = list => (list || []).filter(item => {
		if (typeof item === "string") return item !== commandName;
		return (item && item.commandName) !== commandName;
	});
	GoatBot.onChat = filterHook(GoatBot.onChat);
	GoatBot.onEvent = filterHook(GoatBot.onEvent);
	GoatBot.onAnyEvent = filterHook(GoatBot.onAnyEvent);
	GoatBot.onFirstChat = filterHook(GoatBot.onFirstChat);

	if (Array.isArray(GoatBot.commandFilesPath)) {
		GoatBot.commandFilesPath = GoatBot.commandFilesPath.filter(item =>
			path.normalize(item?.filePath || "") !== path.normalize(filePath)
		);
	}

	GoatBot.commands.delete(commandName);
	global.utils.clearEmojiTriggerCache(commandName);
}

// —──────────────── UNLOAD SCRIPT FUNCTION —──────────────── //
function unloadScripts(folder, fileName, configCommands, getLang) {
	fileName = safeFileName(fileName);
	const pathCommand = path.normalize(path.join(process.cwd(), "scripts", folder, fileName));

	if (!fs.existsSync(pathCommand)) {
		const err = new Error(`Command file "${fileName}" does not exist!`);
		err.name = "FileNotFound";
		throw err;
	}

	const { GoatBot } = global;
	const command = GoatBot.commands.get(path.basename(fileName, ".js").toLowerCase());
	const commandName = command?.config?.name || path.basename(fileName, ".js");

	unregisterRuntime(commandName.toLowerCase(), pathCommand);
	unregisterRuntime(path.basename(fileName, ".js").toLowerCase(), pathCommand);

	delete require.cache[require.resolve(pathCommand)];

	const keyUnloadCommand = folder === "cmds" ? "commandUnload" : "commandEventUnload";
	const store = configCommands || configStore();
	if (!Array.isArray(store[keyUnloadCommand])) store[keyUnloadCommand] = [];
	if (!store[keyUnloadCommand].includes(fileName)) {
		store[keyUnloadCommand].push(fileName);
		writeConfigStore(store);
	}

	global.utils.clearEmojiTriggerCache(commandName);
	return { status: "success", name: commandName };
}
