// =============================================================================
// ALIYA OFFICIAL V4 - SUPERVISOR / UNIVERSAL LAUNCHER (index.js)
// Maintained by 0xMr_King x ┃ Tanin Islam
//
// Runs the same way on: Render, Railway, Replit, Termux, Linux, Ubuntu, VPS,
// VS Code terminal, Windows. (Vercel is serverless: a Messenger bot cannot stay
// online there, so it only hosts a status page, see vercel.json.)
//
// What this file does:
//   1. Opens the public PORT within ~100 ms, so host health checks pass while
//      the bot is still logging in. The bot runs on a private port and the
//      public server proxies the dashboard to it.
//   2. Starts Aliya.js (main engine) with an IPC channel and understands its
//      exit codes (table below). It restarts the bot after ANY exit, with a
//      smart back-off, so the server never stays off by accident.
//   3. If Aliya.js has a big problem (cannot run, syntax error, crash loop),
//      it starts Wolf.js (safe-mode engine) and tries Aliya.js again later.
//   4. When every account failed, it shows the "Restarting / Offline" page,
//      retries with back-off, and retries instantly when you edit a cookie file.
//   5. Detects a frozen bot (no heartbeat) and kills + restarts it.
//   6. Installs missing npm packages by itself (first boot and exit code 6).
//
// Exit codes (same table in Aliya.js and Wolf.js):
//   0  clean exit              -> restart in 1s
//   1  crash                   -> restart with back-off, Wolf.js after repeated crashes
//   2  planned restart         -> restart in 1s (memory guard, schedule, MQTT unstable)
//   3  every account failed    -> offline page, retry with back-off / on cookie edit
//   4  engine cannot run       -> switch to Wolf.js immediately
//   5  account dead / switched -> restart in 1s on the next account
//   6  npm package missing     -> npm install, then restart
//   7  fast restart requested  -> restart in 0.5s (admin account switch / Wolf hand-back)
//
// IPC messages from the bot (upper/lower case both accepted): HEARTBEAT, READY, POOL,
// ACCOUNT_CONNECTED, ALL_ACCOUNTS_FAILED, ENGINE_HANDBACK, ACCOUNT_SWITCH_REQUEST.
//
// Optional environment variables:
//   PORT                     public port (default 8080)
//   ALIYA_NO_PROXY=1         the bot owns the public port itself
//   ALIYA_MAX_MEM_MB         Node heap cap (default 60% of the real memory limit)
//   ALIYA_RSS_LIMIT_MB       bot restarts itself above this RSS (default 85%)
//   ALIYA_WOLF_AFTER         quick crashes in a row before Wolf.js (default 4)
//   ALIYA_WOLF_RETRY_MS      how long Wolf.js runs before trying Aliya.js again (default 900000)
//   ALIYA_OFFLINE_DELAYS_S   retry delays when all accounts failed (default 30,60,120,300,600,900)
//   ALIYA_HEARTBEAT_TIMEOUT_MS  freeze limit (default 120000)
//   ALIYA_SELF_URL           public URL used for the keep-awake ping (auto-detected on Render/Railway/Replit)
//   ALIYA_SELF_PING=0        disable the keep-awake ping
// =============================================================================

"use strict";

const { spawn, spawnSync } = require("child_process");
const http = require("http");
const https = require("https");
const net = require("net");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = __dirname;
const PKG_VERSION = require("./package.json").version;
const MAIN_FILE = "Aliya.js";
const WOLF_FILE = "Wolf.js";
const SYNTAX_CHECK_FILES = [
	MAIN_FILE,
	path.join("bot", "login", "login.js"),
	path.join("bot", "handler", "handlerEvents.js"),
	path.join("bot", "handler", "handlerAction.js"),
	path.join("bot", "handler", "commandLanguage.js"),
	path.join("bot", "handler", "typingIndicator.js"),
	path.join("database", "controller", "index.js")
];

function envMs(name, fallback) {
	const raw = process.env[name];
	if (raw === undefined || raw === "") return fallback;
	const n = Number(raw);
	return Number.isFinite(n) && n >= 0 ? n : fallback;
}

const REQUESTED_PORT = Number(process.env.PORT) || 8080;
let useProxy = process.env.ALIYA_NO_PROXY !== "1";
const QUICK_RESTART_MS = envMs("ALIYA_QUICK_RESTART_MS", 1000);
const BASE_BACKOFF_MS = envMs("ALIYA_BASE_BACKOFF_MS", 2000);
const MAX_BACKOFF_MS = envMs("ALIYA_MAX_BACKOFF_MS", 300000);
const STABLE_AFTER_MS = envMs("ALIYA_STABLE_AFTER_MS", 120000);
const HEARTBEAT_TIMEOUT_MS = envMs("ALIYA_HEARTBEAT_TIMEOUT_MS", 120000);
// A child that is alive but never sends READY is stuck in login/loading. Kill it
// instead of leaving the server in "starting" forever.
const STARTUP_TIMEOUT_MS = envMs("ALIYA_STARTUP_TIMEOUT_MS", 6 * 60 * 1000);
const WOLF_AFTER = Math.max(1, envMs("ALIYA_WOLF_AFTER", 4));
const WOLF_RETRY_MS = envMs("ALIYA_WOLF_RETRY_MS", 15 * 60 * 1000);
const ACCOUNT_POLL_MS = envMs("ALIYA_ACCOUNT_POLL_MS", 5000);
const FREEZE_CHECK_MS = Math.max(200, envMs("ALIYA_FREEZE_CHECK_MS", 15000));
const OFFLINE_DELAYS_MS = (process.env.ALIYA_OFFLINE_DELAYS_S || "30,60,120,300,600,900")
	.split(",").map(s => Number(s.trim()) * 1000).filter(n => Number.isFinite(n) && n >= 0);
if (!OFFLINE_DELAYS_MS.length) OFFLINE_DELAYS_MS.push(60000);

const BANNER = `
  █████╗ ██╗     ██╗██╗   ██╗ █████╗     ██╗   ██╗██╗  ██╗
 ██╔══██╗██║     ██║╚██╗ ██╔╝██╔══██╗    ██║   ██║██║  ██║
 ███████║██║     ██║ ╚████╔╝ ███████║    ██║   ██║███████║
 ██╔══██║██║     ██║  ╚██╔╝  ██╔══██║    ╚██╗ ██╔╝╚════██║
 ██║  ██║███████╗██║   ██║   ██║  ██║     ╚████╔╝      ██║
 ╚═╝  ╚═╝╚══════╝╚═╝   ╚═╝   ╚═╝  ╚═╝      ╚═══╝       ╚═╝
`;

// ───────────────────────────── state ───────────────────────────── //

let mode = "main";               // "main" = Aliya.js, "wolf" = Wolf.js
let child = null;
let childStartedAt = 0;
let botPort = null;              // private port of the running bot (null = not running)
let publicPort = REQUESTED_PORT;
let publicServer = null;
let shuttingDown = false;
let starting = false;
let installing = false;
let restartTimer = null;
let wolfTimer = null;
let offlinePoll = null;
let switchTarget = null;         // "main" | "wolf" while we are stopping the child on purpose
let launchCount = 0;
let failStreak = 0;              // quick crashes in a row (not counting account switches)
let accountSwitches = 0;
let totalCrashes = 0;
let ready = false;               // the running child logged in and finished loading
let gotHeartbeat = false;
let lastHeartbeat = 0;
let lastTick = Date.now();
let activeAccount = null;
let lastPool = null;
let lastOfflineReason = "";
let offline = null;              // null = fine, object = all accounts failed
let wolfSince = 0;
let lastExitInfo = "none yet";
let nextRestartAt = 0;
const switchTimes = [];
const npmTries = [];

// ───────────────────────────── helpers ───────────────────────────── //

function now() {
	return new Date().toTimeString().split(" ")[0];
}

function log(tag, msg) {
	console.log(`[${now()}] [${tag}] ${msg}`);
}

function formatUptime(sec) {
	const d = Math.floor(sec / 86400);
	const h = Math.floor((sec % 86400) / 3600);
	const m = Math.floor((sec % 3600) / 60);
	const s = Math.floor(sec % 60);
	return `${d}d ${h}h ${m}m ${s}s`;
}

function fileOk(rel) {
	try { return fs.statSync(path.join(ROOT, rel)).isFile(); }
	catch (e) { return false; }
}

function isChildRunning() {
	// child.killed becomes true as soon as kill() is called, while the process may
	// still be alive. exitCode/signalCode only change once it really exited.
	return child !== null && child.exitCode === null && child.signalCode === null;
}

function getFreePort() {
	return new Promise((resolve, reject) => {
		const tester = net.createServer();
		tester.once("error", reject);
		tester.listen(0, "127.0.0.1", () => {
			const port = tester.address().port;
			tester.close(() => resolve(port));
		});
	});
}

function detectMemLimitMB() {
	let limit = os.totalmem();
	for (const file of ["/sys/fs/cgroup/memory.max", "/sys/fs/cgroup/memory/memory.limit_in_bytes"]) {
		try {
			const value = Number(fs.readFileSync(file, "utf8").trim());
			if (Number.isFinite(value) && value > 0 && value < limit) limit = value;
		}
		catch (e) { /* not a container */ }
	}
	return Math.floor(limit / 1048576);
}

const MEM_LIMIT_MB = detectMemLimitMB();
// Heap cap = 60% of the real memory limit: Node runs GC harder instead of being OOM-killed.
const HEAP_MB = Number(process.env.ALIYA_MAX_MEM_MB) || Math.min(4096, Math.max(192, Math.floor(MEM_LIMIT_MB * 0.6)));
// The bot restarts itself cleanly above this RSS (see Aliya.js memory guard).
const RSS_LIMIT_MB = envMs("ALIYA_RSS_LIMIT_MB", Math.min(6144, Math.max(256, Math.floor(MEM_LIMIT_MB * 0.85))));

// All account files: account.txt, account2.txt ... (and account.dev.txt)
function accountSnapshot() {
	try {
		return fs.readdirSync(ROOT)
			.filter(f => /^account\d*(\.dev)?\.txt$/.test(f))
			.sort()
			.map(f => {
				const st = fs.statSync(path.join(ROOT, f));
				return `${f}:${st.size}:${Math.floor(st.mtimeMs)}`;
			})
			.join("|");
	}
	catch (e) { return ""; }
}

// Pool info from the bot goes to the public /health page, so cookies and secrets are stripped.
const SECRET_KEY = /cookie|appstate|token|password|secret|^value$|^xs$|c_user|session/i;
const SECRET_TEXT = /c_user=|xs=|EAAA[A-Za-z0-9]/;
function sanitize(v, depth = 0) {
	if (v === null || v === undefined) return v;
	if (typeof v === "string") {
		if (SECRET_TEXT.test(v)) return "[hidden]";
		return v.length > 140 ? v.slice(0, 140) + "..." : v;
	}
	if (typeof v === "number" || typeof v === "boolean") return v;
	if (depth > 3) return undefined;
	if (Array.isArray(v)) return v.slice(0, 20).map(x => sanitize(x, depth + 1));
	if (typeof v === "object") {
		const out = {};
		for (const k of Object.keys(v).slice(0, 30)) {
			if (SECRET_KEY.test(k)) continue;
			const s = sanitize(v[k], depth + 1);
			if (s !== undefined) out[k] = s;
		}
		return out;
	}
	return undefined;
}

function poolRows(pool) {
	let list = [];
	if (Array.isArray(pool)) list = pool;
	else if (pool && typeof pool === "object")
		list = Object.entries(pool).map(([k, v]) => (v && typeof v === "object" && !Array.isArray(v)) ? { name: k, ...v } : { name: k, status: v });
	return list.slice(0, 10).map(item => {
		if (item && typeof item === "object")
			return Object.values(item).filter(x => ["string", "number", "boolean"].includes(typeof x)).map(String).join("  |  ");
		return String(item);
	}).filter(Boolean);
}

const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c]));

function renderPage({ heading, color, message, rows = [], refresh = 10 }) {
	return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="${refresh}"><title>Aliya Official V4</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:radial-gradient(circle at 20% 20%,#3a0ca3,#10002b 45%,#000);font-family:system-ui,sans-serif;color:#fff;text-align:center}.card{width:min(92vw,520px);padding:32px 24px}h1{margin:0 0 12px;color:${color}}p{opacity:.85;line-height:1.5}.row{font-size:13px;opacity:.75;padding:6px 0;border-top:1px solid rgba(255,255,255,.12)}</style></head>
<body><div class="card"><h1>${esc(heading)}</h1><p>${esc(message)}</p>${rows.map(r => `<div class="row">${esc(r)}</div>`).join("")}<p style="font-size:12px;opacity:.5">This page refreshes by itself.</p></div></body></html>`;
}

function currentPage() {
	if (offline && !ready) {
		return renderPage({
			heading: "Aliya Bot Server Restarting / Offline",
			color: "#ff4d6d",
			message: "All accounts (account.txt to account5.txt) failed or are suspended. The bot retries automatically, and immediately after you update a cookie file.",
			rows: poolRows(lastPool)
		});
	}
	if (mode === "wolf") {
		return renderPage({
			heading: "Aliya Safe Mode (Wolf)",
			color: "#ffb703",
			message: "The main engine had a problem, so the safe-mode engine is keeping the bot online. The main engine is retried automatically.",
			rows: poolRows(lastPool),
			refresh: 15
		});
	}
	return renderPage({ heading: "ALIYA V4", color: "#4cc9f0", message: "Bot is starting. This page refreshes by itself.", refresh: 5 });
}

function stateName() {
	if (offline && !ready) return "offline";
	if (!botPort && useProxy) return "starting";
	if (!ready) return "starting";
	return mode === "wolf" ? "safe-mode" : "online";
}

// ─────────────────────── public server (health + proxy) ─────────────────────── //

function isPageRequest(req) {
	return (req.method === "GET" || req.method === "HEAD") && (req.url === "/" || req.url.startsWith("/?"));
}

function sendFallback(req, res) {
	if (res.headersSent) return res.destroy();
	if (isPageRequest(req)) {
		res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
		return res.end(currentPage());
	}
	res.writeHead(503, { "Content-Type": "application/json; charset=utf-8", "Retry-After": "5" });
	res.end(JSON.stringify({ status: stateName() }));
}

function handleHealth(res) {
	res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" });
	res.end(JSON.stringify({
		status: stateName(),
		engine: mode === "wolf" ? WOLF_FILE : MAIN_FILE,
		activeAccount,
		accounts: sanitize(lastPool) || null,
		offlineReason: offline && !ready ? (lastOfflineReason || "all accounts failed") : undefined,
		nextRetryInSec: nextRestartAt ? Math.max(0, Math.ceil((nextRestartAt - Date.now()) / 1000)) : 0,
		restartPending: nextRestartAt > Date.now(),
		launches: launchCount,
		crashes: totalCrashes,
		accountSwitches,
		lastExit: lastExitInfo,
		uptime: formatUptime(process.uptime()),
		uptimeSec: Math.floor(process.uptime()),
		memoryMB: Math.round(process.memoryUsage().rss / 1048576),
		platform: `${process.platform}/${process.arch}`,
		node: process.version,
		version: PKG_VERSION
	}));
}

function proxyHttp(req, res) {
	// While every account is dead the engine's own pages mean nothing: show ours.
	if ((offline && !ready) && isPageRequest(req)) return sendFallback(req, res);
	if (!botPort) return sendFallback(req, res);
	const upstream = http.request(
		{ host: "127.0.0.1", port: botPort, method: req.method, path: req.url, headers: req.headers },
		upstreamRes => {
			res.writeHead(upstreamRes.statusCode, upstreamRes.headers);
			upstreamRes.pipe(res);
		}
	);
	upstream.on("error", () => sendFallback(req, res));
	res.on("close", () => { if (!res.writableEnded) upstream.destroy(); });
	req.pipe(upstream);
}

function proxyUpgrade(req, socket, head) {
	if (!botPort) return socket.destroy();
	const upstream = net.connect(botPort, "127.0.0.1", () => {
		let raw = `${req.method} ${req.url} HTTP/${req.httpVersion}\r\n`;
		for (let i = 0; i < req.rawHeaders.length; i += 2)
			raw += `${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}\r\n`;
		upstream.write(raw + "\r\n");
		if (head && head.length) upstream.write(head);
		socket.pipe(upstream).pipe(socket);
	});
	upstream.on("error", () => socket.destroy());
	socket.on("error", () => upstream.destroy());
	socket.on("close", () => upstream.destroy());
	upstream.on("close", () => socket.destroy());
}

function listenOn(server, port) {
	return new Promise((resolve, reject) => {
		const onError = err => reject(err);
		server.once("error", onError);
		server.listen(port, "0.0.0.0", () => {
			server.removeListener("error", onError);
			resolve(server.address().port);
		});
	});
}

async function openPublicServer() {
	publicServer = http.createServer((req, res) => {
		const cleanUrl = String(req.url || "").split("?")[0];
		if (["/health", "/healthz", "/status.json", "/api/status"].includes(cleanUrl)) return handleHealth(res);
		proxyHttp(req, res);
	});
	publicServer.keepAliveTimeout = 65000;
	publicServer.on("upgrade", proxyUpgrade);
	publicServer.on("clientError", (err, socket) => socket.destroy());

	// Wanted port busy? Try the next ones, then any free port.
	const candidates = [REQUESTED_PORT, REQUESTED_PORT + 1, REQUESTED_PORT + 2, 0];
	for (const port of candidates) {
		try {
			publicPort = await listenOn(publicServer, port);
			if (port !== REQUESTED_PORT)
				log("PORT", `Port ${REQUESTED_PORT} is busy. Using port ${publicPort} instead.`);
			log("SERVER", `Public port ${publicPort} is open (health: /health)`);
			publicServer.on("error", err => log("SERVER", `Server error: ${err.message}`));
			return;
		}
		catch (err) {
			if (err.code !== "EADDRINUSE" && err.code !== "EACCES") throw err;
		}
	}
	throw new Error("No free port found");
}

// ─────────────────────── npm install helper ─────────────────────── //

function runNpmInstall(reason) {
	if (installing) return Promise.resolve(false);
	if (!fileOk("package.json")) {
		log("INSTALL", "package.json not found, skipping npm install.");
		return Promise.resolve(false);
	}
	installing = true;
	log("INSTALL", `${reason} - running npm install (this can take a few minutes)...`);
	return new Promise(resolve => {
		let installer;
		const finish = ok => { installing = false; resolve(ok); };
		try {
			installer = spawn(
				process.platform === "win32" ? "npm.cmd" : "npm",
				["install", "--omit=dev", "--no-audit", "--no-fund", "--loglevel=error"],
				{ cwd: ROOT, stdio: "inherit", shell: process.platform === "win32" }
			);
		}
		catch (e) {
			log("INSTALL", `Could not run npm: ${e.message}. Run it manually: npm install`);
			return finish(false);
		}
		const killer = setTimeout(() => { try { installer.kill("SIGKILL"); } catch (e) { /* ignore */ } }, 15 * 60 * 1000);
		installer.on("error", e => { clearTimeout(killer); log("INSTALL", `npm error: ${e.message}`); finish(false); });
		installer.on("exit", code => {
			clearTimeout(killer);
			if (code === 0) log("INSTALL", "Dependencies installed.");
			else log("INSTALL", `npm install failed (code ${code}). Run it manually: npm install`);
			finish(code === 0);
		});
	});
}

async function ensureDependencies() {
	if (fs.existsSync(path.join(ROOT, "node_modules", "express"))) return;
	await runNpmInstall("node_modules not found");
}

// ─────────────────────── engine selection (Aliya / Wolf) ─────────────────────── //

function wolfAvailable() {
	return fileOk(WOLF_FILE);
}

function checkMainFiles() {
	if (!fileOk(MAIN_FILE)) return { ok: false, reason: `${MAIN_FILE} is missing` };
	for (const rel of SYNTAX_CHECK_FILES) {
		if (!fileOk(rel)) continue;
		const r = spawnSync(process.execPath, ["--check", path.join(ROOT, rel)], { cwd: ROOT, timeout: 20000, encoding: "utf8" });
		if (r.status !== 0) {
			const firstLines = String(r.stderr || r.error || "").split("\n").filter(Boolean).slice(0, 4).join(" / ");
			return { ok: false, reason: `syntax error in ${rel}: ${firstLines}` };
		}
	}
	return { ok: true };
}

function enterWolf(reason) {
	mode = "wolf";
	wolfSince = Date.now();
	log("WOLF", `Switching to ${WOLF_FILE} (${reason}). ${MAIN_FILE} is retried in ${WOLF_RETRY_MS >= 120000 ? Math.round(WOLF_RETRY_MS / 60000) + " min" : Math.round(WOLF_RETRY_MS / 1000) + " s"}.`);
	if (wolfTimer) clearTimeout(wolfTimer);
	wolfTimer = setTimeout(tryMainAgain, WOLF_RETRY_MS);
}

function leaveWolfTimer() {
	if (wolfTimer) { clearTimeout(wolfTimer); wolfTimer = null; }
}

function tryMainAgain() {
	wolfTimer = null;
	if (shuttingDown || mode !== "wolf") return;
	const check = checkMainFiles();
	if (!check.ok) {
		log("WOLF", `${MAIN_FILE} is still broken (${check.reason}). Staying in safe mode.`);
		wolfTimer = setTimeout(tryMainAgain, WOLF_RETRY_MS);
		return;
	}
	log("WOLF", `${MAIN_FILE} looks healthy again. Switching back from ${WOLF_FILE}...`);
	requestSwitch("main");
}

// Stops the running child on purpose and starts the other engine afterwards.
function requestSwitch(target) {
	if (!isChildRunning()) { mode = target; if (target === "main") leaveWolfTimer(); return; }
	switchTarget = target;
	stopChild();
}

function stopChild() {
	if (!isChildRunning()) return;
	const c = child;
	try { c.kill("SIGTERM"); } catch (e) { /* ignore */ }
	setTimeout(() => { try { if (c.exitCode === null) c.kill("SIGKILL"); } catch (e) { /* ignore */ } }, 5000);
}

function resolveRunTarget() {
	if (mode === "main") {
		const check = checkMainFiles();
		if (check.ok) return MAIN_FILE;
		if (wolfAvailable()) {
			enterWolf(check.reason);
			return WOLF_FILE;
		}
		log("ERROR", `Main engine problem and ${WOLF_FILE} is missing: ${check.reason}`);
		return MAIN_FILE; // let node print the real error; back-off protects the host
	}
	if (!wolfAvailable()) {
		log("WOLF", `${WOLF_FILE} not found. Going back to ${MAIN_FILE}.`);
		mode = "main";
		leaveWolfTimer();
		return MAIN_FILE;
	}
	return WOLF_FILE;
}

// ───────────────────────────── bot process ───────────────────────────── //

async function startBot() {
	if (shuttingDown || starting || installing || isChildRunning()) return;
	if (restartTimer) {
		clearTimeout(restartTimer);
		restartTimer = null;
		nextRestartAt = 0;
	}

	starting = true;
	let privatePort;
	try {
		privatePort = useProxy ? await getFreePort() : publicPort;
	}
	catch (e) {
		starting = false;
		log("PORT_FAIL", e.message);
		return scheduleRestart(BASE_BACKOFF_MS);
	}
	const targetFile = resolveRunTarget();
	starting = false;
	if (shuttingDown) return;

	launchCount++;
	ready = false;
	gotHeartbeat = false;
	lastHeartbeat = Date.now();
	console.log("\n" + BANNER);
	console.log(" ╔═══════════════════════════════════════════════════════════╗");
	console.log(" ║              ALIYA OFFICIAL V4 ENGINE                     ║");
	console.log(" ║              DEVELOPER : 0xMr_King x ┃ Tanin Islam                          ║");
	console.log(` ║              ENGINE    : ${targetFile.padEnd(33)}║`);
	console.log(` ║              LAUNCH    : ${String(launchCount).padEnd(33)}║`);
	console.log(" ╚═══════════════════════════════════════════════════════════╝\n");

	try {
		child = spawn(process.execPath, [`--max-old-space-size=${HEAP_MB}`, targetFile], {
			cwd: ROOT,
			stdio: ["inherit", "inherit", "inherit", "ipc"],
			shell: false,
			env: {
				NODE_NO_WARNINGS: "1",
				...process.env,
				PORT: String(privatePort),
				ALIYA_PUBLIC_PORT: String(publicPort),
				ALIYA_SUPERVISED: "1",
				ALIYA_MODE: mode,
				ALIYA_RSS_LIMIT_MB: String(RSS_LIMIT_MB)
			}
		});
	}
	catch (error) {
		child = null;
		log("SPAWN_FAIL", `Failed to start ${targetFile}: ${error.message}`);
		return scheduleRestart(BASE_BACKOFF_MS);
	}

	childStartedAt = Date.now();
	if (useProxy) botPort = privatePort;
	log("SYSTEM", `${targetFile} spawned | PID ${child.pid} | heap cap ${HEAP_MB}MB | RSS limit ${RSS_LIMIT_MB}MB`);

	child.on("error", error => log("PROCESS_ERR", `Error in ${targetFile}: ${error.message}`));
	child.on("message", handleChildMessage);
	child.on("exit", (code, signal) => handleChildExit(targetFile, code, signal));
}

function handleChildMessage(m) {
	if (!m || typeof m !== "object") return;
	// Aliya.js sends upper case, older Wolf builds sent lower case. Accept both.
	const type = String(m.type || m.Type || "").toUpperCase();
	switch (type) {
		case "HEARTBEAT":
			gotHeartbeat = true;
			lastHeartbeat = Date.now();
			break;
		case "POOL":
			lastPool = sanitize(m.pool) || null;
			if (m.active !== undefined) activeAccount = typeof m.active === "string" ? m.active : null;
			break;
		case "ACCOUNT_CONNECTED":
			activeAccount = typeof m.account === "string" ? m.account : activeAccount;
			log("ACCOUNT", `Connected with ${activeAccount || "an account"}`);
			break;
		case "READY":
			ready = true;
			offline = null;
			stopOfflinePoll();
			if (typeof m.account === "string") activeAccount = m.account;
			if (m.pool) lastPool = sanitize(m.pool);
			log("READY", `Bot is online${activeAccount ? " on " + activeAccount : ""}.`);
			break;
		case "ALL_ACCOUNTS_FAILED":
			lastPool = sanitize(m.pool) || lastPool;
			lastOfflineReason = typeof m.reason === "string" ? m.reason.slice(0, 200) : "all accounts failed";
			if (!offline) offline = { since: Date.now(), attempt: -1, snapshot: accountSnapshot() };
			break;
		case "ENGINE_HANDBACK":
			log("ENGINE", `${mode === "wolf" ? WOLF_FILE : MAIN_FILE} asked for the main engine.`);
			if (mode === "wolf") requestSwitch("main");
			else { switchTarget = mode; stopChild(); }
			break;
		case "ACCOUNT_SWITCH_REQUEST":
			log("ACCOUNT", "Account switch requested by an admin. Restarting quickly...");
			switchTarget = mode;
			stopChild();
			break;
		default:
			break;
	}
}

function handleChildExit(targetFile, code, signal) {
	const ranMs = Date.now() - childStartedAt;
	child = null;
	botPort = null;
	ready = false;
	lastExitInfo = `${targetFile} code=${code} signal=${signal} after ${formatUptime(ranMs / 1000)} at ${new Date().toISOString()}`;
	log("EXIT", `${targetFile} stopped | code ${code} | signal ${signal} | ran ${formatUptime(ranMs / 1000)}`);
	if (shuttingDown) return;

	// planned engine switch (Wolf <-> Aliya)
	if (switchTarget) {
		const target = switchTarget;
		switchTarget = null;
		mode = target;
		if (target === "main") {
			leaveWolfTimer();
			failStreak = Math.max(0, WOLF_AFTER - 2); // two more quick crashes send us back to Wolf
		}
		else failStreak = 0;
		return scheduleRestart(500);
	}

	switch (code) {
		case 3: return handleAllAccountsFailed();
		case 4: return handleCannotRun(targetFile);
		case 5: return handleAccountSwitch();
		case 6: return handleMissingPackage(ranMs);
		case 7: return handleQuickRestart(targetFile);
		case 2:
			if (ranMs >= 60000) {
				failStreak = 0;
				return scheduleRestart(QUICK_RESTART_MS);
			}
			break; // a restart request seconds after start is a crash loop, handled below
		default:
			break;
	}
	handleCrash(ranMs);
}

function handleCrash(ranMs) {
	totalCrashes++;
	failStreak = ranMs >= STABLE_AFTER_MS ? 1 : failStreak + 1;
	let delay = ranMs >= STABLE_AFTER_MS
		? QUICK_RESTART_MS
		: Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** (failStreak - 1));

	if (mode === "main" && wolfAvailable() && failStreak >= WOLF_AFTER && ranMs < STABLE_AFTER_MS) {
		enterWolf(`${failStreak} quick crashes in a row`);
		failStreak = 0;
		delay = QUICK_RESTART_MS;
	}
	log("AUTO_HEAL", `Bot ended unexpectedly (quick-crash streak ${failStreak}). Server stays ON.`);
	scheduleRestart(delay);
}

function handleCannotRun(targetFile) {
	if (mode === "main" && wolfAvailable()) {
		enterWolf(`${targetFile} reported that it cannot run`);
		failStreak = 0;
		return scheduleRestart(QUICK_RESTART_MS);
	}
	log("ERROR", `${targetFile} cannot run and there is no other engine to use. Retrying with back-off.`);
	if (mode === "wolf") { mode = "main"; leaveWolfTimer(); }
	totalCrashes++;
	failStreak++;
	scheduleRestart(Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** Math.min(failStreak, 8)));
}

// Code 7: the child asked for a fast restart (admin account switch, Wolf
// handing back, manual rotate). It is a planned action, never a crash.
function handleQuickRestart(targetFile) {
	failStreak = 0;
	log("RECOVERY", `${targetFile} requested a fast restart. Server stays ON.`);
	if (mode === "wolf") {
		mode = "main";
		leaveWolfTimer();
	}
	return scheduleRestart(500, true);
}

function handleAccountSwitch() {
	accountSwitches++;
	failStreak = 0;
	const t = Date.now();
	switchTimes.push(t);
	while (switchTimes.length && t - switchTimes[0] > 10 * 60 * 1000) switchTimes.shift();
	// Back off harder when accounts keep failing/switching (blocked cookies, checkpoints, etc.)
	const n = switchTimes.length;
	const delay = n <= 1 ? 5000
		: n <= 3 ? 15000
		: n <= 6 ? 60000
		: n <= 10 ? 180000
		: 300000;
	log("ACCOUNT", `Account changed or lost. Restarting on the next account in ${Math.round(delay / 1000)}s...`);
	scheduleRestart(delay);
}

async function handleMissingPackage(ranMs) {
	const t = Date.now();
	while (npmTries.length && t - npmTries[0] > 10 * 60 * 1000) npmTries.shift();
	npmTries.push(t);
	if (npmTries.length > 3) {
		log("INSTALL", "A package is still missing after 3 installs. Treating this as a crash.");
		return handleCrash(ranMs);
	}
	scheduleRestart(60 * 60 * 1000); // placeholder timer so the watchdog does not start the bot during install
	await runNpmInstall("A package is missing");
	scheduleRestart(QUICK_RESTART_MS, true);
}

// All accounts failed: offline page + retry with back-off, or at once when a cookie file changes.
function handleAllAccountsFailed() {
	const prev = offline;
	offline = {
		since: prev ? prev.since : Date.now(),
		attempt: prev ? prev.attempt + 1 : 0,
		snapshot: accountSnapshot()
	};
	failStreak = 0;
	const delay = OFFLINE_DELAYS_MS[Math.min(offline.attempt, OFFLINE_DELAYS_MS.length - 1)];
	log("OFFLINE", `All accounts failed or are suspended. Offline page is live. Retry in ${Math.round(delay / 1000)}s, or instantly when you edit an account file.`);
	startOfflinePoll();
	scheduleRestart(delay, true);
}

function startOfflinePoll() {
	if (offlinePoll) return;
	offlinePoll = setInterval(() => {
		if (!offline) return stopOfflinePoll();
		if (isChildRunning() || installing) return;
		const snap = accountSnapshot();
		if (snap !== offline.snapshot) {
			log("OFFLINE", "An account file was changed. Retrying now...");
			offline.snapshot = snap;
			offline.attempt = -1;
			scheduleRestart(0, true);
		}
	}, ACCOUNT_POLL_MS);
}

function stopOfflinePoll() {
	if (offlinePoll) { clearInterval(offlinePoll); offlinePoll = null; }
}

function scheduleRestart(delay, force = false) {
	if (shuttingDown) return;
	if (restartTimer) {
		if (!force) return;
		clearTimeout(restartTimer);
	}
	if (delay > 0) log("RECOVERY", `Starting again in ${Math.round(delay / 1000)}s...`);
	nextRestartAt = Date.now() + delay;
	restartTimer = setTimeout(() => {
		restartTimer = null;
		nextRestartAt = 0;
		startBot();
	}, delay);
}

// ───────────────────────────── watchdogs ───────────────────────────── //

// Nothing running and nothing scheduled: start it.
setInterval(() => {
	if (!shuttingDown && !isChildRunning() && !restartTimer && !starting && !installing) {
		log("WATCHDOG", "Bot is inactive. Forcing start...");
		startBot();
	}
}, 10000);

// Frozen bot (event loop blocked): the heartbeat stops, so kill it and let recovery restart it.
setInterval(() => {
	const t = Date.now();
	const gap = t - lastTick;
	lastTick = t;
	if (gap > Math.max(45000, FREEZE_CHECK_MS * 3)) { // this machine was suspended (laptop sleep, phone doze): do not blame the bot
		lastHeartbeat = t;
		return;
	}
	if (isChildRunning() && gotHeartbeat && t - lastHeartbeat > HEARTBEAT_TIMEOUT_MS) {
		log("FREEZE", `No heartbeat for ${Math.round((t - lastHeartbeat) / 1000)}s. Killing the frozen bot...`);
		lastHeartbeat = t;
		try { child.kill("SIGKILL"); } catch (e) { /* ignore */ }
	}
}, FREEZE_CHECK_MS);

// Login/loading hang: the process is alive and sends heartbeats but never said READY.
// Kill it so recovery can put it on the next account instead of hanging forever.
setInterval(() => {
	if (!isChildRunning() || ready || shuttingDown) return;
	if (Date.now() - childStartedAt < STARTUP_TIMEOUT_MS) return;
	log("STARTUP_TIMEOUT", `No READY after ${Math.round(STARTUP_TIMEOUT_MS / 1000)}s. Killing this login attempt...`);
	lastHeartbeat = Date.now();
	try { child.kill("SIGKILL"); } catch (e) { /* ignore */ }
}, Math.max(200, Math.min(FREEZE_CHECK_MS, 30000)));

// A status line in the logs every 10 minutes.
setInterval(() => {
	log("STATUS", `${stateName()} | engine ${mode === "wolf" ? WOLF_FILE : MAIN_FILE} | account ${activeAccount || "-"} | launches ${launchCount} | switches ${accountSwitches} | up ${formatUptime(process.uptime())} | ${Math.round(process.memoryUsage().rss / 1048576)}MB`);
}, 10 * 60 * 1000);

// Keep-awake ping for free hosts that sleep without incoming traffic (Render free, Replit).
function selfUrl() {
	if (process.env.ALIYA_SELF_URL) return process.env.ALIYA_SELF_URL;
	if (process.env.RENDER_EXTERNAL_URL) return process.env.RENDER_EXTERNAL_URL;
	if (process.env.RAILWAY_PUBLIC_DOMAIN) return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
	if (process.env.REPLIT_DEV_DOMAIN) return `https://${process.env.REPLIT_DEV_DOMAIN}`;
	if (process.env.REPL_SLUG && process.env.REPL_OWNER) return `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`;
	return null;
}

function startSelfPing() {
	const url = selfUrl();
	if (!url || process.env.ALIYA_SELF_PING === "0" || !useProxy) return;
	const target = url.replace(/\/+$/, "") + "/health";
	const client = target.startsWith("https") ? https : http;
	log("KEEP_AWAKE", `Self-ping every 4 minutes: ${target}`);
	setInterval(() => {
		try {
			const req = client.get(target, { timeout: 10000 }, res => res.resume());
			req.on("timeout", () => req.destroy());
			req.on("error", () => { /* host asleep or offline: ignore */ });
		}
		catch (e) { /* ignore */ }
	}, 4 * 60 * 1000);
}

// ───────────────────────────── shutdown ───────────────────────────── //

function shutdown(signal) {
	if (shuttingDown) return;
	shuttingDown = true;
	log("SHUTDOWN", `${signal} received. Cleaning up...`);
	if (restartTimer) clearTimeout(restartTimer);
	nextRestartAt = 0;
	leaveWolfTimer();
	stopOfflinePoll();
	if (publicServer) try { publicServer.close(); } catch (e) { /* ignore */ }

	if (isChildRunning()) {
		const c = child;
		try { c.kill("SIGTERM"); } catch (e) { /* ignore */ }
		const hard = setTimeout(() => {
			try { c.kill("SIGKILL"); } catch (e) { /* ignore */ }
			process.exit(0);
		}, 5000);
		c.once("exit", () => { clearTimeout(hard); process.exit(0); });
	}
	else process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGHUP", () => log("SIGNAL", "Terminal closed (SIGHUP) - ignoring, bot keeps running."));
process.on("uncaughtException", err => log("UNCAUGHT", err && err.message));
process.on("unhandledRejection", err => log("UNHANDLED", err && err.message ? err.message : String(err)));
process.stdout.on("error", () => { /* EPIPE when the terminal closes */ });
process.stderr.on("error", () => { /* same */ });

// ───────────────────────────── go! ───────────────────────────── //

(async () => {
	log("ENV", `Node ${process.version} | ${process.platform}/${process.arch} | memory limit ${MEM_LIMIT_MB}MB`);
	if (process.env.VERCEL === "1" && process.env.ALIYA_SERVERLESS_BOT !== "1") {
		log("SERVERLESS", "Vercel uses api/status.js for the status page. A Messenger bot cannot stay online on a serverless function; deploy the bot on Render/Railway/Replit/VPS.");
		return; // never spawn a long-running child inside a serverless invocation
	}
	if (useProxy) {
		try {
			await openPublicServer();
		}
		catch (err) {
			log("SERVER", `Could not open public server: ${err.message}. Falling back to a bot-owned port.`);
			useProxy = false;
			publicServer = null;
			publicPort = REQUESTED_PORT;
		}
	}
	else publicPort = REQUESTED_PORT; // proxy off: the bot opens PORT itself
	startSelfPing();
	await ensureDependencies();
	startBot();
})();
