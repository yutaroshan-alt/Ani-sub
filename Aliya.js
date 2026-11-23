/**
 * ============================================================================
 * ALIYA OFFICIAL V4 - MASTER PRIMARY ENGINE
 * Maintained by 0xMr_King x ┃ Tanin Islam | Multi-Account Pool & Self-Healing Architecture
 *
 * Exit codes (read by index.js):
 *   2 = planned restart (memory guard / scheduled / listener unstable)
 *   3 = every account failed -> index.js shows the offline page and retries
 *   4 = engine cannot run at all -> index.js switches to Wolf.js
 *   5 = account switched / account died -> immediate restart on the next account
 *   6 = a npm package is missing -> index.js runs "npm install" and restarts
 * ============================================================================
 */
"use strict";

const send = msg => { if (process.send) { try { process.send(msg); } catch (e) { /* supervisor gone */ } } };

// A single broken command must NOT take the whole bot down (old code switched to Wolf.js on ANY error).
const crashTimes = [];
process.on("unhandledRejection", error => console.error("[ALIYA_UNHANDLED_REJECTION]", error && error.message ? error.message : error));
process.on("uncaughtException", error => {
	console.error("[ALIYA_UNCAUGHT_EXCEPTION]", error && error.stack ? error.stack : error);

	// startup crash because a package is not installed -> let index.js install it
	const missing = String(error && error.message || "").match(/Cannot find module '([^'./][^']*)'/);
	if (error && error.code === "MODULE_NOT_FOUND" && missing && !(global.GoatBot && global.GoatBot.startupDone)) {
		console.error(`[ALIYA] Package "${missing[1]}" is missing - asking index.js to run npm install`);
		return process.exit(6);
	}

	// crash loop guard: many errors in a short time -> restart the core (index.js applies back-off / Wolf failover)
	const now = Date.now();
	crashTimes.push(now);
	while (crashTimes.length && now - crashTimes[0] > 60000) crashTimes.shift();
	if (crashTimes.length >= 8) {
		console.error("[ALIYA] Too many uncaught errors in 60s - restarting core");
		process.exit(1);
	}
});

process.on("SIGTERM", () => process.exit(0));
process.on("SIGINT", () => process.exit(0));

require("events").EventEmitter.defaultMaxListeners = 150;
process.setMaxListeners(150);

// heartbeat for index.js freeze detection (setInterval stops firing if the event loop is blocked)
setInterval(() => send({ type: "HEARTBEAT" }), 15000).unref();

// memory guard: restart cleanly before the host kills us (index.js passes the limit)
const RSS_LIMIT_MB = Number(process.env.ALIYA_RSS_LIMIT_MB) || 0;
if (RSS_LIMIT_MB > 0) {
	let over = 0;
	let cleaning = false;
	setInterval(async () => {
		const mb = process.memoryUsage().rss / 1048576;
		if (mb > RSS_LIMIT_MB) {
			over++;
			console.warn(`[ALIYA_MEMORY] RSS ${Math.round(mb)}MB is above ${RSS_LIMIT_MB}MB (${over}/2)`);
			if (over >= 2 && !cleaning) {
				cleaning = true;
				console.warn("[ALIYA_MEMORY] Memory limit reached. Cleaning temporary data and restarting fresh...");
				process.exit(2);
			}
		}
		else over = 0;
	}, 30000).unref();
}

const fs = require("fs-extra");
const path = require("path");
const log = require("./logger/log.js");

process.env.BLUEBIRD_W_FORGOTTEN_RETURN = 0;

function getConfigPath(baseName, ext = ".json") {
	const devPath = path.join(__dirname, `${baseName}.dev${ext}`);
	const normalPath = path.join(__dirname, `${baseName}${ext}`);
	if (fs.existsSync(devPath)) return devPath;
	if (fs.existsSync(normalPath)) return normalPath;
	throw new Error(`Missing ${baseName}${ext} or ${baseName}.dev${ext}`);
}

function validJSON(pathDir) {
	if (!fs.existsSync(pathDir)) throw new Error(`File "${pathDir}" not found`);
	try {
		JSON.parse(fs.readFileSync(pathDir, "utf-8"));
		return true;
	}
	catch (err) {
		throw new Error(`JSON Syntax Error in ${pathDir}: ${err.message}`);
	}
}

// Single-account mode: account.txt is the only login source.
// On cloud hosts ACCOUNT_TXT simply fills that same file before login.
try {
	if (process.env.ACCOUNT_TXT) fs.writeFileSync(path.join(__dirname, "account.txt"), process.env.ACCOUNT_TXT);
	if (!fs.existsSync(path.join(__dirname, "account.txt"))) fs.writeFileSync(path.join(__dirname, "account.txt"), "[]");
}
catch (e) { console.warn("[ALIYA] Could not prepare account.txt:", e.message); }

const dirConfig = getConfigPath("config", ".json");
const dirConfigCommands = getConfigPath("configCommands", ".json");
const dirAccount = path.join(__dirname, "account.txt");

for (const pathDir of [dirConfig, dirConfigCommands]) {
	try {
		validJSON(pathDir);
	}
	catch (err) {
		log.error("CONFIG", `${err.message}\nPlease fix JSON syntax and restart.`);
		process.exit(1);
	}
}

const config = require(dirConfig);
if (config.whiteListMode && Array.isArray(config.whiteListMode.whiteListIds)) {
	config.whiteListMode.whiteListIds = config.whiteListMode.whiteListIds.map(id => id.toString());
}
const configCommands = require(dirConfigCommands);

global.GoatBot = {
	startTime: Date.now() - process.uptime() * 1000,
	commands: new Map(),
	eventCommands: new Map(),
	commandFilesPath: [],
	eventCommandsFilesPath: [],
	aliases: new Map(),
	onFirstChat: [],
	onChat: [],
	onEvent: [],
	onReply: new Map(),
	onReaction: new Map(),
	onAnyEvent: [],
	config,
	configCommands,
	envCommands: configCommands.envCommands || {},
	envEvents: configCommands.envEvents || {},
	envGlobal: configCommands.envGlobal || {},
	reLoginBot: function () { },
	Listening: null,
	oldListening: [],
	callbackListenTime: {},
	storage5Message: [],
	fcaApi: null,
	botID: null,
	activeAccountFile: "account.txt",
	startupDone: false
};

global.db = {
	allThreadData: [],
	allUserData: [],
	allDashBoardData: [],
	allGlobalData: [],
	threadModel: null,
	userModel: null,
	dashboardModel: null,
	globalModel: null,
	threadsData: null,
	usersData: null,
	dashBoardData: null,
	globalData: null,
	receivedTheFirstMessage: {}
};

global.client = {
	dirConfig,
	dirConfigCommands,
	dirAccount,
	countDown: {},
	cache: {},
	database: {
		creatingThreadData: [],
		creatingUserData: [],
		creatingDashBoardData: [],
		creatingGlobalData: []
	},
	commandBanned: configCommands.commandBanned || []
};

const utils = require("./utils.js");
global.utils = utils;
global.textEngine = require("./textEngine.js");

// Some commands resolve their dependencies from global.nodemodule instead of require().
// Expose any installed/built-in module there so their onLoad hooks work.
global.nodemodule = new Proxy(Object.create(null), {
	get(_target, name) {
		if (typeof name !== "string")
			return undefined;
		try {
			return require(name);
		}
		catch (_e) {
			return undefined;
		}
	},
	has() {
		return true;
	}
});

global.temp = {
	createThreadData: [],
	createUserData: [],
	createThreadDataError: [],
	filesOfGoogleDrive: { arraybuffer: {}, stream: {}, fileNames: {} },
	contentScripts: { cmds: {}, events: {} }
};

// Safe hot-reloading of config files
for (const [dir, prop, name] of [[dirConfigCommands, "configCommands", "CONFIG COMMANDS"], [dirConfig, "config", "CONFIG"]]) {
	try {
		let lastModified = fs.statSync(dir).mtimeMs;
		fs.watch(dir, eventType => {
			if (eventType !== "change") return;
			setTimeout(() => {
				try {
					const currentMtime = fs.statSync(dir).mtimeMs;
					if (lastModified === currentMtime) return;
					lastModified = currentMtime;
					global.GoatBot[prop] = JSON.parse(fs.readFileSync(dir, "utf-8"));
					log.success(name, `Hot-reloaded ${path.basename(dir)}`);
				}
				catch (err) { log.warn(name, `Can't reload ${path.basename(dir)} (invalid JSON?) - keeping the old one`); }
			}, 250);
		});
	}
	catch (err) { /* fs.watch not supported on this host (Termux, Docker volume...) */ }
}

// Auto-restart scheduler: milliseconds OR a cron expression
if (config.autoRestart) {
	const time = config.autoRestart.time;
	if (!isNaN(time) && Number(time) > 0) {
		setTimeout(() => {
			utils.log.info("AUTO RESTART", "Scheduled restart triggered...");
			process.exit(2);
		}, Number(time));
	}
	else if (typeof time == "string" && time.match(/^((((\d+,)+\d+|(\d+(\/|-|#)\d+)|\d+L?|\*(\/\d+)?|L(-\d+)?|\?|[A-Z]{3}(-[A-Z]{3})?) ?){5,7})$/gmi)) {
		try {
			require("node-cron").schedule(time, () => {
				utils.log.info("AUTO RESTART", "Scheduled restart triggered...");
				process.exit(2);
			});
		}
		catch (e) { log.warn("AUTO RESTART", `Invalid cron "${time}": ${e.message}`); }
	}
}

// Optional, non-blocking Google services (a slow Google API must never delay the Facebook login)
const withTimeout = (promise, ms, label) => Promise.race([
	promise,
	new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms))
]);

async function initGoogleServices() {
	// Safe bypass: a dead/invalid Google token must never crash mail callers.
	global.utils.sendMail = async () => ({ skipped: true });

	try {
		const { gmailAccount } = config.credentials || {};
		if (gmailAccount && gmailAccount.email && gmailAccount.refreshToken && gmailAccount.clientId && gmailAccount.clientSecret) {
			const { google } = require("googleapis");
			const nodemailer = require("nodemailer");
			const OAuth2_client = new google.auth.OAuth2(gmailAccount.clientId, gmailAccount.clientSecret);
			OAuth2_client.setCredentials({ refresh_token: gmailAccount.refreshToken });
			const accessToken = await withTimeout(OAuth2_client.getAccessToken(), 15000, "Gmail token");
			const transporter = nodemailer.createTransport({
				host: "smtp.gmail.com",
				service: "Gmail",
				auth: {
					type: "OAuth2",
					user: gmailAccount.email,
					clientId: gmailAccount.clientId,
					clientSecret: gmailAccount.clientSecret,
					refreshToken: gmailAccount.refreshToken,
					accessToken
				}
			});
			global.utils.sendMail = async ({ to, subject, text, html, attachments }) =>
				await transporter.sendMail({ from: gmailAccount.email, to, subject, text, html, attachments });
			global.utils.transporter = transporter;
		}
	}
	catch (err) {
		log.warn("GMAIL_INIT", "Skipped Gmail setup: " + err.message);
	}

	try {
		if (utils.drive && typeof utils.drive.checkAndCreateParentFolder === "function") {
			utils.drive.parentID = await withTimeout(utils.drive.checkAndCreateParentFolder("AliyaBot"), 20000, "Google Drive");
		}
	}
	catch (err) {
		log.warn("GDRIVE_INIT", "Skipped Google Drive setup: " + err.message);
	}
}

(async () => {
	initGoogleServices().catch(() => { });
	console.log("\x1b[35m\x1b[1m👑 ALIYA V4 MASTER CORE\x1b[0m \x1b[90m|\x1b[0m \x1b[36mInitializing Multi-Account Login...\x1b[0m");
	require("./bot/login/login.js");
})();
