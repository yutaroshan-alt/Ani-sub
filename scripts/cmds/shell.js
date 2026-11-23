const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const AUTHOR = "0xMr_King x ┃ Tanin Islam";
const MAX_OUTPUT = 3800;
const PROCESS_TIMEOUT_MS = 30 * 60 * 1000;

let currentCwd = process.cwd();
let processNumber = 0;
const activeProcesses = new Map();
const commandHistory = [];

const ROOT = () => process.cwd();
const CONFIG_PATH = () => path.join(ROOT(), "config.json");

function prefixOf(event) {
	try {
		if (global.utils && typeof global.utils.getPrefix === "function")
			return global.utils.getPrefix(event && event.threadID) || (global.GoatBot && global.GoatBot.config && global.GoatBot.config.prefix) || "(";
	}
	catch (e) { /* ignore */ }
	return (global.GoatBot && global.GoatBot.config && global.GoatBot.config.prefix) || "(";
}

function restartSoon() {
	setTimeout(() => {
		try {
			if (process.send) process.exit(7);
			else if (global.GoatBot && typeof global.GoatBot.reLoginBot === "function") global.GoatBot.reLoginBot();
			else process.exit(0);
		}
		catch (e) { /* supervisor restarts us anyway */ }
	}, 1200);
}

function readConfig() {
	try { return JSON.parse(fs.readFileSync(CONFIG_PATH(), "utf8")); }
	catch (e) { return null; }
}

function writeConfig(cfg) {
	fs.writeFileSync(CONFIG_PATH(), JSON.stringify(cfg, null, 2) + "\n", "utf8");
}

function stripAnsi(text) {
	return String(text).replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, "");
}

function collectSecrets(cfg) {
	const found = [];
	const walk = value => {
		if (typeof value === "string" && value.length >= 8) found.push(value);
		else if (value && typeof value === "object") Object.values(value).forEach(walk);
	};
	for (const key of ["credentials", "facebookAccount", "notiWhenListenMqttError", "serverUptime"])
		if (cfg && cfg[key]) walk(cfg[key]);
	return found;
}

function safeOutput(raw) {
	let text = stripAnsi(raw);
	for (const secret of collectSecrets(readConfig())) text = text.split(secret).join("[redacted]");
	if (text.length > MAX_OUTPUT * 4) text = text.slice(0, MAX_OUTPUT * 4) + "\n\n...[Buffer limit reached]";
	return text;
}

// Runs a real shell command and streams the output back to Messenger.
function runShell(api, event, commandText, label) {
	const { threadID, messageID, senderID } = event;
	api.setMessageReaction("⏳", messageID, () => {}, true);

	const child = spawn(commandText, {
		shell: true,
		cwd: currentCwd,
		env: { ...process.env, TERM: "xterm-256color", PYTHONUNBUFFERED: "1" },
		stdio: ["pipe", "pipe", "pipe"]
	});

	let outputBuffer = "";
	let isFinished = false;
	let promptSent = false;
	let promptTimer = null;
	let timedOut = false;

	const id = ++processNumber;
	const procObj = { id, child, senderID, command: label || commandText, startedAt: Date.now(), isFinished: false };
	activeProcesses.set(messageID, procObj);

	const timeoutTimer = setTimeout(() => {
		timedOut = true;
		try { child.kill("SIGKILL"); } catch (e) { /* already gone */ }
	}, PROCESS_TIMEOUT_MS);

	const startLine = label ? `$ ${label}\n\n` : "";

	const sendOutputMessage = (text, isFinal) => {
		let cleanText = safeOutput(text).trim() || (isFinal ? "Command finished with no output." : "");
		if (!cleanText) return;
		if (cleanText.length > MAX_OUTPUT) cleanText = cleanText.slice(0, MAX_OUTPUT) + "\n\n...[Output Truncated]";

		const header = isFinal
			? `── SHELL OUTPUT [${id}] ──`
			: `── INPUT REQUIRED [${id}] (Reply with 'y', text, 'kill' or 'jobs') ──`;

		api.sendMessage(`${header}\n\n\`\`\`bash\n${startLine}${cleanText}\n\`\`\``, threadID, (err, info) => {
			if (!err && info && !isFinal) {
				activeProcesses.set(info.messageID, procObj);
				global.GoatBot?.onReply?.set(info.messageID, {
					commandName: module.exports.config.name,
					messageID: info.messageID,
					author: senderID
				});
			}
		}, messageID);
	};

	const resetInputWaitTimer = () => {
		if (promptTimer) clearTimeout(promptTimer);
		promptTimer = setTimeout(() => {
			if (!isFinished && outputBuffer.trim()) {
				promptSent = true;
				const currentOut = outputBuffer;
				outputBuffer = "";
				sendOutputMessage(currentOut, false);
			}
		}, 3000);
	};

	child.stdout.on("data", data => { outputBuffer += data.toString(); resetInputWaitTimer(); });
	child.stderr.on("data", data => { outputBuffer += data.toString(); resetInputWaitTimer(); });

	child.on("close", code => {
		isFinished = true;
		procObj.isFinished = true;
		if (promptTimer) clearTimeout(promptTimer);
		clearTimeout(timeoutTimer);
		activeProcesses.delete(messageID);
		api.setMessageReaction("✅", messageID, () => {}, true);
		const tail = timedOut ? `\n\nProcess timed out after ${PROCESS_TIMEOUT_MS / 60000} minutes.` : "";
		if (outputBuffer.trim() || !promptSent)
			sendOutputMessage(outputBuffer || `Process completed with exit code ${code}.`, true);
		if (tail) api.sendMessage(tail, threadID, messageID);
	});

	child.on("error", err => {
		isFinished = true;
		procObj.isFinished = true;
		if (promptTimer) clearTimeout(promptTimer);
		clearTimeout(timeoutTimer);
		activeProcesses.delete(messageID);
		api.setMessageReaction("❌", messageID, () => {}, true);
		api.sendMessage(`Execution error:\n\`\`\`bash\n${stripAnsi(err.message)}\n\`\`\``, threadID, messageID);
	});
}

module.exports = {
	config: {
		name: "shell",
		aliases: ["terminal", "bash", "$", "sh", "sys", "control"],
		version: "18.0.0",
		author: AUTHOR,
		countDown: 0,
		role: 2,
		category: "owner",
		shortDescription: "All-in-one terminal and bot control panel",
		guide: {
			en: "{pn} help                 show the full manual\n" +
				"{pn} <shell command>      run any terminal command\n" +
				"{pn} account             show single-account info\n" +
				"{pn} typing <on|off|status>\n" +
				"{pn} jobs | kill <id> | clearjobs | history | eval <code>"
		}
	},

	onStart: async function ({ api, event, args, message, role }) {
		const { threadID, messageID } = event;
		const commandText = args.join(" ").trim();
		const first = (args[0] || "").toLowerCase();
		const p = prefixOf(event);

		if (Number(role || 0) < 2)
			return api.sendMessage(`⛔ Admin only.\nMade by ${AUTHOR}`, threadID, messageID);

		if (!commandText || first === "help" || first === "manual") {
			const cfg = readConfig() || {};
			const manualText =
				`━━━ SHELL / CONTROL MANUAL ━━━\n\n` +
				`Current directory:\n\`${currentCwd}\`\n\n` +
				`SHORTCUTS\n` +
				`• ${p}shell deps              check missing npm packages\n` +
				`• ${p}shell install           repair / install npm packages\n` +
				`• ${p}shell rebuild <sqlite|canvas|all>\n` +
				`• ${p}shell status           bot, node, memory and config status\n` +
				`• ${p}shell account          show single-account.txt info\n` +
				`• ${p}shell typing <on|off|status>   typing indicator control\n` +
				`• ${p}shell lang <en|bn|vi>  set language\n` +
				`• ${p}shell eval <code>      evaluate JavaScript\n` +
				`• ${p}shell jobs             list running shell processes\n` +
				`• ${p}shell kill <id|pid>    stop a running process\n` +
				`• ${p}shell clearjobs        stop every running process\n` +
				`• ${p}shell history          show recent commands\n` +
				`• ${p}shell restart          restart on the next account\n` +
				`• ${p}shell cd <path>        change working directory\n\n` +
				`RAW TERMINAL\n` +
				`• Any other text runs in the shell.\n` +
				`• Reply to an input prompt with 'y', text, 'kill', 'jobs' or 'history'.\n` +
				`• Processes stop automatically after ${PROCESS_TIMEOUT_MS / 60000} minutes.\n` +
				`• Secrets from config.json are redacted from all output.\n\n` +
				`Language: ${cfg.language || "en"} | Database: ${(cfg.database && cfg.database.type) || "sqlite"}\n` +
				`Made by ${AUTHOR}`;
			return api.sendMessage(manualText, threadID, messageID);
		}

		if (/^cd(\s+.*)?$/.test(commandText)) {
			const targetDir = commandText.replace(/^cd\s*/, "").trim() || process.env.HOME || "/";
			const resolvedPath = path.resolve(currentCwd, targetDir.replace(/^~/, process.env.HOME || ""));
			if (fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isDirectory()) {
				currentCwd = resolvedPath;
				return api.sendMessage(`Directory changed to:\n\`${currentCwd}\``, threadID, messageID);
			}
			return api.sendMessage(`Directory not found:\n\`${resolvedPath}\``, threadID, messageID);
		}

		if (["status", "info", "health"].includes(first) && !args[1]) {
			const cfg = readConfig() || {};
			const mb = Math.round(process.memoryUsage().rss / 1048576);
			const jobs = [...activeProcesses.values()].filter(p => !p.isFinished).length;
			const statusText =
				`ALIYA CONTROL STATUS\n` +
				`Node      : ${process.version} (${process.platform}/${process.arch})\n` +
				`Memory    : ${mb} MB\n` +
				`Uptime    : ${global.utils.formatDuration(process.uptime())}\n` +
				`Directory : ${currentCwd}\n` +
				`Engine    : ${global.GoatBot?.isWolfMode ? "Wolf safe mode" : "Aliya main"}\n` +
				`Account   : account.txt (single-account mode)\n` +
				`Bot UID   : ${global.GoatBot?.botID || "unknown"}\n` +
				`Language  : ${cfg.language || "en"}\n` +
				`Database  : ${(cfg.database && cfg.database.type) || "sqlite"}\n` +
				`JSON fallback: ${cfg.database && cfg.database.fallbackToJson !== false ? "enabled" : "disabled"}\n` +
				`Running jobs: ${jobs}\n` +
				`Made by ${AUTHOR}`;
			return api.sendMessage(statusText, threadID, messageID);
		}

		if (first === "account" || first === "acc" || first === "pool") {
			const accCmd = (global.GoatBot && global.GoatBot.commands && global.GoatBot.commands.get("account")) || require("./account.js");
			if (!accCmd || typeof accCmd.onStart !== "function")
				return api.sendMessage("Account command is not available.", threadID, messageID);
			return accCmd.onStart({ api, event, args: args.slice(1), message, role });
		}

		if (first === "typing" || first === "typingindicator") {
			const typingCmd = (global.GoatBot && global.GoatBot.commands && global.GoatBot.commands.get("typing")) || require("./typing.js");
			if (!typingCmd || typeof typingCmd.onStart !== "function")
				return api.sendMessage("Typing command is not available.", threadID, messageID);
			return typingCmd.onStart({ api, event, args: args.slice(1), message, role });
		}

		if (first === "eval") {
			const evalCmd = (global.GoatBot && global.GoatBot.commands && global.GoatBot.commands.get("eval")) || require("./eval.js");
			if (!evalCmd || typeof evalCmd.onStart !== "function")
				return api.sendMessage("Eval command is not available.", threadID, messageID);
			return evalCmd.onStart({ api, event, args: args.slice(1), message, role });
		}

		if (first === "jobs") {
			const jobs = [...new Set(activeProcesses.values())].filter(job => !job.isFinished);
			if (!jobs.length) return api.sendMessage("No running shell processes.", threadID, messageID);
			const lines = jobs.map(job =>
				`#${job.id}  pid ${job.child.pid}  ${job.command.slice(0, 60)}  ${global.utils.formatDuration((Date.now() - job.startedAt) / 1000)}`
			);
			return api.sendMessage(`RUNNING JOBS\n${lines.join("\n")}`, threadID, messageID);
		}

		if (first === "kill") {
			const key = String(args[1] || "");
			let target = [...new Set(activeProcesses.values())].find(job =>
				!job.isFinished && (String(job.id) === key || String(job.child.pid) === key)
			);
			if (!target) return api.sendMessage(`Usage: ${p}shell kill <id|pid>. Use ${p}shell jobs to list them.`, threadID, messageID);
			try { target.child.kill("SIGKILL"); } catch (e) { /* already gone */ }
			target.isFinished = true;
			return api.sendMessage(`Process #${target.id} terminated.`, threadID, messageID);
		}

		if (first === "clearjobs") {
			const jobs = [...new Set(activeProcesses.values())].filter(job => !job.isFinished);
			for (const job of jobs) {
				try { job.child.kill("SIGKILL"); } catch (e) { /* already gone */ }
				job.isFinished = true;
			}
			activeProcesses.clear();
			return api.sendMessage(`${jobs.length} running process(es) terminated.`, threadID, messageID);
		}

		if (first === "history") {
			if (!commandHistory.length) return api.sendMessage("No command history yet.", threadID, messageID);
			return api.sendMessage(`COMMAND HISTORY\n${commandHistory.map((h, i) => `${i + 1}. ${h}`).join("\n")}`, threadID, messageID);
		}

		if (first === "lang" || first === "language") {
			const code = String(args[1] || "").toLowerCase();
			if (!["en", "bn", "vi"].includes(code))
				return api.sendMessage(`Usage: ${p}shell lang <en|bn|vi>`, threadID, messageID);
			const cfg = readConfig();
			if (!cfg) return api.sendMessage("Cannot read config.json. Check the file and try again.", threadID, messageID);
			cfg.language = code;
			try {
				writeConfig(cfg);
				await api.sendMessage(`Language set to ${code}. Run ${p}shell restart to apply it everywhere.`, threadID, messageID);
			}
			catch (e) {
				api.sendMessage(`Could not save config.json: ${e.message}`, threadID, messageID);
			}
			return;
		}

		if (["restart", "reboot", "relogin"].includes(first)) {
			await api.sendMessage("Restarting the engine now. It will be back in a few seconds.", threadID, messageID);
			return restartSoon();
		}

		const shorthands = {
			deps: "node scripts/check-dependencies.js",
			checkdeps: "node scripts/check-dependencies.js",
			dependencies: "node scripts/check-dependencies.js",
			install: "npm install --omit=dev --no-audit --no-fund",
			fix: "npm install --omit=dev --no-audit --no-fund",
			npmfix: "npm install --omit=dev --no-audit --no-fund"
		};

		if (shorthands[first]) {
			const cmd = shorthands[first];
			commandHistory.push(cmd);
			if (commandHistory.length > 10) commandHistory.shift();
			return runShell(api, event, cmd, cmd);
		}

		if (first === "rebuild") {
			const what = (args[1] || "sqlite").toLowerCase();
			let cmd;
			if (["sqlite", "sql", "db"].includes(what))
				cmd = "npm rebuild sqlite3 --build-from-source --no-audit --no-fund";
			else if (what === "canvas")
				cmd = "npm rebuild canvas --build-from-source --no-audit --no-fund";
			else if (what === "all")
				cmd = "npm rebuild sqlite3 --build-from-source --no-audit --no-fund && npm rebuild canvas --build-from-source --no-audit --no-fund";
			else
				return api.sendMessage(`Usage: ${p}shell rebuild <sqlite|canvas|all>`, threadID, messageID);
			commandHistory.push(cmd);
			if (commandHistory.length > 10) commandHistory.shift();
			return runShell(api, event, cmd, cmd);
		}

		commandHistory.push(commandText);
		if (commandHistory.length > 10) commandHistory.shift();
		return runShell(api, event, commandText, null);
	},

	onReply: async function ({ api, event, Reply }) {
		const { threadID, messageID, senderID, body } = event;
		const procData = activeProcesses.get(Reply.messageID);

		if (!procData || procData.isFinished || !procData.child || procData.child.killed)
			return api.sendMessage("This terminal process has already ended.", threadID, messageID);
		if (senderID !== procData.senderID) return;

		const input = body.trim();
		if (["kill", "exit", "^C"].includes(input.toLowerCase())) {
			try { procData.child.kill("SIGKILL"); } catch (e) { /* already gone */ }
			procData.isFinished = true;
			activeProcesses.delete(Reply.messageID);
			return api.sendMessage(`Process #${procData.id} terminated.`, threadID, messageID);
		}

		try {
			api.setMessageReaction("⌨️", messageID, () => {}, true);
			procData.child.stdin.write(input + "\n");
		}
		catch (err) {
			api.sendMessage(`Failed to send input: ${err.message}`, threadID, messageID);
		}
	}
};
