"use strict";

// Single source of truth: all privileged UIDs come from config.json.
// No UID is hard-coded in any command.
function config() {
	return (global.GoatBot && global.GoatBot.config) ||
		(global.config || {});
}

function adminIDs() {
	const cfg = config();
	return [...new Set([
		...(cfg.adminBot || cfg.ADMINBOT || []),
		...(cfg.developer || cfg.DEVELOPER || []),
		...(cfg.vipuser || cfg.VIPUSER || [])
	].map(String))];
}

function ownerID() {
	return adminIDs()[0] || "";
}

function prefix() {
	const cfg = config();
	return String(cfg.prefix || cfg.PREFIX || "(");
}

function botName() {
	const cfg = config();
	return String(cfg.nickNameBot || cfg.BOTNAME || "Aliya Bot V4");
}

module.exports = { config, adminIDs, ownerID, prefix, botName };
