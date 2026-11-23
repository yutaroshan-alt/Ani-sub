const fs = require("fs-extra");
const path = require("path");

const AUTHOR = "0xMr_King x ┃ Tanin Islam";
const tmpDir = path.join(__dirname, "tmp");

module.exports = {
	config: {
		name: "backupdata",
		aliases: ["dbbackup"],
		version: "2.0.0",
		author: AUTHOR,
		countDown: 15,
		role: 2,
		category: "owner",
		shortDescription: "Download a full snapshot of bot data",
		guide: { en: "{pn}" }
	},

	onStart: async function ({ message, threadsData, usersData, dashBoardData, globalData }) {
		try {
			fs.ensureDirSync(tmpDir);
			const stamp = new Date().toISOString().replace(/[:.]/g, "-");
			const [threads, users, dashboard, global_] = await Promise.all([
				threadsData.getAll(),
				usersData.getAll(),
				dashBoardData.getAll(),
				globalData.getAll()
			]);

			const files = [
				{ name: `threads-${stamp}.json`, data: threads },
				{ name: `users-${stamp}.json`, data: users },
				{ name: `dashboard-${stamp}.json`, data: dashboard },
				{ name: `global-${stamp}.json`, data: global_ }
			];

			const attachment = files.map(file => {
				const target = path.join(tmpDir, file.name);
				fs.writeFileSync(target, JSON.stringify(file.data, null, 2));
				return fs.createReadStream(target);
			});

			return message.reply({
				body: `Database backup by ${AUTHOR}\nThreads: ${threads.length}\nUsers: ${users.length}\nDashboard: ${dashboard.length}\nGlobal: ${global_.length}`,
				attachment
			});
		} catch (err) {
			return message.reply(`Backup failed: ${err.message}`);
		}
	}
};
