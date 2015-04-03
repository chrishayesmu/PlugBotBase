"use strict";

var fs = require("fs");
var path = require("path");

var Log = require("./log");

var LOG = new Log("config");

var REQUIRED_CONFIG_VARIABLES = [
    "pbb_bot_email",
    "pbb_bot_password",
    "pbb_room_name"
];

/**
 * Initializes the application's configuration by reading from
 * the config file "botConfig.json".
 *
 * @param {string} configFilePath - The path to a JSON file containing configuration
 * @param {object} defaults - An optional object containing default configuration.
 * @returns {object} An object representing configuration
 */
function create(basedir, defaults) {
    LOG.info("Initializing application configuration");
    var config = defaults || {};

    _loadBaseConfigFile(basedir, config);
    _validateConfig(config);

    if (config.pbb_immutable_config) {
        _freezeConfig(config);
    }

    LOG.info("Configuration set up successfully. The config object is now frozen and no changes can be made to it.");
    return config;
}

/**
 * Copies configuration from the main configuration file. The path to that
 * file must be specified in the NPM config variable "config_file". It will be
 * treated as a relative or absolute path based on the path itself.
 *
 * @param {string} baseDir - The directory to consider as the base path for any relative files
 * @param {object} config - The current config object
 */
function _loadBaseConfigFile(basedir, config) {
    var configFilePath = process.env.npm_package_config_pbb_config_file || "config/config.json";

    if (!configFilePath) {
        throw new Error("Could not locate the 'config_file' property in your NPM configuration.");
    }

    configFilePath = path.resolve(basedir, configFilePath);
    _copyConfigFromFile(configFilePath, config);
}

/**
 * Reads the JSON configuration out of the file specified.
 *
 * @param {string} filePath - The path to the file to load
 * @params {object} config - The current config object
 */
function _copyConfigFromFile(filePath, config) {
    LOG.info("Attempting to load configuration file '{}'", filePath);

    var fileConfig = require(filePath);
    _mergeConfig(config, fileConfig);

    LOG.info("Successfully read configuration file '{}'", filePath);
}

/**
 * Copies all environment variables beginning with NPM_CONFIG_PREFIX into
 * the config object.
 *
 * @params {object} config - The current config object
 */
function _copyNpmEnvironmentVariables(config) {
    for (var key in process.env) {
        if (key.indexOf(NPM_CONFIG_PREFIX) === 0) {
            var shortKey = key.replace(NPM_CONFIG_PREFIX, "");
            config[shortKey] = process.env[key];
        }
    }
}

/**
 * Freezes the configuration object and makes it immutable. This is a deep
 * method; all subobjects will also be immutable.
 *
 * @param {object} config - The current config object
 */
function _freezeConfig(config) {
    Object.freeze(config);

    for (var key in config) {
        if (typeof config[key] === "object") {
            _freezeConfig(config[key]);
        }
    }
}

/**
 * Merges the 'override' object into the 'base' object. Scalar values which exist in
 * both places are overridden, while object values are merged recursively.
 *
 * @param {object} base - The base object to merge into
 * @param {object} override - An object containing overriding values to merge from
 */
function _mergeConfig(base, override) {
    for (var key in override) {
        if (base[key] && typeof base[key] === "object" && typeof override[key] === "object") {
            _mergeConfig(base[key], override[key]);
        }
        else {
            base[key] = override[key];
        }
    }
}

/**
 * Parses obj[key] as JSON and returns it. Throws an error if anything
 * fails, which is intended to make it easy to find the faulty key.
 *
 * @params {object} obj - An object to read from
 * @params {string} key - The key to read
 * @returns {mixed} The value of obj[key] interpreted as JSON
 */
function _readKeyAsJson(obj, key) {
    if (typeof obj[key] === "undefined") {
        throw new Error("Attempted to read config key '" + key + "' but the value was undefined");
    }

    try {
        return JSON.parse(obj[key]);
    }
    catch (e) {
        throw new Error("Failed to parse value for config key '" + key + "'. It may not be valid JSON. (Original error: " + e.message) + ")";
    }
}

/**
 * Performs validation to ensure the npm environment has been set up properly.
 * If anything is wrong, throws an error.
 *
 * @params {object} config - The current config object to validate
 */
function _validateConfig(config) {
    for (var i = 0; i < REQUIRED_CONFIG_VARIABLES.length; i++) {
        var key = REQUIRED_CONFIG_VARIABLES[i];
        var value = config[key];
        if (!value || value === "UNSET") {
            throw new Error("No value has been set in config for key: " + key);
        }
    }
}

exports.create = create;
