import { defineConfig } from "@vscode/test-cli";

// Integration tests run inside a downloaded VS Code with the extension
// loaded, against a stub DevDiary server (see test/integration).
export default defineConfig({
  files: "test/integration/**/*.test.js",
  workspaceFolder: "./test/fixtures",
  mocha: { ui: "tdd", timeout: 20000 },
  launchArgs: ["--disable-extensions"],
});
