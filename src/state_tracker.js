var PlugBotBase = require("./plug");
var Event = PlugBotBase.Event;

/**
 * Connects all of the event listeners we need. This should be called
 * before registering any other event listeners at all; that will guarantee
 * that these listeners are called first.
 *
 * @param {object} bot - The bot which holds event listeners
 */
function connectEventListeners(bot) {
    bot.on(Event.
}

/**
 * Initializes the state tracker
 */
function init(globalObject, onComplete) {
    globalObject.roomState = {
        chatHistory: [],
        playHistory: [],
        usersInRoom: [],
        usersInWaitList: []
    };
}

module.exports = {
    init: init
};
