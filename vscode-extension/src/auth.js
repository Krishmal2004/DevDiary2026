const crypto = require("node:crypto");
const os = require("node:os");
const vscode = require("vscode");

// Browser sign-in with PKCE (see docs/vscode-extension.md#authentication):
// open /auth/vscode/start in the browser, receive a one-time code through
// this extension's URI handler (or have the user paste it), and exchange it
// with the verifier for a DevDiary API token. The token lives in
// SecretStorage, one per server URL.

const EDITOR_SCHEMES = new Set(["vscode", "vscode-insiders", "vscodium"]);
const SIGN_IN_TIMEOUT_MS = 10 * 60 * 1000;

class SignInCancelled extends Error {
  constructor() {
    super("Sign-in cancelled");
    this.name = "SignInCancelled";
  }
}

function base64url(bytes) {
  return Buffer.from(bytes).toString("base64url");
}

function pkcePair() {
  const verifier = base64url(crypto.randomBytes(32));
  const challenge = base64url(crypto.createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

class Auth {
  constructor(context, api, getServerUrl) {
    this.context = context;
    this.api = api;
    this.getServerUrl = getServerUrl;
    this.pending = null;
    this.signedIn = false;
    this.sessionEndedShown = false;
    this._onDidChange = new vscode.EventEmitter();
    this.onDidChange = this._onDidChange.event;
  }

  secretKey() {
    return `devdiary.token:${this.getServerUrl()}`;
  }

  userKey() {
    return `devdiary.user:${this.getServerUrl()}`;
  }

  getToken() {
    return this.context.secrets.get(this.secretKey());
  }

  get user() {
    return this.context.globalState.get(this.userKey());
  }

  // Re-reads the stored token, e.g. at start-up or after the server URL
  // changes. Fires onDidChange when the signed-in state flips.
  async load() {
    const signedIn = !!(await this.getToken());
    if (signedIn !== this.signedIn) {
      this.signedIn = signedIn;
      this._onDidChange.fire(signedIn);
    }
    return signedIn;
  }

  async signIn({ reauth = false } = {}) {
    if (this.pending) this.pending.reject(new SignInCancelled());

    const { verifier, challenge } = pkcePair();
    const state = base64url(crypto.randomBytes(24));
    const callback = await vscode.env.asExternalUri(
      vscode.Uri.parse(`${vscode.env.uriScheme}://${this.context.extension.id}/auth`)
    );
    // Browser-based editors can't receive a vscode:// callback; the user
    // pastes the code shown in the browser instead.
    const useCallback = EDITOR_SCHEMES.has(callback.scheme);

    const params = new URLSearchParams({
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
      client_name: `${vscode.env.appName} on ${os.hostname()}`,
    });
    if (useCallback) params.set("redirect_uri", callback.toString(true));
    if (reauth) params.set("reauth", "1");

    const codePromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Sign-in timed out. Run DevDiary: Sign In to try again.")), SIGN_IN_TIMEOUT_MS);
      const done = (fn) => (value) => {
        clearTimeout(timer);
        if (this.pending && this.pending.state === state) this.pending = null;
        fn(value);
      };
      this.pending = { state, resolve: done(resolve), reject: done(reject) };
    });

    const startUrl = `${this.api.baseUrl()}/auth/vscode/start?${params}`;
    const opened = await vscode.env.openExternal(vscode.Uri.parse(startUrl));
    if (!opened) {
      this.pending.reject(new SignInCancelled());
    } else if (useCallback) {
      vscode.window
        .showInformationMessage("Finish signing in to DevDiary in your browser.", "Paste Code", "Cancel")
        .then((choice) => {
          if (choice === "Paste Code") this.pasteCode();
          else if (choice === "Cancel" && this.pending && this.pending.state === state) {
            this.pending.reject(new SignInCancelled());
          }
        });
    } else {
      this.pasteCode();
    }

    try {
      const code = await codePromise;
      const { token, user } = await this.api.exchangeCode(code, verifier);
      await this.context.secrets.store(this.secretKey(), token);
      await this.context.globalState.update(this.userKey(), user);
      this.sessionEndedShown = false;
      this.signedIn = true;
      this._onDidChange.fire(true);
      vscode.window.showInformationMessage(`Signed in to DevDiary as @${user.username}.`);
      return true;
    } catch (err) {
      if (!(err instanceof SignInCancelled)) {
        vscode.window.showErrorMessage(`DevDiary sign-in failed: ${err.message}`);
      }
      return false;
    }
  }

  // Finishes a sign-in in progress with a code copied from the browser.
  async pasteCode() {
    if (!this.pending) {
      vscode.window.showInformationMessage("No DevDiary sign-in is in progress. Run DevDiary: Sign In first.");
      return;
    }
    const pending = this.pending;
    const code = await vscode.window.showInputBox({
      title: "DevDiary sign-in",
      prompt: "Paste the one-time code shown in your browser",
      ignoreFocusOut: true,
      validateInput: (value) => (/^[A-Za-z0-9_-]{20,}$/.test(value.trim()) ? null : "That doesn't look like a sign-in code"),
    });
    if (this.pending !== pending) return;
    if (code) pending.resolve(code.trim());
    else pending.reject(new SignInCancelled());
  }

  // vscode.UriHandler — receives vscode://<publisher>.devdiary2026/auth?code&state
  handleUri(uri) {
    if (uri.path !== "/auth") return;
    const query = new URLSearchParams(uri.query);
    const pending = this.pending;
    if (!pending) {
      vscode.window.showWarningMessage("DevDiary received a sign-in response, but no sign-in was in progress.");
      return;
    }
    if (query.get("state") !== pending.state) {
      pending.reject(new Error("the browser's response didn't match this sign-in. Please try again."));
      return;
    }
    const error = query.get("error");
    if (error) {
      pending.reject(error === "access_denied" ? new SignInCancelled() : new Error(error));
      return;
    }
    const code = query.get("code");
    if (code) pending.resolve(code);
    else pending.reject(new Error("the browser didn't send a sign-in code."));
  }

  async signOut() {
    if (await this.getToken()) {
      // Revoke on the server too; sign out locally even if that fails.
      await this.api.revokeCurrentToken().catch(() => {});
    }
    await this.clear();
  }

  // The server rejected the token (revoked from the dashboard, or the
  // GitHub App was uninstalled).
  async sessionEnded() {
    if (!(await this.getToken())) return;
    await this.clear();
    if (this.sessionEndedShown) return;
    this.sessionEndedShown = true;
    const choice = await vscode.window.showWarningMessage(
      "Your DevDiary session has ended. Sign in again to keep using DevDiary.",
      "Sign In"
    );
    if (choice === "Sign In") vscode.commands.executeCommand("devdiary.signIn");
  }

  async clear() {
    await this.context.secrets.delete(this.secretKey());
    await this.context.globalState.update(this.userKey(), undefined);
    if (this.signedIn) {
      this.signedIn = false;
      this._onDidChange.fire(false);
    }
  }

  dispose() {
    if (this.pending) this.pending.reject(new SignInCancelled());
    this._onDidChange.dispose();
  }
}

module.exports = { Auth, pkcePair };
