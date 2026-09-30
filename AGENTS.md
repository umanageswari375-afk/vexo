<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

# Project notes

Vexo — a browser-based AI code editor (VS Code-style) built on React +
TanStack Router/Start, with a Monaco editor, a
sandbox preview, a terminal, Firebase auth/Firestore, and an AI agent.

## Commands
- Dev: `npx vite dev --port 12000 --host 0.0.0.0`
- Build: `npm run build`; typecheck: `npx tsc --noEmit`; lint: `npx eslint src/`
- Deliverable: `git archive --format=zip -o public/vexo-learning-hub.zip HEAD`.
  Never build zips by hand from the working tree: the old `-full.zip` picked up
  `.env` and leaked live keys. `git archive` only emits tracked files, and
  `.env` is gitignored, so real secrets can never enter the bundle.

## Architecture notes
- `src/lib/vexo-engine.ts` — file ops, `parseAgent` (`<vexo-file>`, `<vexo-image>`,
  `<vexo-command>`, `<vexo-done>`), `applyOps`, `buildPreview`. The preview inlines
  CSS/JS into one HTML document; embedded `data:` image URLs pass through untouched.
- `src/lib/runtime.server.ts` — real Node runtime. Auto-runs `npm install` when
  node_modules is missing/stale, and serves static projects that have no package.json
  via a generated `.vexo-static-server.mjs`. Sessions are proxied through `/api/rt/<port>/`.
- `src/lib/images.server.ts` — image fetching (loremflickr → seeded picsum → inline SVG).
  Reachable from the browser only through `POST /api/fetch-image` (auth required).
- Agent context in `src/routes/api/agent.ts` must never include base64 image data;
  it is replaced with a path marker to protect the token budget.

## Constraints
- Keep the Vexo logo, branding, and colours. Do not redesign.
- Scope is a plain code editor. Do not add account-grouping, cohort, role,
  catalogue, or progress-tracking features — no LMS-style screens.
- Runtime must never call native `prompt()` / `confirm()`: they throw inside the
  sandboxed preview iframe. Use the inline dialog components instead.
- Check `.env` line endings when auth/keys mysteriously fail. A CRLF (`\r`) suffix
  travels into the value and corrupts the admin password, `PORT`, and API keys.
- There is no `index.html`; TanStack Start renders the shell from `src/routes/__root.tsx`.
