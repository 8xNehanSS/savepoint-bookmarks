# Private Bookmarks

A personal bookmark manager built with Next.js, hosted on Vercel, with your bookmarks stored in Upstash Redis behind a username and password.

## Features
- Sign in with a single username and password (set as environment variables)
- Save links with a title, category and notes
- Full-text search across titles, URLs, notes and categories, with highlighted matches (press `/` to focus, `Esc` to clear)
- Category sidebar with counts; rename a category by hovering it and clicking ✎
- Bookmarklet: one click saves the current page, and any text you've selected becomes the note
- Works across devices: everything is stored server-side

## Deploy to Vercel
1. Push this folder to a Git repo and import it in Vercel.
2. In the project, open **Storage → Create Database → Upstash (Redis)** and connect it to the project. This sets `KV_REST_API_URL` and `KV_REST_API_TOKEN` for you.
3. In **Settings → Environment Variables**, add:
   - `APP_USERNAME`: your login name
   - `APP_PASSWORD`: a long password
   - `AUTH_SECRET`: a random string, e.g. the output of `openssl rand -base64 32`
4. Redeploy so the new variables take effect.

Changing `APP_PASSWORD` or `AUTH_SECRET` signs out every existing session.

Once it's deployed, sign in, click **Bookmarklet** in the sidebar, and drag **◆ Save bookmark** to your bookmarks bar. Drag it from the deployed site, not from localhost, because the bookmarklet saves to whichever site it came from. If you're signed out when you use it, the popup asks you to sign in and then continues.

## Develop locally
```bash
npm install
cp .env.example .env.local   # then fill in APP_USERNAME, APP_PASSWORD, AUTH_SECRET
npm run dev
```
If the Redis variables are empty, the dev server uses a temporary in-memory store, which is wiped when the server restarts. To use your real data locally, run `vercel env pull .env.local`.

## Security notes
- The session is an HMAC-signed, httpOnly cookie that lasts 30 days. Middleware checks it on every page and API route.
- After 10 failed sign-ins from one IP, that IP is locked out for 15 minutes.
- `javascript:`, `data:` and `vbscript:` URLs are rejected.
- Some sites (GitHub, for example) block bookmarklets through their security settings. On those, the bookmarklet won't do anything.
