const vscode = require("vscode");
const { GitHubReauthError } = require("../api");
const { localDate, addDays, isValidDate, tzOffset, formatDay } = require("../dates");
const { diaryUri, dateFromUri } = require("../diaryFileSystem");

async function openDiary(date) {
  const document = await vscode.workspace.openTextDocument(diaryUri(date));
  return vscode.window.showTextDocument(document, { preview: false });
}

// Accepts YYYY-MM-DD, "today" or "yesterday".
function parseDateInput(value) {
  const text = value.trim().toLowerCase();
  if (text === "today") return localDate();
  if (text === "yesterday") return addDays(localDate(), -1);
  return isValidDate(text) ? text : null;
}

function register(context, { api, store }) {
  const run = (id, fn) => context.subscriptions.push(vscode.commands.registerCommand(id, fn));

  run("devdiary.openToday", () => openDiary(localDate()));

  // From the Diary view the date is passed in; from the palette, ask.
  run("devdiary.openDate", async (date) => {
    if (typeof date !== "string") {
      const input = await vscode.window.showInputBox({
        title: "Open diary entry",
        prompt: "Date as YYYY-MM-DD, or \"today\" / \"yesterday\"",
        value: addDays(localDate(), -1),
        validateInput: (value) => (parseDateInput(value) ? null : "Enter a date like 2026-09-23"),
      });
      if (!input) return;
      date = parseDateInput(input);
    }
    return openDiary(date);
  });

  // Fills the entry with a markdown draft of that day's GitHub activity.
  // Works on the diary entry in the active editor, or today's.
  run("devdiary.draftFromGitHub", async (uri) => {
    const date =
      dateFromUri(uri instanceof vscode.Uri ? uri : undefined) ||
      dateFromUri(vscode.window.activeTextEditor && vscode.window.activeTextEditor.document.uri) ||
      localDate();

    let activity;
    try {
      activity = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: `Drafting ${formatDay(date)} from GitHub…` },
        () => api.activity(date, tzOffset(date))
      );
    } catch (err) {
      if (err instanceof GitHubReauthError) {
        const choice = await vscode.window.showWarningMessage(
          "DevDiary's GitHub access has expired. Sign in again to draft from your activity.",
          "Sign In"
        );
        if (choice === "Sign In") vscode.commands.executeCommand("devdiary.signIn", { reauth: true });
      } else if (err.status !== 401) {
        vscode.window.showErrorMessage(`Couldn't draft from GitHub: ${err.message}`);
      }
      return;
    }

    const editor = await openDiary(date);
    const document = editor.document;
    const existing = document.getText();
    let mode = "replace";
    if (existing.trim()) {
      mode = vscode.workspace.getConfiguration("devdiary").get("diary.draftMode", "ask");
      if (mode === "ask") {
        const choice = await vscode.window.showInformationMessage(
          `Your entry for ${formatDay(date)} already has text.`,
          { modal: true, detail: "Add the GitHub draft after it, or replace it?" },
          "Append",
          "Replace"
        );
        if (!choice) return;
        mode = choice.toLowerCase();
      }
    }

    const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(existing.length));
    await editor.edit((edit) => {
      edit.setEndOfLine(vscode.EndOfLine.LF);
      if (mode === "append") {
        edit.insert(fullRange.end, `${existing.endsWith("\n") ? "" : "\n"}\n${activity.markdown}`);
      } else {
        edit.replace(fullRange, activity.markdown);
      }
    });
    const end = document.positionAt(document.getText().length);
    editor.selection = new vscode.Selection(end, end);
    editor.revealRange(new vscode.Range(end, end));
    vscode.window.setStatusBarMessage("$(sparkle) Draft added. Review it and save to keep it.", 5000);
    store.refreshActivity();
  });
}

module.exports = { register, openDiary, parseDateInput };
