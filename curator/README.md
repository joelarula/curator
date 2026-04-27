
# Curator VS Code Extension

Browse and edit your Padagaskar wiki as a virtual filesystem in VS Code.

## Features
- Browse wiki pages (WIKI_PAGE sources) as files and folders
- Secure authentication using OAuth and SecretStorage
- All API requests use the JWT stored in the OS keychain
- Modern, secure extension architecture


### Getting Started (Developer)

#### Prerequisites
- Node.js 18+ (for built-in fetch and modern APIs)
- Docker & Docker Compose
- VS Code 1.80+

#### 1. Start the Database (Postgres with pgvector)
From the project root, run:
```
docker compose up -d
```
This starts the Postgres database on port 5432.

#### 2. Set Up and Run the Server
Open a terminal in the server/ directory and run:
```
npm install
npm run prisma:migrate   # Run database migrations
npm run dev              # Start the GraphQL/Express server (default: http://localhost:4000)
```
Ensure your .env file in server/ is configured with the correct DATABASE_URL.

#### 3. (Optional) Start the Frontend
If you want to use the web UI for authentication or admin:
```
cd frontend
npm install
npm run dev
```
This starts the frontend on http://localhost:5173.

#### 4. Build & Run the Curator Extension
In VS Code, open the curator/ folder:
```
npm install
npm run compile
```
Press F5 to launch the Extension Development Host.

#### 5. Authenticate the Extension
- Run the command: `Curator: Sign In to Wiki` from the Command Palette.
- Complete the OAuth flow in your browser.
- The extension will store your token securely and you can now browse the wiki filesystem.

#### 6. Debugging
- Use VS Code breakpoints and the Debug Console in the Extension Development Host.
- Check server logs for API or authentication errors.
- If you change the server schema, re-run migrations and restart the server.

---

**Summary of required commands:**
```
docker compose up -d
cd server && npm install && npm run prisma:migrate && npm run dev
cd frontend && npm install && npm run dev   # (optional)
cd curator && npm install && npm run compile
# In VS Code: F5 to debug extension
```

---

For more details, see `.instructions.md` in this folder.
