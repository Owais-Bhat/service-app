module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // Must stay last in the plugins list — this is what actually powers
    // react-native-reanimated's UI-thread animations (AnimatedStatCard,
    // GlowButton's pulse) by compiling worklets.
    plugins: ['react-native-reanimated/plugin'],
  };
};
