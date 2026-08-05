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

## Deploy

Cloudflare, via `wrangler.jsonc`, which serves the built `public/` directory.

```powershell
hugo --gc --minify
npx wrangler deploy
```
