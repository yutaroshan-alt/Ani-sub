'use strict';
// Shared core for all (pair) commands.
// Guarantees: offline font conversion, gender-safe match selection,
// timeout + fallback for every remote image, and safe output cleanup.

const axios = require('axios');
const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');
const path = require('path');
const { convert: convertStyle } = require('./textEngine.js');

const AVATAR_TOKEN = '6628568379%7Cc1e620fa708a1d5696fb991c1bde5662';
const IMAGE_TIMEOUT = 8000;
const CACHE_DIR = path.join(__dirname, 'scripts', 'cmds', 'cache');

function avatarUrl(id) {
	return `https://graph.facebook.com/${id}/picture?width=720&height=720&access_token=${AVATAR_TOKEN}`;
}

// Facebook returns gender as 1/2 (older API) or "male"/"female" (GraphQL).
function resolveGender(value) {
	if (value == null) return null;
	if (typeof value === 'number') {
		if (value === 2) return 'MALE';
		if (value === 1) return 'FEMALE';
		return null;
	}
	const s = String(value).trim().toUpperCase();
	if (s === 'MALE' || s === '2' || s === 'M') return 'MALE';
	if (s === 'FEMALE' || s === '1' || s === 'F') return 'FEMALE';
	return null;
}

// Pick an opposite-gender member when possible, otherwise any other member.
// This makes the command work even when gender data is missing entirely.
function pickMatch(users, senderID) {
	const list = Array.isArray(users) ? users.filter(u => u && u.id) : [];
	const others = list.filter(u => String(u.id) !== String(senderID));
	if (!others.length) return null;

	const me = list.find(u => String(u.id) === String(senderID));
	const myGender = resolveGender(me && me.gender);
	if (myGender) {
		const opposite = myGender === 'MALE' ? 'FEMALE' : 'MALE';
		const candidates = others.filter(u => resolveGender(u.gender) === opposite);
		if (candidates.length)
			return candidates[Math.floor(Math.random() * candidates.length)];
	}
	return others[Math.floor(Math.random() * others.length)];
}

function convertName(text, fallback) {
	const value = String(text || '').trim() || String(fallback || '');
	return convertStyle(value, 'bold');
}

async function loadImageSafe(url) {
	if (!url) return null;
	try {
		const res = await axios.get(url, {
			responseType: 'arraybuffer',
			timeout: IMAGE_TIMEOUT,
			headers: { 'User-Agent': 'Mozilla/5.0' }
		});
		if (!res || !res.data || !res.data.length) return null;
		return await loadImage(Buffer.from(res.data));
	}
	catch (_e) { return null; }
}

function gradient(ctx, width, height, from, to) {
	const g = ctx.createLinearGradient(0, 0, width, height);
	g.addColorStop(0, from);
	g.addColorStop(1, to);
	ctx.fillStyle = g;
	ctx.fillRect(0, 0, width, height);
}

function placeholder(ctx, x, y, size, letter) {
	ctx.save();
	ctx.fillStyle = 'rgba(255,255,255,0.25)';
	ctx.fillRect(x, y, size, size);
	ctx.fillStyle = '#ffffff';
	ctx.font = `bold ${Math.max(18, Math.floor(size / 2))}px sans-serif`;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillText(String(letter || '?').toUpperCase(), x + size / 2, y + size / 2);
	ctx.restore();
}

// shape: 'circle' | 'box'. border: css color or null.
function drawAvatar(ctx, img, x, y, size, border, shape, letter) {
	ctx.save();
	if (shape === 'circle') {
		ctx.beginPath();
		ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
		ctx.closePath();
		ctx.clip();
	}
	if (img) ctx.drawImage(img, x, y, size, size);
	else placeholder(ctx, x, y, size, letter);
	ctx.restore();

	if (border) {
		ctx.save();
		ctx.strokeStyle = border;
		ctx.lineWidth = Math.max(3, Math.floor(size / 22));
		if (shape === 'circle') {
			ctx.beginPath();
			ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
			ctx.stroke();
		}
		else ctx.strokeRect(x, y, size, size);
		ctx.restore();
	}
}

async function run({ api, event, style }) {
	let outputPath = null;
	try {
		const threadData = await api.getThreadInfo(event.threadID);
		const users = (threadData && threadData.userInfo) || [];
		const match = pickMatch(users, event.senderID);
		if (!match) {
			return api.sendMessage('❌ Group-e kono member paoa jayni.', event.threadID, event.messageID);
		}

		const me = users.find(u => String(u.id) === String(event.senderID)) || {};
		const senderName = convertName(me.name || event.senderID, event.senderID);
		const matchName = convertName(match.name || match.id, match.id);

		const width = style.width;
		const height = style.height;
		const canvas = createCanvas(width, height);
		const ctx = canvas.getContext('2d');

		const bg = await loadImageSafe(style.background);
		if (bg) ctx.drawImage(bg, 0, 0, width, height);
		else gradient(ctx, width, height, style.from || '#ff9a9e', style.to || '#fad0c4');

		const [imgOne, imgTwo] = await Promise.all([
			loadImageSafe(avatarUrl(event.senderID)),
			loadImageSafe(avatarUrl(match.id))
		]);

		if (typeof style.drawAvatars === 'function')
			style.drawAvatars(ctx, imgOne, imgTwo, width, height, senderName, matchName);

		const percent = style.percent
			? style.percent()
			: Math.floor(Math.random() * 31) + 70;
		const body = style.message(senderName, matchName, percent);

		if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
		outputPath = path.join(CACHE_DIR, `pair_${event.senderID}_${Date.now()}.png`);
		fs.writeFileSync(outputPath, canvas.toBuffer('image/png'));

		const payload = { body, attachment: fs.createReadStream(outputPath) };
		if (typeof style.mentions === 'function')
			payload.mentions = style.mentions(event.senderID, match.id, me.name, match.name);

		return api.sendMessage(
			payload,
			event.threadID,
			() => { try { if (outputPath && fs.existsSync(outputPath)) fs.unlinkSync(outputPath); } catch (_e) {} },
			event.messageID
		);
	}
	catch (error) {
		try { if (outputPath && fs.existsSync(outputPath)) fs.unlinkSync(outputPath); } catch (_e) {}
		try {
			return api.sendMessage('❌ Pair: ' + (error && error.message ? error.message : 'unknown error'), event.threadID, event.messageID);
		}
		catch (_e) {}
	}
}

module.exports = {
	resolveGender, pickMatch, convertName, loadImageSafe,
	gradient, drawAvatar, avatarUrl, run
};
