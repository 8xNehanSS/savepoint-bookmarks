# Private Bookmarks

A local-only bookmark manager built with Next.js. There is no backend: bookmarks are stored in your browser's `localStorage` and never leave your device.

## Features
- Save links with a title, category and notes
- Full-text search across titles, URLs, notes and categories, with highlighted matches (press `/` to focus, `Esc` to clear)
- Category sidebar with counts; rename a category by hovering it and clicking ✎
- Bookmarklet: one click saves the current page, and any text you've selected becomes the note
- Export and import as JSON, for backups and moving between browsers

## Develop
```bash
npm install
npm run dev
```

## Deploy to Vercel
Push to a Git repo and import it in Vercel, or run `npx vercel`. No settings or environment variables are needed. The app is a static export (`output: "export"`), so any static host works too.

After you deploy, open the site, click **Bookmarklet & backup**, and drag **◆ Save bookmark** to your bookmarks bar. The bookmarklet points at whichever origin you dragged it from, so drag it from the deployed site, not from localhost.

## Notes
- Data belongs to one browser profile on one domain. Clearing site data deletes it, so export now and then.
- Some sites block popups or use a strict CSP that blocks bookmarklets. In those cases the bookmarklet opens the save page in the same tab instead, or does nothing at all.
