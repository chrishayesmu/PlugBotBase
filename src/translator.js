"use strict";

/**
 * Contains a whole bunch of functions for translating from
 * PlugAPI to PlugBotBase, and a few functions for going the
 * other way.
 */

var Log = require("./log");
var Types = require("./types");

var LOG = new Log("Translator");

function _repairTitle(author, title) {
    return (author ? author + " - " : "") + title;
}

/**
 * Translates a date string from PlugAPI into a UNIX timestamp.
 *
 * @param {string} string - The date string to parse
 * @returns {integer} The UNIX timestamp represented by the string
 */
function translateDateString(string) {
    // Date strings from plug.dj are in a very specific format:
    // yyyy-mm-dd HH:MM:SS.SSSSSS
    if (string.length != 26) {
        LOG.error("Received an invalid date string to translate: {}", string);
        return;
    }

    // Add the time zone; plug appears to use UTC (though it could be GMT)
    string = string + " UTC";

    return Date.parse(string);
}

function translateMediaObject(media) {
    if (!media) {
        return null;
    }

    return {
        author: media.author, // plug.dj's guess of who the author is
        contentID: media.cid, // the Youtube or Soundcloud ID
        durationInSeconds: media.duration, // how long the media is, in seconds
        fullTitle: _repairTitle(media.author, media.title), // our guess of what the song's original title was
        title: media.title // plug.dj's guess of what the title is
    };
}

function translateScoreObject(score) {
    if (!score) {
        return null;
    }

    return {
        grabs: score.grabs,
        listeners: score.listeners,
        mehs: score.negative,
        woots: score.positive,
        wasSkipped: score.skipped > 0
    };
}

function translateUserObject(plugapiDj) {
    if (!plugapiDj) {
        return null;
    }

    return {
        avatarID: plugapiDj.avatarID,
        joinDate: translateDateString(plugapiDj.joined),
        level: plugapiDj.level,
        role: translateRole(plugapiDj.role),
        userID: plugapiDj.id,
        username: plugapiDj.username
    };
}

function translateAdvanceEvent(event) {
    if (!event.currentDJ || !event.media) {
        return null;
    }

    var obj = {
        incomingDJ: translateUserObject(event.currentDJ), // the user who is DJing following this event
        media: translateMediaObject(event.media),
        startDate: translateDateString(event.startTime) // when the media begins playing
    };

    var waitlist = [];
    for (var i = 0; i < event.djs.length; i++) {
        waitlist.push(translateUserObject(event.djs[i]));
    }

    obj.waitlistedDJs = waitlist; // the current state of the waitlist

    if (event.lastPlay && event.lastPlay.dj && event.lastPlay.media && event.lastPlay.score) {
        obj.previousPlay = { // the media which played before this one
            dj: translateUserObject(event.lastPlay.dj),
            media: translateMediaObject(event.lastPlay.media),
            score: translateScoreObject(event.lastPlay.score)
        };
    }

    return obj;
}

function translateChatEvent(event) {
    return {
        chatID: event.raw.cid, // an ID assigned by plug.dj uniquely identifying this message
        isMuted: event.muted, // whether the user chatting is muted
        message: event.message, // the chat message sent
        type: translateChatType(event), // what type of message was sent
        userID: event.from.id, // the ID of the user chatting
        username: event.from.username // the username of the user chatting
    };
}

function translateChatDeleteEvent(event) {
    return {
        chatID: event.c, // the ID of the chat message which was deleted
        modUserID: event.mi // the ID of the mod who deleted the message
    };
}

function translateChatType(event) {
    if (event.message[0] === "!") {
        return Types.ChatType.COMMAND;
    }

    switch (event.type) {
        case "message":
            return Types.ChatType.MESSAGE;
        case "emote":
            return Types.ChatType.EMOTE;
        case "mention":
            return Types.ChatType.MESSAGE; // having a separate chat type is silly
        default:
            LOG.error("Unable to identify chat type {}. Defaulting to {}.", type, Types.ChatType.MESSAGE);
            return Types.ChatType.MESSAGE;
    }
}

function translateCommandEvent(event) {
    var obj = {
        command: event.command, // the command sent
        isMuted: event.muted, // whether the user chatting is muted
        userID: event.from.id, // the ID of the user chatting
        username: event.from.username, // the username of the user chatting
        userRole: translateRole(event.from.role)
    };

    // Split message by spaces; splice to remove the command name from the arguments
    obj.args = event.message.trim().split(/\s+/).splice(1);

    return obj;
}

function translateDjListCycleEvent(event) {
    return {
        isDjCycleOn: event.f, // whether DJ cycle is on following this event
        modUsername: event.m, // the username of the mod who flipped DJ cycle
        modUserID: event.mi // the ID of the mod who flipped DJ cycle
    };
}

function translateDjListUpdateEvent(event) {
    return {
        userIDs: event // IDs of the users who are in the waitlist
    };
}

function translateDjListLockedEvent(event) {
    return {
        isWaitListOpen: !event.f, // whether the wait list is open following this event
        wasWaitListCleared: event.c, // whether the wait list was cleared by this event
        modUsername: event.m, // the username of the mod who changed the wait list
        modUserID: event.mi // the ID of the mod who changed the wait list
    };
}

function translateEarnEvent(event) {
    return {
        level: event.level, // current level of the bot
        totalExp: event.exp // bot's total experience
    };
}

function translateGrabEvent(event) {
    return {
        userID: event // ID of the user who grabbed the song
    };
}

function translateModAddDjEvent(event) {
    return {
        modUsername: event.m, // username of the mod who added the DJ
        modUserID: event.mi, // ID of the mod who added the DJ
        username: event.t // username of the DJ added to the wait list
    };
}

function translateModBanEvent(event) {
    var duration = event.d === "h" ? Types.BanDuration.HOUR : (event.d === "d" ? Types.BanDuration.DAY : Types.BanDuration.FOREVER);
    return {
        duration: duration, // how long the user is banned for
        modUsername: event.m, // username of the mod who banned the user
        modUserID: event.mi, // ID of the mod who banned the user
        username: event.t // username of the banned user
    };
}

function translateModMoveDjEvent(event) {
    return {
        modUsername: event.m, // username of the mod who moved the DJ
        modUserID: event.mi, // ID of the mod who moved the DJ
        movedUsername: event.u, // username of the DJ who got moved
        newPosition: event.n, // new position in the wait list of the DJ
        oldPosition: event.o // old position in the wait list of the DJ
    };
}

function translateModMuteEvent(event) {
    var muteReason;
    switch (event.r) {
        case 1:
            muteReason = Types.MuteReason.VIOLATING_COMMUNITY_RULES;
            break;
        case 2:
            muteReason = Types.MuteReason.VERBAL_ABUSE_OR_HARASSMENT;
            break;
        case 3:
            muteReason = Types.MuteReason.SPAMMING_OR_TROLLING;
            break;
        case 4:
            muteReason = Types.MuteReason.OFFENSIVE_LANGUAGE;
            break;
        case 5:
            muteReason = Types.MuteReason.NEGATIVE_ATTITUDE;
            break;
        default:
            muteReason = Types.MuteReason.VIOLATING_COMMUNITY_RULES;
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

function translateModRemoveDjEvent(event) {
    return {
        modUsername: event.m, // username of mod who removed the DJ
        modUserID: event.mi, // ID of the mod who removed the DJ
        removedUsername: event.t // username of the DJ who was removed
    };
}

function translateModSkipEvent(event) {
    return {
        modUsername: event.m, // username of the mod who skipped
        modUserID: event.mi // ID of the mod who skipped
    };
}

function translateModStaffEvent(event) {
    var changedUsers = [];
    for (var i = 0; i < event.u.length; i++) {
        var user = event.u[i];
        var userObj = {
            userID: user.i, // ID of the user being updated
            username: user.n, // username of the user being updated
            role: translateRole(user.p) // newly assigned role of the user
        };
        changedUsers.push(userObj);
    }

    return {
        modUsername: event.m, // username of the mod who changed staff permissions
        modUserID: event.mi, // ID of the mod who changed staff permissions
        users: changedUsers // list of the users who have been updated
    };
}

function translateRoomDescriptionUpdateEvent(event) {
    return {
        newDescription: event.d, // new description of the room
        userID: event.u // ID of the mod who changed the description
    };
}

function translateRoomJoinEvent(event) {
    return {
        roomName: event // name of the room which was joined
    };
}

function translateRoomMinChatLevelUpdateEvent(event) {
    return {
        minLevel: event.m, // the level that users must be at to chat following this event
        userID: event.u // ID of the mod who changed the chat level
    };
}

function translateRoomNameUpdateEvent(event) {
    return {
        newName: event.n, // new name of the room
        userID: event.u // ID of the mod who changed the name
    };
}

function translateRoomWelcomeUpdateEvent(event) {
    return {
        newWelcomeMessage: event.w, // new welcome message of the room
        userID: event.u // ID of the mod who changed the name
    };
}

function translateSkipEvent(event) {
    return {
        userID: event // ID of the user who chose to skip their own song
    };
}

function translateUserJoinEvent(event) {
    return translateUserObject(event);
}

function translateUserLeaveEvent(event) {
    return translateUserObject(event);
}

function translateUserUpdateEvent(event) {
    return translateUserObject(event);
}

function translateVoteEvent(event) {
    return {
        userID: event.i, // ID of the user voting
        vote: event.v // 1 for a woot, -1 for a meh
    };
}

/**
 * Translates the role integer returned by the plug.dj API into an internal model.
 *
 * @param {integer} roleAsInt - The plug.dj API role
 * @returns {object} A corresponding object from the UserRole enum
 */
function translateRole(roleAsInt) {
    switch (roleAsInt) {
        case 0:
            return Types.UserRole.NONE;
        case 1:
            return Types.UserRole.RESIDENT_DJ;
        case 2:
            return Types.UserRole.BOUNCER;
        case 3:
            return Types.UserRole.MANAGER;
        case 4:
            return Types.UserRole.COHOST;
        case 5:
            return Types.UserRole.HOST;
        default:
            LOG.error("Failed to translate role '{}' into UserRole enum. Defaulting to NONE.", roleAsInt);
            return Types.UserRole.NONE;
    }
}

module.exports = {
    translateAdvanceEvent: translateAdvanceEvent,
    translateChatEvent: translateChatEvent,
    translateCommandEvent: translateCommandEvent,
    translateChatDeleteEvent: translateChatDeleteEvent,
    translateDateString: translateDateString,
    translateDjListCycleEvent: translateDjListCycleEvent,
    translateDjListUpdateEvent: translateDjListUpdateEvent,
    translateDjListLockedEvent: translateDjListLockedEvent,
    translateEarnEvent: translateEarnEvent,
    translateGrabEvent: translateGrabEvent,
    translateMediaObject: translateMediaObject,
    translateModAddDjEvent: translateModAddDjEvent,
    translateModBanEvent: translateModBanEvent,
    translateModMoveDjEvent: translateModMoveDjEvent,
    translateModMuteEvent: translateModMuteEvent,
    translateModRemoveDjEvent: translateModRemoveDjEvent,
    translateModSkipEvent: translateModSkipEvent,
    translateModStaffEvent: translateModStaffEvent,
    translateRole: translateRole,
    translateRoomDescriptionUpdateEvent: translateRoomDescriptionUpdateEvent,
    translateRoomJoinEvent: translateRoomJoinEvent,
    translateRoomMinChatLevelUpdateEvent: translateRoomMinChatLevelUpdateEvent,
    translateRoomNameUpdateEvent: translateRoomNameUpdateEvent,
    translateRoomWelcomeUpdateEvent: translateRoomWelcomeUpdateEvent,
    translateScoreObject: translateScoreObject,
    translateSkipEvent: translateSkipEvent,
    translateUserJoinEvent: translateUserJoinEvent,
    translateUserLeaveEvent: translateUserLeaveEvent,
    translateUserObject: translateUserObject,
    translateUserUpdateEvent: translateUserUpdateEvent,
    translateVoteEvent: translateVoteEvent
};
