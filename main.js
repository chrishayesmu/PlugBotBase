"use strict";

var fs = require("fs");
var path = require("path");

var Config = require("./src/config");
var Log = require("./src/log");
var Plug = require("./src/plug");

var LOG = new Log("PlugBotBase");

function start(basedir) {
    var defaultConfig = require("./config/defaults.json");
    var config = Config.create(basedir, defaultConfig);

    var globalObject = { config: config };

    var bot = new Plug.Bot({
        email: config.pbb_bot_email,
        password: config.pbb_bot_password
    }, globalObject);

    _registerEventListeners(basedir, bot);


    globalObject.bot = bot;

    bot.connect(config.pbb_room_name);
    return bot;
}

/**
 * Registers all of the eligible files from the event_listeners
 * directory as event listeners with the bot.
 *
 * @param {string} basedir - The base directory which holds the event_listeners directory
 * @param {object} bot - An instance of PlugBotBase.Bot
 */
function _registerEventListeners(basedir, bot) {
    var eventListenerDir = path.resolve(basedir, "event_listeners");

    var files;
    try {
        files = _readDirRecursive(eventListenerDir);
        LOG.info("Found the following potential event listener files: {}", files);
    }
    catch (e) {
        LOG.error("Unable to register event listeners from the base directory '{}'. Error: {}", eventListenerDir, e);
        return;
    }

    for (var i = 0; i < files.length; i++) {
        var filePath = files[i];
        if (filePath.lastIndexOf(".js") !== filePath.length - 3) {
            LOG.info("File {} doesn't appear to be a JS module. Ignoring.", filePath);
            continue;
        }

        var module = require(filePath);

        if (!module.events || !module.handler) {
            LOG.warn("Found a module at {} but it doesn't appear to be an event handler. Ignoring.", filePath);
            continue;
        }

        for (var eventIndex = 0; eventIndex < module.events.length; eventIndex++) {
            var event = module.events[eventIndex];
            bot.on(event, module.handler, module.handlerContext);
        }

        LOG.info("Registered event listener from file {}", filePath);
    }
}

/**
 * Finds all of the files from a directory and all of its subdirectories,
 * and turns them into absolute paths.
 *
 * TODO: Make all this parallel for quicker startup of big bots
 *
 * @param {string} basedir - The base directory to start reading from
 * @returns {array} An array of all the files under the base directory and any subdirectories
 */
function _readDirRecursive(basedir) {
    var filesInBaseDir = fs.readdirSync(basedir);
    var allFiles = [];

    if (!filesInBaseDir) {
        return allFiles;
    }

    for (var i = 0; i < filesInBaseDir.length; i++) {
        var filePath = path.resolve(basedir, filesInBaseDir[i]);
        var fileStats = fs.statSync(filePath);

        if (fileStats.isDirectory()) {
            allFiles = allFiles.concat(_readDirRecursive(filePath));
        }
        else if (fileStats.isFile()) {
            allFiles.push(filePath);
        }
    }

    return allFiles;
}

exports.BanDuration = Plug.BanDuration;
exports.Bot = Plug.Bot;
exports.ChatType = Plug.ChatType;
exports.Event = Plug.Event;
exports.Log = Log;
exports.UserRole = Plug.Role;
exports.start = start;
