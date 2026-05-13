module.exports = {
  testEnvironment: "node",
  testEnvironmentOptions: {
    NODE_ENV: "test",
  },
  restoreMocks: true,
  coveragePathIgnorePatterns: [
    "node_modules",
    "src/config",
    "src/app.js",
    "tests",
  ],
  coverageReporters: ["text", "lcov", "clover", "html"],
  moduleNameMapper: {
    "^node:crypto$": "<rootDir>/tests/utils/node-crypto-mock.js",
    "^node:stream$": "<rootDir>/tests/utils/node-stream-mock.js",
  },
};
