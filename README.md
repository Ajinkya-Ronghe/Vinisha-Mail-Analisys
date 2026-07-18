# MailDesk Gmail Setup

This is a React + Vite Gmail mailbox app. It requires Google sign-in before loading Gmail messages and uses local Ollama AI to flag suspicious incoming mail.

## Run locally

```powershell
npm.cmd install
npm.cmd run dev
```

Open:

```text
http://localhost:8000
```

## Google setup

1. Create a Google Cloud project.
2. Enable the Gmail API.
3. Configure the OAuth consent screen.
4. Add your Gmail account as a test user while the app is in testing mode.
5. Create an OAuth Client ID for a web application.
6. Add this authorized JavaScript origin:

```text
http://localhost:8000
```

The OAuth client ID is configured in `src/main.jsx`:

```js
const GOOGLE_CLIENT_ID = "YOUR_CLIENT_ID.apps.googleusercontent.com";
```

The app requests Gmail permissions for reading, modifying, composing drafts, and sending mail.

## Ollama suspicious mail scan

The app uses this local Ollama model:

```text
llama3.2:latest
```

When Inbox messages load, the app asks Ollama to classify each incoming message. If a message looks suspicious, the UI adds an `AI Suspicious` chip and the app tries to create/apply a Gmail label named `AI Suspicious`.

Because Gmail label creation needs label access, make sure your OAuth consent screen includes:

```text
https://www.googleapis.com/auth/gmail.labels
```

After adding that scope, remove the app from your Google account permissions and sign in again so Google asks for the new permission.

## Node.js setup (Windows)

Recommended Node.js version: 18.x (project pinned in `.nvmrc`).

- To install automatically (requires `winget` and elevated PowerShell):

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-node-windows.ps1
```

- To install via `winget` directly:

```powershell
winget install --id OpenJS.NodeJS.LTS -e
```

- Or install `nvm-windows` and use it:

```powershell
# Install nvm-windows (see https://github.com/coreybutler/nvm-windows)
nvm install 18
nvm use 18
```

Verify installation:

```powershell
node -v
npm -v
```

The project `package.json` includes an `engines.node` field recommending Node >=18.
