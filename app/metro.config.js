const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Node.js polyfills for react-native-ytdl-ts
config.resolver.extraNodeModules = {
  vm: require.resolve('vm-browserify'),
  http: require.resolve('stream-http'),
  https: require.resolve('https-browserify'),
  url: require.resolve('url'),
  stream: require.resolve('readable-stream'),
  crypto: require.resolve('react-native-crypto'),
  buffer: require.resolve('buffer'),
  util: require.resolve('util'),
};

module.exports = config;






