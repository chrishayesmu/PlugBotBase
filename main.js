var Config = require("./src/config");
var Log = require("./src/log");
var Plug = require("./src/plug");

function start(configDir) {
    var defaultConfig = require("./config/defaults.json");
    var config = Config.create(configDir, defaultConfig);

    var globalObject = { config: config };

    var bot = new Plug.Bot({
        email: config.pbb_bot_email,
        password: config.pbb_bot_password
    }, globalObject);

    globalObject.bot = bot;

    bot.connect(config.pbb_room_name);
    return bot;
}

exports.BanDuration = Plug.BanDuration;
exports.Bot = Plug.Bot;
exports.ChatType = Plug.ChatType;
exports.Event = Plug.Event;
exports.Log = Log;
exports.UserRole = Plug.Role;
exports.start = start;
