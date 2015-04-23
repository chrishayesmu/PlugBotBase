var Log = require("./log");
var PlugBotBase = require("./plug");
var Translator = require("./translator");
var Types = require("./types");

var LOG = new Log("PlugBotBaseStateTracker");

/**
 *
 * @param {object} bot - The bot which holds event listeners
 */
function connectEventListeners(bot) {
}

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
    bot.on(Types.Event.MODERATE_REMOVE_DJ, onModerateRemoveDj);
    bot.on(Types.Event.USER_LEAVE, onUserLeave);
    bot.on(Types.Event.USER_JOIN, onUserJoin);

    onComplete();
}

function onAdvance(event, globalObject) {
    // Move the current DJ to the end of the wait list
    var outgoingDJ = globalObject.roomState.usersInWaitList.shift();
    if (outgoingDJ) {
        globalObject.roomState.usersInWaitList.push(outgoingDJ);
    }

    // Add the new song to the song history
    globalObject.roomState.playHistory.unshift(event.media);
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
