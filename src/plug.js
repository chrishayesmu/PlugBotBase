"use strict";

var Log = require("./log");
var PlugAPI = require("plugapi");
var Utils = require("./utils");

/**
 * Provides the basic functionality of the bot: event subscription,
 * model translation, and taking actions such as sending chat or moderating.
 *
 * The main goal of this class is to provide insulation between the plug.dj
 * API implementation and clients, since historically, plug.dj implementations
 * have changed rather frequently. In the event of a breaking change, hopefully only
 * this class will need to be updated.
 */

var LOG = new Log("PlugBotBase-Bot");

var Event = {
    ADVANCE: 'advance', // when the next song is up for play
    CHAT: 'chat', // someone sends a chat message
    CHAT_COMMAND: 'command', // someone sends a chat message prefixed with "!"
    CHAT_DELETE: 'chatDelete', // a mod deletes a chat message
    DJ_LIST_CYCLE: 'djListCycle', // a mod enables/disables DJ cycle
    DJ_LIST_UPDATE: 'djListUpdate', // someone joins or leaves the wait list, or a mod reorders the wait list
    DJ_LIST_LOCKED: 'djListLocked', // a mod locks/unlocks the wait list
    EARN: 'earn', // the bot gains exp
    GRAB: 'grab', // someone grabs the current song
    MODERATE_ADD_DJ: 'modAddDJ', // a mod adds a DJ to the wait list
    MODERATE_BAN: 'modBan', // a mod bans a user from the room
    MODERATE_MOVE_DJ: 'modMoveDJ', // a mod reorders a DJ in the wait list
    MODERATE_MUTE: 'modMute', // a mod mutes a user temporarily
    MODERATE_REMOVE_DJ: 'modRemoveDJ', // a mod removes a DJ from the wait list
    MODERATE_SKIP: 'modSkip', // a mod skips the current DJ
    MODERATE_STAFF: 'modStaff', // a mod changes somebody's staff level
    ROOM_DESCRIPTION_UPDATE: 'roomDescriptionUpdate', // a mod changes the room's description
    ROOM_JOIN: 'roomJoin', // the bot joins a room
    ROOM_MIN_CHAT_LEVEL_UPDATE: 'roomMinChatLevelUpdate', // a mod changes the minimum level users must have to chat
    ROOM_NAME_UPDATE: 'roomNameUpdate', // a mod changes the room's name
    ROOM_WELCOME_UPDATE: 'roomWelcomeUpdate', // a mod changes the room's welcome message
    SKIP: 'skip', // the current DJ chooses to skip
    USER_JOIN: 'userJoin', // a user joins the room
    USER_LEAVE: 'userLeave', // a user leaves the room
    USER_UPDATE: 'userUpdate', // something changes about a user (e.g. name, avatar, level, etc)
    VOTE: 'vote' // a user woots or mehs
};

var BanDuration = {
    DAY: "1 day",
    HOUR: "1 hour",
    FOREVER: "Forever"
};

var BanReason = {
    SPAMMING_OR_TROLLING: "Spamming or trolling",
    VERBAL_ABUSE_OR_OFFENSIVE_LANGUAGE: "Verbal abuse or offensive language",
    PLAYING_OFFENSIVE_MEDIA: "Playing offensive videos/songs",
    REPEATEDLY_PLAYING_INAPPROPRIATE_GENRES: "Repeatedly playing inappropriate genre(s)",
    NEGATIVE_ATTITUDE: "Negative attitude"
};

var ChatType = {
    COMMAND: "command",
    EMOTE : "emote",
    MESSAGE : "message"
};

var MuteReason = {
    NEGATIVE_ATTITUDE: "Negative attitude",
    OFFENSIVE_LANGUAGE: "Offensive language",
    SPAMMING_OR_TROLLING: "Spamming or trolling",
    VERBAL_ABUSE_OR_HARASSMENT: "Verbal abuse or harassment",
    VIOLATING_COMMUNITY_RULES: "Violating community rules"
};

var Role = {
    NONE : { name: "none", level: 0 },
    RESIDENT_DJ : { name: "residentDj", level: 1},
    BOUNCER : { name: "bouncer", level: 2},
    MANAGER : { name: "manager", level: 3},
    COHOST : { name: "cohost", level: 4},
    HOST : { name: "host", level: 5}
};

var _eventTranslatorMap = {
    'advance': _translateAdvanceObject,
    'chat': _translateChatObject,
    'command': _translateCommandObject,
    'chatDelete': _translateChatDeleteObject,
    'djListCycle': _translateDjListCycleObject,
    'djListUpdate': _translateDjListUpdateObject,
    'djListLocked': _translateDjListLockedObject,
    'earn': _translateEarnObject,
    'grab': _translateGrabObject,
    'modAddDJ': _translateModAddDjObject,
    'modBan': _translateModBanObject,
    'modMoveDJ': _translateModMoveDjObject,
    'modMute': _translateModMuteObject,
    'modRemoveDJ': _translateModRemoveDjObject,
    'modSkip': _translateModSkipObject,
    'modStaff': _translateModStaffObject,
    'roomDescriptionUpdate': _translateRoomDescriptionUpdateObject,
    'roomJoin': _translateRoomJoinObject,
    'roomMinChatLevelUpdate': _translateRoomMinChatLevelUpdateObject,
    'roomNameUpdate': _translateRoomNameUpdateObject,
    'roomWelcomeUpdate': _translateRoomWelcomeUpdateObject,
    'skip': _translateSkipObject,
    'userJoin': _translateUserJoinObject,
    'userLeave': _translateUserLeaveObject,
    'userUpdate': _translateUserUpdateObject,
    'vote': _translateVoteObject
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
    for (var eventKey in Event) {
        var eventName = Event[eventKey];
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

    for (var eventKey in Event) {
        var eventName = Event[eventKey];
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
    Utils.checkValueIsInObject(banDuration, BanDuration, "PlugBotBase.banUser called with an invalid BanDuration: " + banDuration);
    Utils.checkValueIsInObject(banReason, BanReason, "PlugBotBase.banUser called with an invalid BanReason: " + banReason);

    if (callback) {
        Utils.checkHasType(callback, "function", "PlugBotBase.banUser called with a non-function value for 'callback' argument");
    }

    // Translate from our model to PlugAPI
    var translatedBanDuration, translatedBanReason;

    switch (banDuration) {
        case BanDuration.HOUR:
            translatedBanDuration = PlugAPI.BAN.HOUR;
            break;
        case BanDuration.DAY:
            translatedBanDuration = PlugAPI.BAN.DAY;
            break;
        case BanDuration.FOREVER:
            translatedBanDuration = PlugAPI.BAN.PERMA;
            break;
    }

    switch (banReason) {
        case BanReason.SPAMMING_OR_TROLLING:
            translatedBanReason = PlugAPI.BAN_REASON.SPAMMING_TROLLING;
            break;
        case BanReason.VERBAL_ABUSE_OR_OFFENSIVE_LANGUAGE:
            translatedBanReason = PlugAPI.BAN_REASON.VERBAL_ABUSE;
            break;
        case BanReason.PLAYING_OFFENSIVE_MEDIA:
            translatedBanReason = PlugAPI.BAN_REASON.OFFENSIVE_MEDIA;
            break;
        case BanReason.REPEATEDLY_PLAYING_INAPPROPRIATE_GENRES:
            translatedBanReason = PlugAPI.BAN_REASON.INAPPROPRIATE_GENRE;
            break;
        case BanReason.NEGATIVE_ATTITUDE:
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
    LOG.info("Connected to room successfully.");
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

// ========================================
// Functions for translating event objects
// ========================================

function _repairTitle(author, title) {
    return (author ? author + " - " : "") + title;
}

function _translateDjObject(plugapiDj) {
    if (!plugapiDj) {
        return null;
    }

    return {
        avatarID: plugapiDj.avatarID,
        joinDate: plugapiDj.joined,
        level: plugapiDj.level,
        role: _translateRole(plugapiDj.role),
        userID: plugapiDj.id,
        username: plugapiDj.username
    };
}

function _translateAdvanceObject(event) {
    if (!event.currentDJ || !event.media) {
        return null;
    }

    var obj = {
        incomingDJ: _translateDjObject(event.currentDJ), // the user who is DJing following this event
        media: {
            author: event.media.author, // plug.dj's guess of who the author is
            contentID: event.media.cid, // the Youtube or Soundcloud ID
            durationInSeconds: event.media.duration, // how long the media is, in seconds
            fullTitle: _repairTitle(event.media.author, event.media.title), // our guess of what the song's original title was
            title: event.media.title // plug.dj's guess of what the title is
        },
        startDate: event.startTime // when the media begins playing
    };

    var waitlist = [];
    for (var i = 0; i < event.djs.length; i++) {
        waitlist.push(_translateDjObject(event.djs[i]));
    }

    obj.waitlistedDJs = waitlist; // the current state of the waitlist

    if (event.lastPlay && event.lastPlay.dj && event.lastPlay.media && event.lastPlay.score) {
        obj.previousPlay = { // the media which played before this one
            dj: _translateDjObject(event.lastPlay.dj),
            media: {
                author: event.lastPlay.media.author,
                contentID: event.lastPlay.media.cid,
                durationInSeconds: event.lastPlay.media.duration,
                fullTitle: _repairTitle(event.lastPlay.media.author, event.lastPlay.media.title), // our guess of what the song's original title was
                title: event.lastPlay.media.title
            },
            score: {
                grabs: event.lastPlay.score.grabs,
                listeners: event.lastPlay.score.listeners,
                mehs: event.lastPlay.score.negative,
                woots: event.lastPlay.score.positive,
                wasSkipped: event.lastPlay.score.skipped > 0
            }
        };
    }

    return obj;
}

function _translateChatObject(event) {
    return {
        chatID: event.raw.cid, // an ID assigned by plug.dj uniquely identifying this message
        isMuted: event.muted, // whether the user chatting is muted
        message: event.message, // the chat message sent
        type: _translateChatType(event), // what type of message was sent
        userID: event.from.id, // the ID of the user chatting
        username: event.from.username // the username of the user chatting
    };
}

function _translateChatDeleteObject(event) {
    return {
        chatID: event.c, // the ID of the chat message which was deleted
        modUserID: event.mi // the ID of the mod who deleted the message
    };
}

function _translateChatType(event) {
    if (event.message[0] === "!") {
        return ChatType.COMMAND;
    }

    switch (event.type) {
        case "message":
            return ChatType.MESSAGE;
        case "emote":
            return ChatType.EMOTE;
        case "mention":
            return ChatType.MESSAGE; // having a separate chat type is silly
        default:
            LOG.error("Unable to identify chat type {}. Defaulting to {}.", type, ChatType.MESSAGE);
            return ChatType.MESSAGE;
    }
}

function _translateCommandObject(event) {
    var obj = {
        command: event.command, // the command sent
        isMuted: event.muted, // whether the user chatting is muted
        userID: event.from.id, // the ID of the user chatting
        username: event.from.username, // the username of the user chatting
        userRole: _translateRole(event.from.role)
    };

    // Split message by spaces; splice to remove the command name from the arguments
    obj.args = event.message.trim().split(/\s+/).splice(1);

    return obj;
}

function _translateDjListCycleObject(event) {
    return {
        isDjCycleOn: event.f, // whether DJ cycle is on following this event
        modUsername: event.m, // the username of the mod who flipped DJ cycle
        modUserID: event.mi // the ID of the mod who flipped DJ cycle
    };
}

function _translateDjListUpdateObject(event) {
    return {
        userIDs: event // IDs of the users who are in the waitlist
    };
}

function _translateDjListLockedObject(event) {
    return {
        isWaitListOpen: !event.f, // whether the wait list is open following this event
        wasWaitListCleared: event.c, // whether the wait list was cleared by this event
        modUsername: event.m, // the username of the mod who changed the wait list
        modUserID: event.mi // the ID of the mod who changed the wait list
    };
}

function _translateEarnObject(event) {
    return {
        level: event.level, // current level of the bot
        totalExp: event.exp // bot's total experience
    };
}

function _translateGrabObject(event) {
    return {
        userID: event // ID of the user who grabbed the song
    };
}

function _translateModAddDjObject(event) {
    return {
        modUsername: event.m, // username of the mod who added the DJ
        modUserID: event.mi, // ID of the mod who added the DJ
        username: event.t // username of the DJ added to the wait list
    };
}

function _translateModBanObject(event) {
    var duration = event.d === "h" ? BanDuration.HOUR : (event.d === "d" ? BanDuration.DAY : BanDuration.FOREVER);
    return {
        duration: duration, // how long the user is banned for
        modUsername: event.m, // username of the mod who banned the user
        modUserID: event.mi, // ID of the mod who banned the user
        username: event.t // username of the banned user
    };
}

function _translateModMoveDjObject(event) {
    return {
        modUsername: event.m, // username of the mod who moved the DJ
        modUserID: event.mi, // ID of the mod who moved the DJ
        movedUsername: event.u, // username of the DJ who got moved
        newPosition: event.n, // new position in the wait list of the DJ
        oldPosition: event.o // old position in the wait list of the DJ
    };
}

function _translateModMuteObject(event) {
    var muteReason;
    switch (event.r) {
        case 1:
            muteReason = MuteReason.VIOLATING_COMMUNITY_RULES;
            break;
        case 2:
            muteReason = MuteReason.VERBAL_ABUSE_OR_HARASSMENT;
            break;
        case 3:
            muteReason = MuteReason.SPAMMING_OR_TROLLING;
            break;
        case 4:
            muteReason = MuteReason.OFFENSIVE_LANGUAGE;
            break;
        case 5:
            muteReason = MuteReason.NEGATIVE_ATTITUDE;
            break;
        default:
            muteReason = MuteReason.VIOLATING_COMMUNITY_RULES;
            LOG.error("Unable to translate mute reason {}. Defaulting to {}.", event.r, muteReason);
            break;
    }

    var muteDurationInSeconds;
    switch (event.d) {
        case "s":
            muteDurationInSeconds = 15 * 60;
            break;
        case "d":
            muteDurationInSeconds = 30 * 60;
            break;
        case "l":
            muteDurationInSeconds = 45 * 60;
            break;
        default:
            muteDurationInSeconds = 30 * 60;
            LOG.error("Unable to translate mute duration '{}'. Defaulting to {} seconds.", event.d, muteDurationInSeconds);
            break;
    }

    return {
        muteDurationInSeconds: muteDurationInSeconds, // how long the user is muted for
        mutedUserID: event.i, // the ID of the user who's been muted
        mutedUsername: event.t, // the username of the user who's been muted
        modUsername: event.m, // the username of the mod who muted the user
        reason: muteReason // the reason the mod selected for muting the user
    };
}

function _translateModRemoveDjObject(event) {
    return {
        modUsername: event.m, // username of mod who removed the DJ
        modUserID: event.mi, // ID of the mod who removed the DJ
        removedUsername: event.t // username of the DJ who was removed
    };
}

function _translateModSkipObject(event) {
    return {
        modUsername: event.m, // username of the mod who skipped
        modUserID: event.mi // ID of the mod who skipped
    };
}

function _translateModStaffObject(event) {
    var changedUsers = [];
    for (var i = 0; i < event.u.length; i++) {
        var user = event.u[i];
        var userObj = {
            userID: user.i, // ID of the user being updated
            username: user.n, // username of the user being updated
            role: _translateRole(user.p) // newly assigned role of the user
        };
        changedUsers.push(userObj);
    }

    return {
        modUsername: event.m, // username of the mod who changed staff permissions
        modUserID: event.mi, // ID of the mod who changed staff permissions
        users: changedUsers // list of the users who have been updated
    };
}

function _translateRoomDescriptionUpdateObject(event) {
    return {
        newDescription: event.d, // new description of the room
        userID: event.u // ID of the mod who changed the description
    };
}

function _translateRoomJoinObject(event) {
    return {
        roomName: event // name of the room which was joined
    };
}

function _translateRoomMinChatLevelUpdateObject(event) {
    return {
        minLevel: event.m, // the level that users must be at to chat following this event
        userID: event.u // ID of the mod who changed the chat level
    };
}

function _translateRoomNameUpdateObject(event) {
    return {
        newName: event.n, // new name of the room
        userID: event.u // ID of the mod who changed the name
    };
}

function _translateRoomWelcomeUpdateObject(event) {
    return {
        newWelcomeMessage: event.w, // new welcome message of the room
        userID: event.u // ID of the mod who changed the name
    };
}

function _translateSkipObject(event) {
    return {
        userID: event // ID of the user who chose to skip their own song
    };
}

function _translateUserJoinObject(event) {
    return _translateDjObject(event);
}

function _translateUserLeaveObject(event) {
    return _translateDjObject(event);
}

function _translateUserUpdateObject(event) {
    return _translateDjObject(event);
}

function _translateVoteObject(event) {
    return {
        userID: event.i, // ID of the user voting
        vote: event.v // 1 for a woot, -1 for a meh
    };
}

/**
 * Translates the role integer returned by the plug.dj API into an internal model.
 *
 * @param {integer} roleAsInt - The plug.dj API role
 * @returns {object} A corresponding object from the Role enum
 */
function _translateRole(roleAsInt) {
    switch (roleAsInt) {
        case 0:
            return Role.NONE;
        case 1:
            return Role.RESIDENT_DJ;
        case 2:
            return Role.BOUNCER;
        case 3:
            return Role.MANAGER;
        case 4:
            return Role.COHOST;
        case 5:
            return Role.HOST;
        default:
            LOG.error("Failed to translate role '{}' into Role enum. Defaulting to NONE.", roleAsInt);
            return Role.NONE;
    }
}

exports.BanDuration = BanDuration;
exports.BanReason = BanReason;
exports.Bot = Bot;
exports.ChatType = ChatType;
exports.Event = Event;
exports.MuteReason = MuteReason;
exports.UserRole = Role;
