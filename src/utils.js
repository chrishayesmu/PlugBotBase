"use strict";

/**
 * File exposing some utility functions for use within PlugBotBase.
 */

/**
 * Checks that the value provided has the expected type. If it does not,
 * throws an error with the message provided. If the message contains "{{actual}}",
 * that will be replaced with the actual type of value; similarly, the string "{{expected}}"
 * will be replaced with the expected type given.
 *
 * @param {mixed} value - The value to check
 * @param {string} type - The expected type of the value
 * @param {string} message - A message to throw in an Error if the string is empty
 */
function checkHasType(value, type, message) {
    checkNotEmpty(message, "No error message passed to checkHasType");
    if (typeof value !== type) {
        message = message.replace("{{actual}}", typeof value).replace("{{expected}}", type);
        throw new Error(message);
    }
}

/**
 * Ensures that the value passed in is not null or undefined.
 * If it is, throws an error with the message provided.
 *
 * @param {mixed} value - Anything which should not be null or undefined
 * @param {string} message - A message to throw in an Error if no value is present
 */
function checkHasValue(value, message) {
    checkNotEmpty(message, "No error message passed to checkHasValue");

    if (value === null || typeof value === "undefined") {
        throw new Error(message);
    }
}

/**
 * Checks that the string passed in is not null, empty or entirely whitespace.
 * If this is not the case, throws an error with the message provided.
 *
 * @param {string} string - The string to check
 * @param {string} message - A message to throw in an Error if the string is empty
 */
function checkNotEmpty(string, message) {
    if (!message || !message.trim()) {
        throw new Error("No error message passed to checkNotEmpty");
    }

    if (!string || !string.trim()) {
        throw new Error(message);
    }
}

/**
 * Checks that the value provided exists under one of the top-level
 * keys in the object provided. If it does not, an error is thrown
 * containing the message given.
 *
 * @param {mixed} value - A value to search for
 * @param {object} object - An object to search in
 * @param {string} message - A message to throw in an Error if the string is empty
 */
function checkValueIsInObject(value, object, message) {
    checkNotEmpty(message, "No error message passed to checkValueIsInObject");

    var key = findValueInObject(value, object);

    if (typeof key === "undefined") {
        // Make sure the value's actually missing and it's not hidden behind undefined
        if (!(undefined in object && deepEquals(value, object[undefined]))) {
            throw new Error(message);
        }
    }
}

/**
 * Performs a deep check to see if the two values provided are equal. For
 * non-object types, this refers to simple equality; for object types, the
 * two objects must contain all of the same keys and have the same values behind
 * all of those keys.
 *
 * THIS METHOD DOES NOT CHECK FOR CYCLES IN THE OBJECTS PROVIDED. Don't try to
 * use it with any objects that may have cycles or you'll likely find your thread
 * frozen forever.
 *
 * @param {object} obj1 - The first object to check
 * @param {object} obj2 - The second object to check
 * @returns {boolean} True if the two values are equal and all of the values contained in them are also equal
 */
function deepEquals(obj1, obj2) {
    if (typeof obj1 !== typeof obj2) {
        return false;
    }

    // NaN check
    if (obj1 !== obj1) {
        return obj2 !== obj2;
    }

    // Non-object types will compare correctly with ===
    if (typeof obj1 !== "object") {
        return obj1 === obj2;
    }

    if (!_checkKeysFromFirstAreInSecond(obj1, obj2)) {
        return false;
    }

    if (!_checkKeysFromFirstAreInSecond(obj2, obj1)) {
        return false;
    }

    return true;
}

/**
 * Locates the value provided under the first level of keys in the given object.
 * Since this function uses undefined as a return value when the provided value
 * is not found, it is not possible to directly search for anything where the key
 * is actually undefined. Anyone interested in this functionality can easily wrap
 * this method to check if undefined is a key in their object.
 *
 * @param {mixed} value - A value to search for
 * @param {object} object - An object to search in
 * @returns {mixed} The key where the object was found, or undefined if it was not found
 */
function findValueInObject(value, object) {
    checkHasType(object, "object", "Non-object value provided as second argument to findValueInObject");
    checkHasValue(object, "Invalid null object provided as second argument to findValueInObject");

    for (var key in object) {
        var objValue = object[key];

        if (deepEquals(value, objValue)) {
            return key;
        }
    }

    return; // explicit return of undefined
}

/**
 * Replaces each instance of "{}" in the input string with a string value corresponding
 * to the arguments passed in to the function.
 *
 * @param {string} string - The string to replace in
 * @returns {string} A string with placeholders replaced
 */
function replaceStringPlaceholders(string, args) {
    for (var i = 1; i < args.length; i++) {
        var value = args[i];
        if (typeof value === "object") {
            value = JSON.stringify(value);
        }

        string = string.replace("{}", value);
    }

    return string;
}

/**
 * Checks that the keys which are in the first object are also in the second object,
 * and that they have the same value in both places.
 *
 * @param {object} first - The first object to check
 * @param {object} second - The second object to check
 * @returns {boolean} True if all of the keys from the first are present and equal in the second
 */
function _checkKeysFromFirstAreInSecond(first, second) {
    for (var key in first) {
        if (!(key in second)) {
            return false;
        }

        var value1 = first[key];
        var value2 = second[key];

        if (!deepEquals(value1, value2)) {
            return false;
        }
    }

    return true;
}

module.exports = {
    checkHasType: checkHasType,
    checkHasValue: checkHasValue,
    checkNotEmpty: checkNotEmpty,
    checkValueIsInObject: checkValueIsInObject,
    deepEquals: deepEquals,
    findValueInObject: findValueInObject,
    replaceStringPlaceholders: replaceStringPlaceholders
};
