# Google OAuth Setup Guide

## 1. Create Google OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Navigate to **APIs & Services** > **Credentials**
4. Click **Create Credentials** > **OAuth client ID**
5. If prompted, configure the OAuth consent screen:
   - User Type: External (for testing) or Internal (for organization use)
   - App name: Curator
   - User support email: your email
   - Developer contact: your email
6. For Application type, select **Web application**
7. Add authorized redirect URIs:
   - `http://localhost:3000/api/auth/callback/google`
   - For production: `https://yourdomain.com/api/auth/callback/google`
8. Click **Create**
9. Copy the **Client ID** and **Client Secret**

## 2. Configure Environment Variables

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Update the following variables in `.env`:
   ```bash
   GOOGLE_CLIENT_ID=your_actual_client_id
   GOOGLE_CLIENT_SECRET=your_actual_client_secret
   NEXTAUTH_SECRET=your_generated_secret
   NEXTAUTH_URL=http://localhost:3000
   ```

3. Generate a secure `NEXTAUTH_SECRET`:
   ```bash
   openssl rand -base64 32
   ```

## 3. Start the Application

```bash
npm run dev
```

## 4. Test Authentication

1. Open http://localhost:3000
2. Click "Sign In with Google"
3. Complete the Google OAuth flow
4. You should be redirected back to the app, signed in
5. Your name and avatar should appear in the app bar
6. You can now use the consultant feature

## Troubleshooting

### "Redirect URI mismatch" error
- Ensure `http://localhost:3000/api/auth/callback/google` is added to authorized redirect URIs in Google Cloud Console
- Check that `NEXTAUTH_URL` in `.env` matches your development URL

### "Invalid client" error
- Verify `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are correct
- Ensure there are no extra spaces or quotes in `.env` file

### Session not persisting
- Make sure `NEXTAUTH_SECRET` is set and is at least 32 characters
- Clear browser cookies and try again
