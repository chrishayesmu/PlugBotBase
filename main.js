"use strict";

var fs = require("fs");
var path = require("path");

var Config = require("./src/config");
var Log = require("./src/log");
var Plug = require("./src/plug");
var StateTracker = require("./src/state_tracker");
var Event = Plug.Event;

var LOG = new Log("PlugBotBaseMain");

/**
 * Starts up the bot, registering all commands and event listeners.
 *
 * @param {string} basedir - The base directory containing the commands/ and event_listeners/ subdirectories
 * @param {function} connectionCompleteCallback - A function to be called once the bot has connected to the room
 * @returns {object} The global object which contains a reference to the bot
 */
function start(basedir, connectionCompleteCallback) {
    var defaultConfig = require("./config/defaults.json");
    var config = Config.create(basedir, defaultConfig);

    var globalObject = { config: config };

    var bot = new Plug.Bot({
        email: config.PlugBotBase.botEmail,
        password: config.PlugBotBase.botPassword
    }, globalObject);

    globalObject.bot = bot;
    StateTracker.init(globalObject, function() {
        var commands = _registerCommands(basedir, globalObject);
        var eventListeners = _registerEventListeners(basedir, globalObject);

        // Hook our own event listener in to chat, for the command framework
        bot.on(Event.CHAT_COMMAND, _createCommandHandler(commands));

        bot.connect(config.PlugBotBase.roomName);

        if (connectionCompleteCallback) {
            connectionCompleteCallback(globalObject);
        }
    });

    return globalObject;
}

/**
 * Creates a handler for the CHAT_COMMAND event which will distribute
 * chat commands to the appropriate registered handlers.
 *
 * @param {array} commands - All of the registered command handlers
 * @returns {function} An event handler
 */
function _createCommandHandler(commands) {
    return function(commandEvent, globalObject) {
        var commandName = commandEvent.command;

        if (!globalObject.config.PlugBotBase.areCommandsCaseSensitive) {
            commandName = commandName.toLowerCase();
        }

        for (var i = 0; i < commands.length; i++) {
            var command = commands[i];

            if (command.triggers.indexOf(commandName) >= 0) {
                command.handler.call(command.context, commandEvent, globalObject);
            }
        }
    };
}

/**
 * Registers all of the eligible files from the commands
 * directory as commands with the bot.
 *
 * @param {string} basedir - The base directory which holds the commands directory
 * @param {object} bot - An instance of PlugBotBase.Bot
 */
function _registerCommands(basedir, globalObject) {
    var commandsDir = path.resolve(basedir, "commands");

    var files;
    try {
        files = _readDirRecursive(commandsDir);
        LOG.info("Found the following potential command files: {}", files);
    }
    catch (e) {
        LOG.error("Unable to register commands from the base directory '{}'. Error: {}", commandsDir, e);
        return;
    }

    var commands = [];
    for (var i = 0; i < files.length; i++) {
        var filePath = files[i];
        if (filePath.lastIndexOf(".js") !== filePath.length - 3) {
            LOG.info("File {} doesn't appear to be a JS module. Ignoring.", filePath);
            continue;
        }

        var module = require(filePath);

        if (!module.triggers || !module.handler) {
            LOG.warn("Found a module at {} but it doesn't appear to be a command handler. Ignoring.", filePath);
            continue;
        }

        if (typeof module.init === "function") {
            module.init(globalObject);
        }

        commands.push(module);
        LOG.info("Registered command from file {}", filePath);
    }

    return commands;
}

/**
 * Registers all of the eligible files from the event_listeners
 * directory as event listeners with the bot.
 *
 * @param {string} basedir - The base directory which holds the event_listeners directory
 * @param {object} bot - An instance of PlugBotBase.Bot
 */
function _registerEventListeners(basedir, globalObject) {
    var bot = globalObject.bot;
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

    var listeners = [];
    for (var i = 0; i < files.length; i++) {
        var filePath = files[i];
        if (filePath.lastIndexOf(".js") !== filePath.length - 3) {
            LOG.info("File {} doesn't appear to be a JS module. Ignoring.", filePath);
            continue;
        }

        var module = require(filePath);

        /* Check each event key and look for an export in one of two forms:
         *
         * 1) EVENT_KEY : some_function
         * 2) EVENT_KEY : { handler: some_function, context: some_object }
         *
         * Context is optional even in the second form, but a function is always required.
         */
        var eventHandlerFound = false;
        for (var eventKey in Event) {
            var eventValue = Event[eventKey];
            var eventHandler = null;
            var handlerContext = null;
            var error = null;

            if (!module[eventValue]) {
                continue;
            }

            if (typeof module[eventValue] === "function") {
                eventHandler = module[eventValue];
            }
            else if (typeof module[eventValue] === "object") {
                if (typeof module[eventValue].handler !== "function") {
                    LOG.error("An error occurred while reading event listener from file {}", filePath);
                    LOG.error("Event listener for event '{}' has an object type, but the 'handler' property does not refer to a function", eventKey);
                    throw new Error("An error occurred while initializing event listeners. Check your logfile (or just stdout) for more details.");
                }

                eventHandler = module[eventValue].handler;
                handlerContext = module[eventValue].context;
            }
            else {
                LOG.warn("Found what looks like an event listener, but it's not an object or a function. Event: {}, from file: {}", eventKey, filePath);
                continue;
            }

            eventHandlerFound = true;
            bot.on(eventValue, eventHandler, handlerContext);
        }

        if (!eventHandlerFound) {
            LOG.warn("Found a module at {} but it doesn't appear to be an event handler. Ignoring.", filePath);
            continue;
        }

        if (typeof module.init === "function") {
            LOG.info("Calling init for module at {}", filePath);
            module.init(globalObject);
        }

        listeners.push(module);
        LOG.info("Registered event listener from file {}", filePath);
    }

    return listeners;
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
exports.BanReason = Plug.BanReason;
exports.Bot = Plug.Bot;
exports.ChatType = Plug.ChatType;
exports.Event = Plug.Event;
exports.Log = Log;
exports.MuteReason = Plug.MuteReason;
exports.UserRole = Plug.Role;
exports.start = start;
