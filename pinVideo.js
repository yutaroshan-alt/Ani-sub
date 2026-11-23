'use strict';
// Robust Pinterest HLS (.m3u8) -> MP4 downloader for the (pin) command.
// Downloads the fragmented .cmfv video + .cmfa audio directly (ffmpeg's
// built-in HLS demuxer mishandles Pinterest byte ranges) and muxes them.

const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);

const UA = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36';
const MAX_VIDEO_BYTES = 22 * 1024 * 1024; // stay under Messenger's upload limit

function usable(p) {
	if (typeof p !== 'string' || !p || !fs.existsSync(p)) return false;
	try { return require('child_process').spawnSync(p, ['-version'], { timeout: 8000, stdio: 'ignore' }).status === 0; }
	catch (_e) { return false; }
}

function resolveFfmpeg() {
	if (process.env.FFMPEG_PATH && usable(process.env.FFMPEG_PATH)) return process.env.FFMPEG_PATH;
	for (const pkg of ['ffmpeg-static', '@ffmpeg-installer/ffmpeg']) {
		try {
			const mod = require(pkg);
			const p = (mod && mod.default) || mod;
			const bin = (p && (p.path || p)) || '';
			if (usable(bin)) return bin;
		}
		catch (_e) {}
	}
	return 'ffmpeg'; // system binary (Termux / Docker image)
}

function parseVariants(master, baseUrl) {
	const lines = String(master).split(/\r?\n/);
	const variants = [];
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i].trim();
		if (!line.startsWith('#EXT-X-STREAM-INF:')) continue;
		let uri = '';
		for (let j = i + 1; j < lines.length; j++) {
			const next = lines[j].trim();
			if (!next || next.startsWith('#')) continue;
			uri = next;
			break;
		}
		if (!uri) continue;
		const attrs = line.slice(line.indexOf(':') + 1);
		const resolution = attrs.match(/RESOLUTION=(\d+)x(\d+)/i);
		variants.push({
			url: new URL(uri, baseUrl).toString(),
			bandwidth: Number((attrs.match(/BANDWIDTH=(\d+)/i) || [])[1]) || 0,
			width: Number(resolution && resolution[1]) || 0
		});
	}
	return variants;
}

function audioUri(master) {
	for (const line of String(master).split(/\r?\n/)) {
		if (!line.startsWith('#EXT-X-MEDIA:') || !/TYPE=AUDIO/i.test(line)) continue;
		const m = line.match(/URI="([^"]+)"/i);
		if (m) return m[1];
	}
	return '';
}

function playlistBaseName(url) {
	const parts = url.split('/');
	const file = parts[parts.length - 1] || '';
	return file.replace(/\.m3u8.*$/i, '');
}

async function fetchText(url) {
	const res = await axios.get(url, { timeout: 20000, headers: { 'User-Agent': UA } });
	return String(res.data || '');
}

async function downloadFile(url, dest) {
	const res = await axios.get(url, {
		responseType: 'stream',
		timeout: 60000,
		maxContentLength: MAX_VIDEO_BYTES,
		headers: { 'User-Agent': UA }
	});
	const len = Number(res.headers['content-length'] || 0);
	if (len > MAX_VIDEO_BYTES) throw new Error('Video too large');
	await new Promise((resolve, reject) => {
		let bytes = 0;
		const out = fs.createWriteStream(dest);
		res.data.on('data', chunk => {
			bytes += chunk.length;
			if (bytes > MAX_VIDEO_BYTES) {
				try { res.data.destroy(); } catch (_e) {}
				reject(new Error('Video too large'));
			}
		});
		res.data.on('error', reject);
		out.on('error', reject);
		out.on('finish', resolve);
		res.data.pipe(out);
	});
	if (!(await fs.stat(dest)).size) throw new Error('Empty video download');
}

async function mux(videoPath, audioPath, outputPath) {
	const ffmpeg = resolveFfmpeg();
	const args = ['-y', '-hide_banner', '-loglevel', 'error', '-i', videoPath];
	if (audioPath) args.push('-i', audioPath);
	args.push('-map', '0:v:0');
	if (audioPath) args.push('-map', '1:a:0?');
	args.push('-c', 'copy', '-movflags', '+faststart', outputPath);
	await execFileAsync(ffmpeg, args, { timeout: 180000, maxBuffer: 4 * 1024 * 1024 });
}

// item: { media_url, is_hls, duration_ms, ... }
// returns { path, cleanup() }
async function downloadPinVideo(item, workDir) {
	await fs.ensureDir(workDir);
	const outputPath = path.join(workDir, `pin_${Date.now()}.mp4`);
	const masterUrl = item.media_url;
	const cleanup = async () => { await fs.remove(outputPath).catch(() => {}); };

	if (!item.is_hls && !/\.m3u8(\?|$)/i.test(masterUrl)) {
		await downloadFile(masterUrl, outputPath);
		return { path: outputPath, cleanup };
	}

	const master = await fetchText(masterUrl);
	const variants = parseVariants(master, masterUrl);
	// Prefer the smallest variant so the file fits Messenger's upload limit.
	const sorted = variants.sort((a, b) => (a.width || 9999) - (b.width || 9999) || (a.bandwidth || 0) - (b.bandwidth || 0));
	const candidates = sorted.length ? sorted.slice(0, 3) : [{ url: masterUrl }];
	const audioRel = audioUri(master);
	const audioListUrl = audioRel ? new URL(audioRel, masterUrl).toString() : '';
	let lastError = null;

	for (const candidate of candidates) {
		const videoSource = path.join(workDir, `v_${Date.now()}.cmfv`);
		const audioSource = path.join(workDir, `a_${Date.now()}.cmfa`);
		try {
			const base = playlistBaseName(candidate.url);
			const dir = candidate.url.slice(0, candidate.url.lastIndexOf('/') + 1);
			await downloadFile(`${dir}${base}.cmfv`, videoSource);

			let audioUrl = '';
			if (audioListUrl) {
				try {
					const audioList = await fetchText(audioListUrl);
					const audioBase = playlistBaseName(audioListUrl);
					const audioDir = audioListUrl.slice(0, audioListUrl.lastIndexOf('/') + 1);
					audioUrl = `${audioDir}${audioBase}.cmfa`;
				}
				catch (_e) { audioUrl = ''; }
			}

			try {
				if (audioUrl) await downloadFile(audioUrl, audioSource);
				await mux(videoSource, audioUrl ? audioSource : null, outputPath);
			}
			catch (_e) {
				await fs.remove(outputPath).catch(() => {});
				await mux(videoSource, null, outputPath);
			}

			const stat = await fs.stat(outputPath).catch(() => null);
			if (!stat || !stat.size) throw new Error('Empty MP4 output');
			await fs.remove(videoSource).catch(() => {});
			await fs.remove(audioSource).catch(() => {});
			return { path: outputPath, cleanup };
		}
		catch (error) {
			lastError = error;
			await fs.remove(videoSource).catch(() => {});
			await fs.remove(audioSource).catch(() => {});
			await fs.remove(outputPath).catch(() => {});
		}
	}
	throw lastError || new Error('Could not prepare Pinterest video');
}

module.exports = { downloadPinVideo, resolveFfmpeg };
