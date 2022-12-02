const { defaults: tsjPreset } = require("ts-jest/presets");

module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testRegex: "./src/.*.test.ts",
  transform: {
    ...tsjPreset.transform,
  },
  collectCoverageFrom: ["./src/**/*.ts"],
  collectCoverage: true,
};
