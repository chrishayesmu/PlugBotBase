function Log(loggerName) {
    this._loggerName = loggerName;
}

Log.prototype.debug = _generateLogFunc("DEBUG");
Log.prototype.info = _generateLogFunc("INFO");
Log.prototype.warn = _generateLogFunc("WARN");
Log.prototype.error = _generateLogFunc("ERROR");

Log.prototype._log = function(level, message) {
    var now = new Date();
    console.log("[" + now + "] [" + level + "] " + this._loggerName + " : " + message);
}

function _generateLogFunc(level) {
    return function(message) {
        if (typeof message === "object") {
            message = JSON.stringify(message);
        }

        for (var i = 1; i < arguments.length; i++) {
            var value = arguments[i];
            if (typeof value === "object") {
                value = JSON.stringify(value);
            }

            message = message.replace("{}", value);
        }

        this._log(level, message);
    };
}

module.exports = Log;
