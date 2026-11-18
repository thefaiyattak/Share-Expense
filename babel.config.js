module.exports = function (api) {
  api.cache(true);
  const plugins = [];
  if (process.env.NODE_ENV === 'production') {
    plugins.push(['transform-remove-console', { exclude: ['error', 'warn'] }]);
  }
  let expoPreset;
  try {
    expoPreset = require.resolve('babel-preset-expo');
  } catch {
    expoPreset = require.resolve('babel-preset-expo', { paths: [require.resolve('expo')] });
  }
  return {
    presets: [expoPreset],
    plugins,
  };
};
