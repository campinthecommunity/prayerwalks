# Prayer Walk Dashboard

A public website for the Holston Conference camping ministry's prayer walk initiative: click the map to drop a pin marking a prayer walk, add a reflection and photos, generate a neighborhood-focused Prayer Guide PDF, and (as an admin) export the collected data or remove anything inappropriate.

This is a standalone site — no login required for anyone to contribute — backed by [Supabase](https://supabase.com) (database, file storage, and small serverless functions) and hosted for free on [GitHub Pages](https://pages.github.com).

**To deploy this for the first time, see [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md).**

## Project structure

```
index.html                          The entire website (single self-contained file)
supabase/
  migrations/0001_init.sql          Database tables + Row Level Security policies + Storage bucket
  config.toml                      Tells Supabase these functions don't need a login-user token
  functions/
    moderate/                       Edge Function: AI screening for lewd/hateful text & photos
    prayer-guide/                   Edge Function: AI-tailored content for the Prayer Guide PDF
    admin-action/                   Edge Function: the only path that can delete data (passphrase-gated)
    _shared/cors.ts                 Shared CORS headers used by all three functions
```

## How the pieces fit together

- **Anyone with the link** can read and add to the `locations`, `stories`, and `photos` tables, and upload to the `photos` storage bucket, using Supabase's public "publishable" key embedded in `index.html`. This is what makes "anyone can add a pin, everyone sees it" possible.
- **Nobody** can update or delete that data using the publishable key — Row Level Security denies it outright. The only way to delete anything is through the `admin-action` Edge Function, which independently re-checks the admin passphrase server-side (using its own elevated "secret" key) before performing a delete. So the real access control lives on the server, not just in the browser.
- **AI features** (moderation and the Prayer Guide PDF's local history) call the Anthropic API from inside `moderate` and `prayer-guide`, using an API key stored as a Supabase secret — never exposed to visitors' browsers. Both fail gracefully: if the AI service is ever unreachable, submissions are still allowed through (moderation fails open) and the PDF still generates with solid generic content (see `FALLBACK_AREAS`/`FALLBACK_PRAYERS` in `index.html`).

## Making changes later

`index.html` is a single file — open it, edit, save, commit, and push to GitHub; GitHub Pages redeploys automatically within a minute or two. The same goes for the Supabase functions and migrations: edit the file, then redeploy that piece (see DEPLOYMENT_GUIDE.md for the exact commands).
