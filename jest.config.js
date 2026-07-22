module.exports = {
  testEnvironment: "node",
  testEnvironmentOptions: {
    NODE_ENV: "test",
  },
  setupFiles: ["<rootDir>/tests/setup.js"],
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
    "^node:stream/web$": "<rootDir>/tests/utils/node-stream-web-mock.js",
    "^node:stream$": "<rootDir>/tests/utils/node-stream-mock.js",
    "^node:fs$": "<rootDir>/tests/utils/node-fs-mock.js",
    "^node:fs/promises$": "<rootDir>/tests/utils/node-fs-promises-mock.js",
    "^node:path$": "<rootDir>/tests/utils/node-path-mock.js",
    "^node:os$": "<rootDir>/tests/utils/node-os-mock.js",
    "^node:http$": "<rootDir>/tests/utils/node-http-mock.js",
    "^node:https$": "<rootDir>/tests/utils/node-https-mock.js",
    "^node:util$": "<rootDir>/tests/utils/node-util-mock.js",
    "^node:buffer$": "<rootDir>/tests/utils/node-buffer-mock.js",
  },
};
