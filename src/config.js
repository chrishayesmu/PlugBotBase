"use strict";

var fs = require("fs");
var path = require("path");

var Log = require("./log");

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
 * @param {string} configFilePath - The path to a JSON file containing configuration
 * @param {object} defaults - An optional object containing default configuration.
 * @returns {object} An object representing configuration
 */
function create(basedir, defaults) {
    LOG.info("Initializing application configuration");
    var config = defaults || {};

    _loadBaseConfigFile(basedir, config);
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
 * Copies configuration from the main configuration file. The path to that
 * file must be specified in the NPM config variable "config_file". It will be
 * treated as a relative or absolute path based on the path itself.
 *
 * @param {string} baseDir - The directory to consider as the base path for any relative files
 * @param {object} config - The current config object
 */
function _loadBaseConfigFile(basedir, config) {
    var configFilePath = process.env.npm_package_config_pbb_config_file || "config/config.json";

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
