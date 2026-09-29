# Production Deployment & Google OAuth Guide for https://keeris.arula.dev/

This guide explains how to deploy the Keeris MiniApp to **https://keeris.arula.dev/** and configure Google OAuth 2.0 authentication so that public visitors can search songs and view playlists, while only authenticated users have access to the **Curator Dev Console** and administrative agent workflows.

---

## 1. Google Cloud Console Configuration

To allow users to log in at `https://keeris.arula.dev/`, the domain and callback URL must be registered in your Google Cloud Project.

1. Go to the [Google Cloud Console Credentials Page](https://console.cloud.google.com/apis/credentials).
2. Click on your OAuth 2.0 Client ID:
   * **Client ID**: `YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com`
3. Under **Authorized JavaScript origins**, add:
   * `https://keeris.arula.dev`
   * *(Optional for local testing)*: `http://localhost:3001`, `http://localhost:4001`
4. Under **Authorized redirect URIs**, add:
   * `https://keeris.arula.dev/auth/google/callback`
   * *(Optional for local testing)*: `http://localhost:4001/auth/google/callback`
5. Click **Save**.

---

## 2. Production Environment Variables (`.env`)

In production on cPanel (e.g. at `/home/<cpanel_user>/keeris/.env`), configure the following environment settings:

```env
# ==============================================================================
# Keeris Production Configuration for https://keeris.arula.dev/
# ==============================================================================

NODE_ENV=production
PORT=4001

# ------------------------------------------------------------------------------
# 1. Database Configuration (MariaDB on localhost)
# ------------------------------------------------------------------------------
DATABASE_URL=mysql://sepisedc_curator:YOUR_DB_PASSWORD@localhost:3306/sepisedc_curator_keeris
CURATOR_DATABASE_NAME=keeris
CURATOR_DATABASE_URL=mysql://sepisedc_curator:YOUR_DB_PASSWORD@localhost:3306/sepisedc_curator_keeris

# ------------------------------------------------------------------------------
# 2. Background Scraper / Indexer Interval
# 3600000 ms = 1 hour interval
# ------------------------------------------------------------------------------
INDEX_INTERVAL_MS=3600000

# ------------------------------------------------------------------------------
# 3. Google OAuth 2.0 & JWT Authentication
# ------------------------------------------------------------------------------
JWT_SECRET=your-super-secret-jwt-key
GOOGLE_CLIENT_ID=YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=YOUR_GOOGLE_CLIENT_SECRET
GOOGLE_API_KEY=YOUR_GOOGLE_API_KEY
GOOGLE_CALLBACK_URL=https://keeris.arula.dev/auth/google/callback
FRONTEND_URL=https://keeris.arula.dev
```

> [!IMPORTANT]
> Because Express serves both the static Vue assets (`web-dist`) and the backend API endpoints from the same origin on `https://keeris.arula.dev`, `FRONTEND_URL` and `GOOGLE_CALLBACK_URL` must point directly to `https://keeris.arula.dev`.

---

## 3. Build & Package

Run the cPanel packager from your local workspace:

```powershell
cd z:\curator\miniapps\keeris
npm run package:cpanel
```

This command runs:
1. `npm run build:cpanel` (compiles Vite web frontend into `web-dist` and bundles backend into `app.js`).
2. Bundles `passport`, `passport-google-oauth20`, and `jsonwebtoken` directly into `app.js`.
3. Creates a deployment archive: `z:\curator\miniapps\keeris\keeris-cpanel.zip`.

---

## 4. cPanel Deployment Steps

1. **Upload Files**:
   * Open cPanel **File Manager**.
   * Navigate to your application root directory (e.g. `/home/<cpanel_user>/keeris`).
   * Upload `keeris-cpanel.zip` and extract its contents.
2. **Create / Verify `.env`**:
   * In File Manager, ensure `.env` exists in the application root with the production values listed in **Section 2** above.
3. **Configure Node.js App in cPanel**:
   * Go to cPanel > **Setup Node.js App**.
   * Select your application (`keeris.arula.dev`).
   * Verify settings:
     * **Node.js Version**: `20.x` or `22.x`
     * **Application mode**: `Production`
     * **Application root**: `keeris`
     * **Application startup file**: `app.js`
   * Click **Run NPM Install** if dependencies are not yet installed.
   * Click **Restart**.

---

## 5. Verification on https://keeris.arula.dev/

1. **Public Browsing (No Login Required)**:
   * Visit `https://keeris.arula.dev/` in an incognito window.
   * Verify that songs, airings, episode details, and playlists load quickly.
   * Confirm that the **Curator Dev Console** button is **hidden** and `Ctrl + \`` does not open the console.
2. **Google Sign In**:
   * Click **"Logi sisse Google'iga"** (or **"Sign In"**) in the header.
   * Authenticate with your Google account.
   * Verify redirect back to `https://keeris.arula.dev/?token=...`. The URL query is cleanly cleared, and your user profile name appears in the top navigation bar.
3. **Curator Dev Console Access**:
   * Confirm the **Kuraatori konsool** (`Dev Console`) pill is now visible.
   * Open the console to trigger agent workflows or inspect database health.
   * Click **Logi välja** (Logout) to verify that the console immediately closes and the app returns to public-only mode.
