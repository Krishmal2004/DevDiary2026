require("dotenv").config();
const { createApp } = require("./app");
const { startReminderScheduler } = require("./services/reminders");
const { getProvider } = require("./services/email");

const port = process.env.PORT || 4000;
const app = createApp();

app.listen(port, () => {
  console.log(`DevDiary2026 backend listening on http://localhost:${port}`);
  if (getProvider() === "console") {
    console.log("EMAIL_API_KEY not set — reminder emails will be printed to this console.");
  }
  if (process.env.DISABLE_SCHEDULER !== "true") {
    startReminderScheduler();
  }
});
