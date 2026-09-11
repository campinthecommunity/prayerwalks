# Deploying the Prayer Walk Dashboard

This turns the dashboard into a real public website: anyone with the link can drop a pin, add a photo, or generate a prayer guide, with no login required. Nothing here needs you to write code — it's all copy/paste and clicking through two free services' dashboards.

You'll set up three things:

1. **Supabase** — the shared database and photo storage (you said you already have an account and connected it to GitHub — good, that covers part of this).
2. **An Anthropic API key** — powers the two AI features (auto-generated local history for the Prayer Guide PDF, and the lewd/hate-speech screening). Separate from your Claude.ai login, small pay-as-you-go cost (a few cents per PDF or flagged check).
3. **GitHub Pages** — hosts the actual website, free, directly from your GitHub repo.

Do these roughly in order; each phase says what to do and how to know it worked.

---

## Phase 1 — Set up the database (Supabase)

1. Open your Supabase project (supabase.com/dashboard).
2. In the left sidebar, go to **SQL Editor**.
3. Open the file `supabase/migrations/0001_init.sql` from this project, copy its entire contents, paste into a new SQL Editor query, and click **Run**.
4. **Check it worked:** go to **Table Editor** in the sidebar — you should see three new tables: `locations`, `stories`, `photos`. Go to **Storage** in the sidebar — you should see a `photos` bucket.

That's your whole database and photo storage set up, with the right public-read/public-add, admin-only-delete permissions already built in.

---

## Phase 2 — Get an Anthropic API key

1. Go to **console.anthropic.com** and sign in or create an account (this is separate from your Claude.ai subscription).
2. Add a small amount of billing credit (Settings → Billing) — a few dollars will last a very long time for this use case.
3. Go to **API Keys**, create a new key, and copy it (it starts with `sk-ant-`). You won't be able to see it again after you leave the page, so paste it somewhere safe for the next step.

---

## Phase 3 — Configure secrets (Supabase)

These are server-side secrets — they never appear in the website's code, so they stay safe even though the site itself is public.

**Easiest way (Dashboard):** In your Supabase project, go to **Edge Functions → Manage secrets** (or **Project Settings → Edge Functions**) and add:

| Name | Value |
|---|---|
| `ANTHROPIC_API_KEY` | the `sk-ant-...` key from Phase 2 |
| `ADMIN_PASSPHRASE` | `CDholston26` (must exactly match the passphrase in `index.html` — see Phase 5) |
| `SUPABASE_SECRET_KEY` | your project's **secret** key (`sb_secret_...`) — see note below |

**Or via the CLI**, if you have it installed and your project linked (`supabase link`):

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-your-key-here
supabase secrets set ADMIN_PASSPHRASE=CDholston26
supabase secrets set SUPABASE_SECRET_KEY=sb_secret_your-key-here
```

**About the secret key:** newer Supabase projects use `sb_publishable_...` (safe, public — goes in `index.html`) and `sb_secret_...` (powerful, must stay server-only — never put this in `index.html`, never commit it, never paste it anywhere public) instead of the older `anon`/`service_role` naming. The `admin-action` function — the only thing that can delete data — needs the secret key to do its job, so it must be set as a secret here. Some Supabase projects auto-inject this for every function under the name `SUPABASE_SERVICE_ROLE_KEY`; `admin-action` checks for either name, so either works, but setting `SUPABASE_SECRET_KEY` explicitly (as above) is the safest bet if you're not sure which your project provides automatically.

---

## Phase 4 — Deploy the Edge Functions

There are three small server-side functions in `supabase/functions/`: `moderate`, `prayer-guide`, and `admin-action`. A `supabase/config.toml` file in this project already tells Supabase not to require a logged-in-user token for these three (this site has no login — every visitor uses the public key), so you don't need any extra flags when deploying.

**With the Supabase CLI** (recommended — install with `npm install -g supabase`, then `supabase login` and `supabase link --project-ref YOUR-PROJECT-REF`, the ref is in your project's Settings → General):

```bash
supabase functions deploy moderate
supabase functions deploy prayer-guide
supabase functions deploy admin-action
```

**Without the CLI:** in the Supabase Dashboard, go to **Edge Functions → Create a new function**, name it `moderate`, and paste in the contents of `supabase/functions/moderate/index.ts` — but note this function imports a small shared helper from `../_shared/cors.ts`, which the dashboard's single-file editor can't reference. If you go this route, the simplest fix is to paste the contents of `_shared/cors.ts` directly at the top of each function's `index.ts` in place of the `import { ... } from "../_shared/cors.ts"` line. Repeat for `prayer-guide` and `admin-action`. **The CLI path (above) doesn't require this workaround** and is worth the one-time install.

**Check it worked:** each function should show as deployed in **Edge Functions** in the dashboard, with a status of "Active".

---

## Phase 5 — Connect the website to your Supabase project

**Already done** — `index.html` is already filled in with your project's URL and **publishable** key (`sb_publishable_...`). This key is *meant* to be public and visible in client-side code — that's normal for Supabase. It only grants what the database's Row Level Security policies allow (public read/add, no delete), so this is safe.

If you ever need to change it (e.g. connecting a different Supabase project), open `index.html`, find these lines near the top of the `<script>` section, and update them — from Supabase, go to **Project Settings → API keys**, and copy the **Project URL** and the **publishable** key (never the **secret** key — that one must never appear in `index.html` or anywhere in the GitHub repo):

```js
const SUPABASE_URL = 'https://your-project-ref.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_...';
```

---

## Phase 6 — Push to GitHub and turn on GitHub Pages

1. If this project isn't already in your connected GitHub repo, push it there (`git add .`, `git commit -m "Prayer walk dashboard"`, `git push`).
2. In that repo on GitHub, go to **Settings → Pages** (left sidebar, under "Code and automation").
3. Under **Build and deployment → Source**, choose **Deploy from a branch**.
4. Under **Branch**, choose your main branch (usually `main`) and folder **/ (root)** — `index.html` lives at the top of this project, so root is correct. Click **Save**.
5. GitHub takes a minute or two to publish, then shows the live URL at the top of the same Pages settings screen — something like `https://your-username.github.io/your-repo-name/`.

**This URL is what you share** — anyone who opens it can drop a pin, add a photo, or generate a prayer guide, with no account needed.

**One thing to check:** free GitHub Pages publishes the repo's contents at that URL, so if the repo is **private**, make sure it's on a GitHub plan that supports Pages for private repos (GitHub Free supports this for personal accounts; organization accounts may need GitHub Team or Enterprise) — otherwise, either make the repo public or upgrade. The site's own data (prayer walks, photos) isn't affected either way; this is only about whether the repo's code and static files are reachable at the Pages URL.

---

## Phase 7 — Test it end to end

Before sharing widely, check each of these on the live GitHub Pages URL:

- [ ] Click the map, fill out the form, click **Confirm** — a pin appears and the stats update.
- [ ] Open a second browser (or an incognito window) and reload — the pin you just added shows up there too (confirms the shared database is working).
- [ ] Upload a photo — it appears in the "Photos From the Field" slideshow.
- [ ] Try submitting something clearly inappropriate in a reflection — it should be rejected with a message about inappropriate content (confirms the AI moderation is wired up). If it goes through instead, double check the `ANTHROPIC_API_KEY` secret (Phase 3) and that all three functions show "Active" (Phase 4).
- [ ] Generate a Prayer Guide PDF for a real neighborhood — the ten places should read as genuinely tailored to that place, not the generic fallback list (which starts with "The oldest church in the neighborhood"). If you get the generic version, check the same things as above.
- [ ] Click **Unlock** in Export Data, enter `CDholston26` — the admin tools should appear, and Export/Remove buttons should work.

---

## Notes for later

- **Changing the admin passphrase:** update it in TWO places — the `ADMIN_PASSPHRASE` constant near the top of `index.html`, AND the `ADMIN_PASSPHRASE` secret in Supabase (Phase 3). They must match, or Unlock will work but Remove buttons will fail with "Incorrect admin passphrase."
- **Viewing/managing raw data:** the Supabase **Table Editor** lets you browse or manually edit/delete rows in `locations`, `stories`, and `photos` directly, if you ever need to go around the dashboard's own admin panel.
- **Anthropic API cost:** each moderation check and each Prayer Guide PDF makes one small API call. At normal ministry-event volume this should stay in the range of a few dollars a month at most; you can watch usage at console.anthropic.com → Usage, and set a spending limit under Billing if you want a hard cap.
- **Supabase free tier limits:** 500 MB database storage and 1 GB file storage, which is enormous headroom for this use case (thousands of pins/reflections, hundreds of compressed photos). If you ever outgrow it, Supabase's paid tier is inexpensive and the migration is just upgrading a setting, not a code change.
