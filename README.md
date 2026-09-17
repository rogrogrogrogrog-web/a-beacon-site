# A Beacon — site

Hugo site for [abeacongame.com](https://abeacongame.com/). Theme: [ananke](https://github.com/gohugo-ananke/ananke) (git submodule in `themes/ananke`).

## Requirements

- **Hugo extended ≥ 0.160.0** (theme minimum; currently installed: 0.164.0)
  ```powershell
  winget install Hugo.Hugo.Extended
  ```
  If `hugo` isn't recognised, it's a stale PATH — winget puts the binary in
  `%LOCALAPPDATA%\Microsoft\WinGet\Packages\Hugo.Hugo.Extended_Microsoft.Winget.Source_8wekyb3d8bbwe`
  and adds that to the user PATH, but only new processes pick it up. Fully restart VSCode,
  or patch the current session:
  ```powershell
  $env:PATH += ";$env:LOCALAPPDATA\Microsoft\WinGet\Packages\Hugo.Hugo.Extended_Microsoft.Winget.Source_8wekyb3d8bbwe"
  ```
- No npm step — the theme's CSS pipeline is plain `resources.Get`, no PostCSS/Tailwind build.

After a fresh clone, pull the theme down:

```powershell
git submodule update --init --recursive
```

## Preview

```powershell
hugo server -D
```

Serves on <http://localhost:1313> with live reload. `-D` includes drafts.

Handy variants:

- `hugo server -D --navigateToChanged` — browser follows the page you're editing
- `hugo` — one-off build into `public/`
- `hugo --gc --minify` — production-style build

## Content

- Posts live in `content/posts/` — either a single `.md` (`devlog-001.md`) or a page bundle
  directory with `index.md` plus its images (`devlog-002/`)
- Standalone pages: `content/contact.md`, `content/thanks.md`
- New post: `hugo new content/posts/devlog-003.md` (uses `archetypes/default.md`)
- Site config: `hugo.toml`

## Comments

Self-hosted: a Cloudflare Worker (`worker/index.js`) stores comments in D1. New comments are
held as pending until approved at `/admin/comments/`. Spam protection is reCAPTCHA v2
(checkbox), a honeypot field and a per-IP rate limit.

- Posts only; the comments section stays hidden until `recaptcha_site_key` is set in `hugo.toml`
- Front-end: `layouts/_partials/comments.html` + `static/js/comments.js`
- Admin page: `static/admin/comments/index.html`

One-time setup:

1. Create reCAPTCHA **v2 "I'm not a robot"** keys at <https://www.google.com/recaptcha/admin>
   for `abeacongame.com` (add `localhost` / `127.0.0.1` to test locally). Put the site key in
   `hugo.toml` under `[params.comments]`.
2. Create the database, copy its id into `wrangler.jsonc`, then create the table:
   ```powershell
   npx wrangler d1 create a-beacon-comments
   npx wrangler d1 execute a-beacon-comments --remote --file worker/schema.sql
   ```
3. Set the secrets:
   ```powershell
   npx wrangler secret put RECAPTCHA_SECRET
   npx wrangler secret put ADMIN_PASSWORD
   ```

Local testing: `.dev.vars` (gitignored) holds local secrets. Build the site, then
`npx wrangler d1 execute a-beacon-comments --local --file worker/schema.sql` once and
`npx wrangler dev`, which serves `public/` plus the API on <http://localhost:8787>.

## Deploy

Cloudflare, via `wrangler.jsonc`, which serves the built `public/` directory.

```powershell
hugo --gc --minify
npx wrangler deploy
```
