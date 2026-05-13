# 🌐 Browser Setup Guide: Local Chrome (CDP)

This guide explains how to connect Curator to your local Chrome instance. This is the **most powerful** fetching strategy because it allows the AI to use your existing browser sessions, cookies, and authenticated states to bypass sophisticated anti-bot protections (like Cloudflare, CAPTCHAs, or paywalls).

---

## 1. Launch Chrome with Debugging Enabled

Curator communicates with Chrome via the **Chrome DevTools Protocol (CDP)**. For this to work, you must launch Chrome with the remote debugging flag.

### 🪟 Windows
1. Close all existing Chrome instances (or use a separate profile).
2. Open PowerShell or Command Prompt.
3. Run the following command:
   ```powershell
   & "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="C:\temp\chrome-curator-profile"
   ```
   *Note: Using a specific `--user-data-dir` ensures that your research session doesn't interfere with your personal browsing, while still allowing you to log in to sites for the AI to access.*

### 🍎 macOS
```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222 --user-data-dir="/tmp/chrome-curator-profile"
```

---

## 2. Configure Curator

Ensure your `.env` file in the `server` directory includes the correct port:

```env
CHROME_REMOTE_DEBUG_PORT=9222
```

---

## 3. Usage in Scripts

In your Curator scripts, you can now use the `BROWSER_ACTION` tool. By default, if the port is configured, the system will attempt to connect to your local browser.

### Example: Visiting a Protected Site
```typescript
const page = pipeline.tool(TOOLS.BROWSER_ACTION, {
    commands: [
        { type: 'navigate', url: 'https://news.ycombinator.com' },
        { type: 'wait', timeout: 2000 },
        { type: 'content' } // Returns the rendered HTML
    ]
});
```

---

## 4. Why use a Local Browser?

| Strategy | Speed | Anti-Bot Bypass | Auth Support |
| :--- | :--- | :--- | :--- |
| **Cheerio (`fetch_html`)** | ⚡ Fast | ❌ Poor | ❌ None |
| **Isolated Playwright** | 🐢 Slow | ⚠️ Medium | ⚠️ Basic |
| **Local Chrome (CDP)** | 🐢 Slow | ✅ **Excellent** | ✅ **Full (Your Sessions)** |

### Use Local Chrome when:
*   You need to scrape a site that requires a login (and you are already logged in).
*   The site uses aggressive bot detection (Cloudflare "Waiting Room").
*   You want to see what the AI is doing in real-time (the browser window stays visible on your desktop).

---

## 5. Troubleshooting

*   **"Could not connect to Chrome"**: Ensure Chrome is actually running and you can see it on your screen.
*   **Port Conflict**: If 9222 is in use, change it in both the Chrome launch command and the `.env` file.
*   **Headless Mode**: Do **not** use `--headless` if you want to interact with the page or solve CAPTCHAs manually for the AI.

---

> [!TIP]
> Keep the debugging browser window visible on a second monitor. You can watch the AI navigate and even intervene (e.g., clicking a button) if the script gets stuck.
