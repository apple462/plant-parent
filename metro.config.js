const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Allow importing Drizzle's generated .sql migration files through Metro.
config.resolver.sourceExts.push('sql');

module.exports = config;
