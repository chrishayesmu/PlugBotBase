var Log = require("./log");
var PlugBotBase = require("./plug");
var Translator = require("./translator");
var Types = require("./types");

var LOG = new Log("PlugBotBaseStateTracker");

/**
 * Initializes the state tracker by doing a couple of things:
 *
 * 1) Connects all of the event listeners we need. This function should be called
 * before registering any other event listeners at all; that will guarantee
 * that these listeners are called first, and can update state that the other
 * event listeners may rely on.
 * 2) Determines the initial state of the room via some API calls.
 *
 * Because asynchronous API calls are in use, it's possible to pass a callback to
 * this function.
 *
 * @param {object} globalObject - The global object shared throughout the bot
 * @param {function} onComplete - Optional. A function that will be called once the
 *                                initialization of this module is complete.
 */
function init(globalObject, onComplete) {
    var bot = globalObject.bot;

    globalObject.roomState = {
        chatHistory: [],
        playHistory: [],
        usersInRoom: [],
        usersInWaitList: []
    };

    bot.on(Types.Event.ADVANCE, onAdvance);
    bot.on(Types.Event.CHAT, onChat);
    bot.on(Types.Event.CHAT_DELETE, onChatDelete);
    bot.on(Types.Event.DJ_LIST_UPDATE, onDjListUpdate);
    bot.on(Types.Event.GRAB, onGrab);
    bot.on(Types.Event.MODERATE_REMOVE_DJ, onModerateRemoveDj);
    bot.on(Types.Event.USER_LEAVE, onUserLeave);
    bot.on(Types.Event.USER_JOIN, onUserJoin);
    bot.on(Types.Event.VOTE, onVote);

    globalObject.roomState.findUserInRoomById = function(userID) {
        return _findUser(globalObject.roomState.usersInRoom, userID);
    };

    globalObject.roomState.findUserInWaitListById = function(userID) {
        return _findUser(globalObject.roomState.usersInWaitList, userID);
    };

    populateUsers(globalObject, onComplete);
}

function populateUsers(globalObject, callback) {
    // Drill into the undocumented 'bot within a bot' which is PlugAPI for some info.
    // getHistory() is the only async API we use, so we start off with that in order
    // to make sure all of our data comes from approximately the same point in time.
    globalObject.bot.bot.getHistory(function(playHistory) {
        var currentSong = Translator.translateMediaObject(globalObject.bot.bot.getMedia());
        var currentDj = Translator.translateUserObject(globalObject.bot.bot.getDJ());
        var users = globalObject.bot.bot.getUsers();
        var waitList = globalObject.bot.bot.getWaitList();

        for (var i = 0; i < users.length; i++) {
            var user = Translator.translateUserObject(users[i]);
            globalObject.roomState.usersInRoom.push(user);
        }

        // Figure out who's in the wait list. The current DJ should be included but
        // isn't, so adjust for that too
        globalObject.roomState.usersInWaitList.push(currentDj);

        for (i = 0; i < waitList.length; i++) {
            var translatedDj = Translator.translateUserObject(waitList[i]);
            globalObject.roomState.usersInWaitList.push(translatedDj);
        }

        // Initialize DJ history (up to 50 songs)
        for (i = 0; i < playHistory.length; i++) {
            var play = {
                media: Translator.translateMediaObject(playHistory[i].media),
                score: Translator.translateScoreObject(playHistory[i].score),
                startDate: Translator.translateDateString(playHistory[i].timestamp),
                user: {
                    userID: playHistory[i].user.id,
                    username: playHistory[i].user.username
                },
                votes: null // we can't get voting info from the history
            };
            globalObject.roomState.playHistory.push(play);
        }

        // Add the currently playing song to the DJ history, since we won't get
        // any other chance to do so. (At this point the initial ADVANCE event
        // from joining the room has almost certainly already fired and been missed.)
        if (currentSong && currentDj) {
            var elapsedTime = globalObject.bot.bot.getTimeElapsed();
            var startDate = Date.now() - elapsedTime * 1000;
            var currentPlay = {
                media: currentSong,
                startDate: startDate,
                user: currentDj,
                votes: {
                    grabs: [], // list of user IDs which fall into this category
                    mehs: [],
                    woots: []
                }
            };

            for (i = 0; i < users.length; i++) {
                var user = users[i];
                if (user.grab) {
                    currentPlay.votes.grabs.push(user.id);
                }
                if (user.vote === 1) {
                    currentPlay.votes.woots.push(user.id);
                }
                else if (user.vote === -1) {
                    currentPlay.votes.mehs.push(user.id);
                }
            }

            globalObject.roomState.playHistory.unshift(currentPlay);
        }

        callback();
    });

}

// =============================
// Event handlers
// =============================

function onAdvance(event, globalObject) {
    globalObject.roomState.usersInWaitList = event.waitlistedDJs;

    // Add the new song to the song history
    var play = {
        media: event.media,
        startDate: event.startDate,
        user: event.incomingDJ,
        votes: {
            grabs: [],
            mehs: [],
            woots: []
        }
    };

    globalObject.roomState.playHistory.unshift(play);
}

function onChat(event, globalObject) {
    var chatObj = {
        chatID: event.chatID,
        message: event.message,
        timestamp: Date.now(),
        type: event.type,
        userID: event.userID,
        username: event.username,
        wasUserMuted: event.isMuted
    };

    // Add this to the front of the chat history
    globalObject.roomState.chatHistory.unshift(chatObj);
}

function onChatDelete(event, globalObject) {
    var deletedMessageIndex = -1;
    var currentTime = Date.now();
    for (var i = 0; i < globalObject.roomState.chatHistory.length; i++) {
        var chatObj = globalObject.roomState.chatHistory[i];

        if (chatObj.chatID === event.chatID) {
            chatObj.isDeleted = true;
            chatObj.deletedByUserID = event.modUserID;
            chatObj.deletionTime = currentTime;
            deletedMessageIndex = i;
            break;
        }
    }

    // Chat deletion is odd: the event only mentions one ID which was deleted,
    // but plug will actually delete that message and all subsequent messages
    // belonging to the same user, until a message from someone else is found.
    if (deletedMessageIndex >= 0) {
        var deletedMessageUserID = globalObject.roomState.chatHistory[deletedMessageIndex].userID;
        for (var i = deletedMessageIndex + 1; i < globalObject.roomState.chatHistory.length; i++) {
            var chatObj = globalObject.roomState.chatHistory[i];
            if (chatObj.userID === deletedMessageUserID && !chatObj.isDeleted) {
                chatObj.isDeleted = true;
                chatObj.deletedByUserID = event.modUserID;
                chatObj.deletionTime = currentTime;
            }
            else {
                break;
            }
        }
    }
}

function onDjListUpdate(event, globalObject) {
    globalObject.roomState.usersInWaitList = event;
}

function onGrab(event, globalObject) {
    var currentSong = globalObject.roomState.playHistory[0];

    if (currentSong.votes.grabs.indexOf(event.userID) < 0) {
        currentSong.votes.grabs.push(event.userID);
    }
}

function onModerateRemoveDj(event, globalObject) {
    // Since we only get a username for this event, do a custom search
    for (var i = 0; i < globalObject.state.usersInWaitList.length; i++) {
        var user = globalObject.state.usersInWaitList[i];
        if (user.username === event.username) {
            globalObject.state.usersInWaitList.splice(i, 1);
            break;
        }
    }
}

function onUserLeave(event, globalObject) {
    _removeUser(globalObject.roomState.usersInRoom, event.userID);
    _removeUser(globalObject.roomState.usersInWaitList, event.userID);
}

function onUserJoin(event, globalObject) {
    var existingUser = _findUser(globalObject.roomState.usersInRoom, event.userID);

    if (existingUser) {
        LOG.warn("Received a user join event for a user who was already recorded " +
                 "as present (userID = {}, username = {}). This may indicate a bug in PlugBotBase.", event.userID, event.username);
        return;
    }

    globalObject.roomState.usersInRoom.push(event);
}

function onVote(event, globalObject) {
    var currentSong = globalObject.roomState.playHistory[0];
    var userID = event.userID;

    // Since users can change votes, we need to make
    // sure they're only in one list at a time

    if (currentSong.votes.woots.indexOf(userID) >= 0) {
        currentSong.votes.woots.splice(currentSong.votes.woots.indexOf(userID), 1);
    }

    if (currentSong.votes.mehs.indexOf(userID) >= 0) {
        currentSong.votes.mehs.splice(currentSong.votes.mehs.indexOf(userID), 1);
    }

    if (event.vote === 1) {
        currentSong.votes.woots.push(userID);
    }
    else if (event.vote === -1) {
        currentSong.votes.mehs.push(userID);
    }
}

function _findUserIndex(users, userID) {
    for (var i = 0; i < users.length; i++) {
        var user = users[i];

        if (user.userID === userID) {
            return i;
        }
    }

    return -1;
}

function _findUser(users, userID) {
    var index = _findUserIndex(users, userID);
    return index >= 0 ? users[index] : null;
}

function _removeUser(users, userID) {
    var index = _findUserIndex(users, userID);

    if (index >= 0) {
        users.splice(index, 1);
    }
}

module.exports = {
    init: init
};
