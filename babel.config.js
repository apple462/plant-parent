module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // inline-import bundles Drizzle's generated .sql migration files into the
    // app binary so migrations can run on-device (see db/ setup in a later task).
    plugins: [['inline-import', { extensions: ['.sql'] }]],
  };
};
