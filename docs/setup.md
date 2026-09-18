# Setup / Getting Started

```bash
# Clone the repo
git clone <your-repo-url>
cd devdiary2026

# Install dependencies
npm install

# Copy env template and fill in your credentials
cp .env.example .env

# Run database migrations (once DB is set up)
npm run migrate

# Start the dev server
npm run dev
```

## Environment Variables

```env
GITHUB_APP_ID=4993144
GITHUB_CLIENT_ID=your_client_id_here
GITHUB_CLIENT_SECRET=your_client_secret_here
GITHUB_PRIVATE_KEY_PATH=./keys/devdiary2026.private-key.pem

DATABASE_URL=postgres://user:password@localhost:5432/devdiary

EMAIL_API_KEY=your_email_provider_api_key
EMAIL_FROM=reminders@yourdomain.com

APP_BASE_URL=http://localhost:3000
```

> ⚠️ Never commit `.env` or the `.pem` private key file to version control. Add both to `.gitignore`.
