"use strict";

var fs = require("fs");
var path = require("path");

var Log = require("./log");
var Utils = require("./utils");

var LOG = new Log("config");

var REQUIRED_CONFIG_VARIABLES = [
    "botEmail",
    "botPassword",
    "roomName"
];

/**
 * Initializes the application's configuration by reading from
 * a config file defined in NPM configuration.
 *
 * @param {string} basedir - The base directory of the bot, containing a "config" subdirectory
 * @param {object} defaults - An optional object containing default configuration.
 * @returns {object} An object representing configuration
 */
function create(basedir, defaults) {
    LOG.info("Initializing application configuration");
    var config = defaults || {};

    _loadConfigurationFiles(basedir, config);
    _validateConfig(config);

    if (config.PlugBotBase.isConfigImmutable) {
        _freezeConfig(config);
        LOG.info("Configuration set up successfully. The config object is now frozen and no changes can be made to it.");
    }
    else {
        LOG.info("Configuration set up successfully. Config has not been frozen due to override of the PlugBotBase.isConfigImmutable property.");
    }

    return config;
}

/**
 * Loads configuration out of the config/ subdirectory. All .json files found
 * under config/ or any of its subdirectories will be loaded into configuration.
 *
 * @param {string} baseDir - The directory to find config/ under
 * @param {object} config - The current config object
 */
function _loadConfigurationFiles(basedir, config) {
    var configDirPath = path.resolve(basedir, "config");

    var files;
    try {
        files = Utils.getAllFilePathsUnderDirectory(configDirPath);
        LOG.info("Found the following potential config files: {}", files);
    }
    catch (e) {
        throw e;
        throw new Error("Unable to load configuration from the base directory '" + configDirPath + "'",  e);
    }

    for (var i = 0; i < files.length; i++) {
        var filePath = files[i];

        if (filePath.lastIndexOf(".json") !== filePath.length - 5) {
            LOG.info("File {} doesn't appear to be a JSON file (therefore not configuration). Ignoring.", filePath);
            continue;
        }

        _copyConfigFromFile(filePath, config);
    }
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
 * Performs validation to ensure the npm environment has been set up properly.
 * If anything is wrong, throws an error.
 *
 * @params {object} config - The current config object to validate
 */
function _validateConfig(config) {
    for (var i = 0; i < REQUIRED_CONFIG_VARIABLES.length; i++) {
        var key = REQUIRED_CONFIG_VARIABLES[i];
        var value = config.PlugBotBase[key];
        if (!value || value === "UNSET") {
            throw new Error("No value has been set in config for key: PlugBotBase." + key);
        }
    }
}

exports.create = create;
