const { graphQlQueryToJson } = require("graphql-query-to-json");
const ora = require("ora");
const { log, getText } = global.utils;
const { config } = global.GoatBot;
// sqlite3 is the fast primary store. If its native binding is missing or was built
// for another Node version, switch to the built-in JSON store instead of exiting.
let databaseType = config.database.type || "sqlite";

// with add null if not found data
function fakeGraphql(query, data, obj = {}) {
	if (typeof query != "string" && typeof query != "object")
		throw new Error(`The "query" argument must be of type string or object, got ${typeof query}`);
	if (query == "{}" || !data)
		return data;
	if (typeof query == "string")
		query = graphQlQueryToJson(query).query;
	const keys = query ? Object.keys(query) : [];
	for (const key of keys) {
		if (typeof query[key] === 'object') {
			if (!Array.isArray(data[key]))
				obj[key] = data.hasOwnProperty(key) ? fakeGraphql(query[key], data[key] || {}, obj[key]) : null;
			else
				obj[key] = data.hasOwnProperty(key) ? data[key].map(item => fakeGraphql(query[key], item, {})) : null;
		}
		else
			obj[key] = data.hasOwnProperty(key) ? data[key] : null;
	}
	return obj;
	// i don't know why but it's working by Copilot suggestion :)
}

module.exports = async function (api) {
	var threadModel, userModel, dashBoardModel, globalModel, sequelize = null;
	switch (databaseType) {
		case "mongodb": {
			const spin = ora({
				text: getText('indexController', 'connectingMongoDB'),
				spinner: {
					interval: 80,
					frames: [
						'⠋', '⠙', '⠹',
						'⠸', '⠼', '⠴',
						'⠦', '⠧', '⠇',
						'⠏'
					]
				}
			});
			const defaultClearLine = process.stderr.clearLine;
			process.stderr.clearLine = function () { };
			spin.start();
			try {
				var { threadModel, userModel, dashBoardModel, globalModel } = await require("../connectDB/connectMongoDB.js")(config.database.uriMongodb);
				spin.stop();
				process.stderr.clearLine = defaultClearLine;
				log.info("MONGODB", getText("indexController", "connectMongoDBSuccess"));
			}
			catch (err) {
				spin.stop();
				process.stderr.clearLine = defaultClearLine;
				log.err("MONGODB", getText("indexController", "connectMongoDBError"), err);
				process.exit();
			}
			break;
		}
		case "sqlite": {
			const spin = ora({
				text: getText('indexController', 'connectingMySQL'),
				spinner: {
					interval: 80,
					frames: [
						'⠋', '⠙', '⠹',
						'⠸', '⠼', '⠴',
						'⠦', '⠧', '⠇',
						'⠏'
					]
				}
			});
			const defaultClearLine = process.stderr.clearLine;
			process.stderr.clearLine = function () { };
			spin.start();
			try {
				var { threadModel, userModel, dashBoardModel, globalModel, sequelize } = await require("../connectDB/connectSqlite.js")();
				process.stderr.clearLine = defaultClearLine;
				spin.stop();
				log.info("SQLITE", getText("indexController", "connectMySQLSuccess"));
			}
			catch (err) {
				process.stderr.clearLine = defaultClearLine;
				spin.stop();
				const detail = String(err && err.message || err);
				const bindingProblem = /could not locate the bindings file|NODE_MODULE_VERSION|compiled against a different Node|ERR_DLOPEN_FAILED|invalid ELF header|Cannot find module ['"]sqlite3/i.test(detail);
				if (bindingProblem && config.database.fallbackToJson !== false) {
					log.warn("SQLITE", `Native sqlite3 driver is not usable (${detail.slice(0, 140)}). Switching to the built-in JSON database so the bot can start. Repair later with: npm rebuild sqlite3 --build-from-source`);
					databaseType = "json";
				}
				else {
					log.err("SQLITE", getText("indexController", "connectMySQLError"), err);
					process.exit(1);
				}
			}
			break;
		}
		default:
			break;
	}

	const threadsData = await require("./threadsData.js")(databaseType, threadModel, api, fakeGraphql);
	const usersData = await require("./usersData.js")(databaseType, userModel, api, fakeGraphql);
	const dashBoardData = await require("./dashBoardData.js")(databaseType, dashBoardModel, fakeGraphql);
	const globalData = await require("./globalData.js")(databaseType, globalModel, fakeGraphql);

	global.db = {
		...global.db,
		threadModel,
		userModel,
		dashBoardModel,
		globalModel,
		threadsData,
		usersData,
		dashBoardData,
		globalData,
		sequelize,
		databaseType
	};

	return {
		threadModel,
		userModel,
		dashBoardModel,
		globalModel,
		threadsData,
		usersData,
		dashBoardData,
		globalData,
		sequelize,
		databaseType
	};
};