// The user fields that are safe to send to clients (never tokens).
function publicUser(user) {
  return {
    id: user.id,
    github_id: user.github_id,
    username: user.username,
    avatar_url: user.avatar_url,
    email: user.email,
    reminders_enabled: !!user.reminders_enabled,
    timezone: user.timezone,
    created_at: user.created_at,
  };
}

module.exports = { publicUser };
