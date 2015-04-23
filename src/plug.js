"use strict";

/**
 * Provides the basic functionality of the bot: event subscription,
 * model translation, and taking actions such as sending chat or moderating.
 *
 * The main goal of this class is to provide insulation between the plug.dj
 * API implementation and clients, since historically, plug.dj implementations
 * have changed rather frequently. In the event of a breaking change, hopefully only
 * this class will need to be updated.
 */

var Log = require("./log");
var PlugAPI = require("plugapi");
var Translator = require("./translator");
var Types = require("./types");
var Utils = require("./utils");

var LOG = new Log("PlugBotBase-Bot");

var _eventTranslatorMap = {
    'advance': Translator.translateAdvanceEvent,
    'chat': Translator.translateChatEvent,
    'command': Translator.translateCommandEvent,
    'chatDelete': Translator.translateChatDeleteEvent,
    'djListCycle': Translator.translateDjListCycleEvent,
    'djListUpdate': Translator.translateDjListUpdateEvent,
    'djListLocked': Translator.translateDjListLockedEvent,
    'earn': Translator.translateEarnEvent,
    'grab': Translator.translateGrabEvent,
    'modAddDJ': Translator.translateModAddDjEvent,
    'modBan': Translator.translateModBanEvent,
    'modMoveDJ': Translator.translateModMoveDjEvent,
    'modMute': Translator.translateModMuteEvent,
    'modRemoveDJ': Translator.translateModRemoveDjEvent,
    'modSkip': Translator.translateModSkipEvent,
    'modStaff': Translator.translateModStaffEvent,
    'roomDescriptionUpdate': Translator.translateRoomDescriptionUpdateEvent,
    'roomJoin': Translator.translateRoomJoinEvent,
    'roomMinChatLevelUpdate': Translator.translateRoomMinChatLevelUpdateEvent,
    'roomNameUpdate': Translator.translateRoomNameUpdateEvent,
    'roomWelcomeUpdate': Translator.translateRoomWelcomeUpdateEvent,
    'skip': Translator.translateSkipEvent,
    'userJoin': Translator.translateUserJoinEvent,
    'userLeave': Translator.translateUserLeaveEvent,
    'userUpdate': Translator.translateUserUpdateEvent,
    'vote': Translator.translateVoteEvent
};

/**
 * Creates a new instance of the bot which will automatically connect to plug.dj
 * and set up some event handling.
 */
function Bot(credentials, globalObject) {
    LOG.info("Attempting to log in with email {}", credentials.email);

    this.bot = new PlugAPI(credentials);
    LOG.info("Logged in successfully");

    // Set up custom event handling to insulate us from changes in the plug API
    this.eventHandlers = {};
    for (var eventKey in Types.Event) {
        var eventName = Types.Event[eventKey];
        this.eventHandlers[eventName] = [];
    }

    if (globalObject.config.PlugBotBase.logAllEvents) {
        LOG.info("Logging of all events is enabled (this includes events not supported by PlugBotBase). Setting up default event handlers.");
        for (var eventKey in PlugAPI.events) {
            var eventName = PlugAPI.events[eventKey];
            LOG.info("Hooking into eventKey {}, eventName {}", eventKey, eventName);
            this.bot.on(eventName, (function(name) {
                return function(event) {
                    LOG.info("event '{}' has JSON payload: {}", name, event);
                };
            })(eventName));
        }
    }

    for (var eventKey in Types.Event) {
        var eventName = Types.Event[eventKey];
        var translatorFunction = _eventTranslatorMap[eventName];

        this.bot.on(eventName, _createEventDispatcher(eventName, translatorFunction, globalObject).bind(this));
    }
}

/**
 * Attempts to ban a user from the room. If the bot doesn't have sufficient permissions
 * (that is, it's not at least a bouncer, and a higher role than the target user) then
 * TODO what? return value?
 *
 * @param {mixed} userID - String or number representing the userID of the user to be banned
 * @param {String} banDuration - How long the ban should last, from the BanDuration enum
 * @param {String} banReason - The reason the user is being banned, from the BanReason enum
 * @param {function} callback - Optional; a function to be called once the ban is done (whether succeeded or failed)
 */
Bot.prototype.banUser = function(userID, banDuration, banReason, callback) {
    Utils.checkHasValue(userID, "PlugBotBase.banUser called without a userID");
    Utils.checkValueIsInObject(banDuration, Types.BanDuration, "PlugBotBase.banUser called with an invalid BanDuration: " + banDuration);
    Utils.checkValueIsInObject(banReason, Types.BanReason, "PlugBotBase.banUser called with an invalid BanReason: " + banReason);

    if (callback) {
        Utils.checkHasType(callback, "function", "PlugBotBase.banUser called with a non-function value for 'callback' argument");
    }

    // Translate from our model to PlugAPI
    var translatedBanDuration, translatedBanReason;

    switch (banDuration) {
        case Types.BanDuration.HOUR:
            translatedBanDuration = PlugAPI.BAN.HOUR;
            break;
        case Types.BanDuration.DAY:
            translatedBanDuration = PlugAPI.BAN.DAY;
            break;
        case Types.BanDuration.FOREVER:
            translatedBanDuration = PlugAPI.BAN.PERMA;
            break;
    }

    switch (banReason) {
        case Types.BanReason.SPAMMING_OR_TROLLING:
            translatedBanReason = PlugAPI.BAN_REASON.SPAMMING_TROLLING;
            break;
        case Types.BanReason.VERBAL_ABUSE_OR_OFFENSIVE_LANGUAGE:
            translatedBanReason = PlugAPI.BAN_REASON.VERBAL_ABUSE;
            break;
        case Types.BanReason.PLAYING_OFFENSIVE_MEDIA:
            translatedBanReason = PlugAPI.BAN_REASON.OFFENSIVE_MEDIA;
            break;
        case Types.BanReason.REPEATEDLY_PLAYING_INAPPROPRIATE_GENRES:
            translatedBanReason = PlugAPI.BAN_REASON.INAPPROPRIATE_GENRE;
            break;
        case Types.BanReason.NEGATIVE_ATTITUDE:
            translatedBanReason = PlugAPI.BAN_REASON.NEGATIVE_ATTITUDE;
            break;
    }

    // Actually send the request
    var wasRequestSent = this.bot.moderateBanUser(userID, translatedBanReason, translatedBanDuration, function() {
        // TODO: this callback wasn't ever called in testing.
        // TODO: check the user's permissions relative to the target and the room.
        LOG.info("ban callback: {}", arguments);
        if (callback) {
            var args = [].slice.call(arguments);
            callback.apply(null, args);
        }
    });

    if (!wasRequestSent) {
        // TODO call callback
    }
}

/**
 * Attempts to connect the logged-in bot to a specific plug.dj room.
 *
 * @param {string} roomName - The name of the room to connect to
 */
Bot.prototype.connect = function(roomName) {
    LOG.info("Attempting to connect to room {}", roomName);
    this.bot.connect(roomName);
}

/**
 * Attempts to force skip the current song. The bot must have a position of bouncer
 * or above in the room for this to work.
 *
 * @param {function} callback - Optional. If provided, will be called once the song
 *                              is skipped or if skipping fails. The callback is passed
 *                              a Boolean parameter which is true if a song was skipped.
 *                              (Skipping can fail for lack of permissions or just because
 *                              there is no current DJ.)
 */
Bot.prototype.forceSkip = function(callback) {
    var wasSkipQueued = this.bot.moderateForceSkip(function() {
        if (callback) {
            callback(true);
        }
    });

    // If queuing failed our callback will never trigger, so do it now
    if (!wasSkipQueued && callback) {
        callback(false);
    }
}

/**
 * Makes the bot grab the currently playing song. This can fail if there is
 * no song playing currently, or if the bot has no active playlist.
 *
 * @param {function} callback - Optional. If provided, will be called once the bot
 *                              has grabbed, or once grabbing has failed. The callback
 *                              is passed a Boolean parameter which is true if the bot grabbed.
 */
Bot.prototype.grabSong = function(callback) {
    var wasGrabQueued = this.bot.grab(function() {
        if (callback) {
            callback(true);
        }
    });

    if (!wasGrabQueued && callback) {
        callback(false);
    }
}

/**
 * Attempts to place the bot in the wait list. This will fail if the bot is already
 * in the wait list, the wait list is locked, or the bot has no playlists.
 *
 * @param {function} callback - Optional. If provided, will be called once the bot
 *                              has joined the wait list, or once joining has failed.
 *                              The callback is passed a Boolean parameter which is true
 *                              if the bot joined the wait list.
 */
Bot.prototype.joinWaitList = function(callback) {
    var wasJoinQueued = this.bot.joinBooth(function() {
        if (callback) {
            callback(true);
        }
    });

    if (!wasJoinQueued && callback) {
        callback(false);
    }
}

/**
 * Attempts to place the bot in the wait list. This will fail if the bot is not in
 * the wait list to begin with.
 *
 * @param {function} callback - Optional. If provided, will be called once the bot
 *                              has left the wait list, or once leaving has failed.
 *                              The callback is passed a Boolean parameter which is true
 *                              if the bot left the wait list.
 */
Bot.prototype.leaveWaitList = function(callback) {
    var wasLeaveQueued = this.bot.leaveBooth(function() {
        if (callback) {
            callback(true);
        }
    });

    if (!wasLeaveQueued && callback) {
        callback(false);
    }
}

/**
 * Makes the bot meh the currently playing song. This can fail if there is
 * no song playing currently.
 *
 * @param {function} callback - Optional. If provided, will be called once the bot
 *                              has mehed, or once mehing has failed. The callback
 *                              is passed a Boolean parameter which is true if the bot mehed.
 */
Bot.prototype.mehSong = function(callback) {
    var wasMehQueued = this.bot.meh(function() {
        if (callback) {
            callback(true);
        }
    });

    if (!wasMehQueued && callback) {
        callback(false);
    }
}

/**
 * Sends a chat message from the bot to the room.
 *
 * @param {String} message - The message to send from the bot.
 */
Bot.prototype.sendChat = function(message) {
    message = Utils.replaceStringPlaceholders(message, arguments);
    this.bot.sendChat(message);
}

/**
 * Makes the bot woot the currently playing song. This can fail if there is
 * no song playing currently.
 *
 * @param {function} callback - Optional. If provided, will be called once the bot
 *                              has wooted, or once wooting has failed. The callback
 *                              is passed a Boolean parameter which is true if the bot wooted.
 */
Bot.prototype.wootSong = function(callback) {
    var wasWootQueued = this.bot.woot(function() {
        if (callback) {
            callback(true);
        }
    });

    if (!wasWootQueued && callback) {
        callback(false);
    }
}

/**
 * Subscribes to the specified event. The given callback will be called with an
 * event object which is specific to each event.
 *
 * @param {string} eventName - The event to subscribe to, from the Event enum
 * @param {function} callback - A function to call when the event is triggered
 * @param {object} context - An optional context which will be set when calling the callback
 */
Bot.prototype.on = function(eventName, callback, /* optional */ context) {
    if (!this.eventHandlers[eventName]) {
        LOG.error("Received a request to hook into an unknown event called '{}'. Request will be ignored.", eventName);
        return;
    }

    this.eventHandlers[eventName].push({
        callback: callback,
        context: context
    });
}

/**
 * Creates a function which dispatches the given event to its listeners.
 *
 * @param {string} internalEventName - The event name from the Event enum
 * @param {function} translator - A function which translates from the PlugAPI event to an internal model
 * @param {object} globalObject - The object representing global application state
 * @returns {function} An event dispatcher function appropriate to the event
 */
function _createEventDispatcher(internalEventName, translator, globalObject) {
    return function(event) {
        var handlers = this.eventHandlers[internalEventName];
        var internalObject = translator(event);

        if (!internalObject) {
            return;
        }

        internalObject.eventName = internalEventName;

        for (var i = 0; i < handlers.length; i++) {
            handlers[i].callback.call(handlers[i].context, internalObject, globalObject);
        }
    };
}

exports.Bot = Bot;
