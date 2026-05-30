module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: [
      [
        "module-resolver",
        {
          alias: {
            "@ctrend/shared": "../packages/shared/src",
          },
        },
      ],
      "react-native-reanimated/plugin",
    ],
  };
};
