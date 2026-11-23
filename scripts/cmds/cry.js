const fs = require("fs-extra");
const path = require("path");
const { createCanvas, loadImage } = require("canvas");

// Local, offline "cry" meme — no native node-canvas 2.x / discord-image-generation needed.
async function loadImageSafe(url) {
	try {
		const axios = require("axios");
		const res = await axios.get(url, { responseType: "arraybuffer", timeout: 15000, headers: { "User-Agent": "Mozilla/5.0" } });
		return await loadImage(Buffer.from(res.data));
	}
	catch (_e) { return null; }
}

module.exports = {
	config: {
		name: "cry",
		version: "1.1",
		author: "0xMr_King x ┃ Tanin Islam",
		countDown: 3,
		role: 0,
		shortDescription: "Cry meme with someone's avatar",
		longDescription: "Makes a crying meme using a mentioned/replied user's avatar (offline).",
		category: "meme",
		guide: "{pn} @mention or reply"
	},

	onStart: async function ({ event, message, usersData }) {
		try {
			const mention = Object.keys(event.mentions || {});
			const uid = event.type === "message_reply"
				? event.messageReply.senderID
				: (mention[0] || event.senderID);

			const avatar = await loadImageSafe(await usersData.getAvatarUrl(uid));
			const width = 600, height = 600;
			const canvas = createCanvas(width, height);
			const ctx = canvas.getContext("2d");

			const g = ctx.createLinearGradient(0, 0, width, height);
			g.addColorStop(0, "#a18cd1");
			g.addColorStop(1, "#fbc2eb");
			ctx.fillStyle = g;
			ctx.fillRect(0, 0, width, height);

			ctx.save();
			ctx.beginPath();
			ctx.arc(width / 2, 250, 150, 0, Math.PI * 2);
			ctx.closePath();
			ctx.clip();
			if (avatar) ctx.drawImage(avatar, width / 2 - 150, 100, 300, 300);
			else {
				ctx.fillStyle = "rgba(255,255,255,0.3)";
				ctx.fillRect(width / 2 - 150, 100, 300, 300);
			}
			ctx.restore();
			ctx.strokeStyle = "#ffffff";
			ctx.lineWidth = 8;
			ctx.beginPath();
			ctx.arc(width / 2, 250, 150, 0, Math.PI * 2);
			ctx.stroke();

			ctx.fillStyle = "#ffffff";
			ctx.textAlign = "center";
			ctx.font = "bold 64px sans-serif";
			ctx.fillText("😢", width / 2, 465);
			ctx.font = "bold 38px sans-serif";
			ctx.fillText(mention[0] ? "this person always makes me cry" : "Lol you make urself cry", width / 2, 535);

			const dir = path.join(__dirname, "tmp");
			await fs.ensureDir(dir);
			const filePath = path.join(dir, `cry_${Date.now()}.png`);
			fs.writeFileSync(filePath, canvas.toBuffer("image/png"));

			return message.reply(
				{ attachment: fs.createReadStream(filePath) },
				() => { try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch (_e) {} }
			);
		}
		catch (error) {
			return message.reply("❌ Cry meme toiri korte parini.");
		}
	}
};
