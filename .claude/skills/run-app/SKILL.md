---
name: run-app
description: Launch Campaign Manager and drive it end-to-end in a real browser, signed in, with the AI endpoints live. Use whenever a change needs verifying in the running app — "run the app", "does this work", "screenshot it", "check it in the browser", "e2e test this" — and ALWAYS instead of stopping at unit tests when a change is visible in the UI. Covers the dev-mode auto-login that gets past the sign-in screen without anyone typing a password.
---

# Running Campaign Manager end-to-end

Almost everything in this app lives behind a Supabase login and, for the AI
features, behind a serverless `/api` function. Both are reachable in dev without
a human at the keyboard. **Never stop at "it builds and the unit tests pass" for
a change that shows up in the UI** — and never ask the user to click through it
themselves. Run it.

## The flow

### 1. Start both servers

Two servers, both via `preview_start` (never Bash):

| Config | Serves | Notes |
|---|---|---|
| `campaign-manager` | Vite, the app itself | `autoPort: true` — read the assigned port from the result |
| `campaign-api` | `vercel dev` on :3000, the `/api/*` functions | Only needed for AI features |

Vite proxies `/api` → `localhost:3000`. Without `campaign-api` running, any AI
call returns a 503 explaining the API server is down.

Check whether `vercel dev` is already up before starting it:

```bash
curl -s -m 5 -o /dev/null -w "%{http_code}\n" http://localhost:3000/
```

`preview_start` refuses port 3000 if a non-preview process holds it — that's
usually the user's own `vercel dev`, which is fine. Just use it.

### 2. Sign in without touching credentials

Navigate to the dev server with `?auto-login`:

```
http://localhost:<port>/?auto-login
```

`LoginScreen` (src/App.tsx) reads `VITE_E2E_USER_EMAIL` / `VITE_E2E_USER_PASSWORD`
from `.env.local` and signs in on mount. It is gated on `import.meta.env.DEV`,
so it only ever works against the dev server.

**You never read, type, or handle the credentials** — the app does it. This is
the whole reason the hook exists. Do not fall back to typing into the login
form, and do not report a change as unverifiable because of the login screen.

If it errors with "VITE_E2E_USER_EMAIL and VITE_E2E_USER_PASSWORD must be set",
tell the user to fill them into `.env.local` (see `.env.example`) — that's the
one case where this is blocked.

The first paint after auto-login is a "Loading…" splash. Screenshot again.

### 3. Drive it

The app lands on the **world** overview. Typical route into campaign content:
world overview → click the campaign card → left sidebar (Modules, Cast, Lore,
Threads, Sessions, Combat…). The Campaign Assistant is `⌘K` or the sidebar
"Assistant" entry.

Notes that will save you time:

- **Clicks must be real.** Driving React via `javascript_tool` (`el.click()`)
  does not fire synthetic handlers reliably. Use `computer` clicks on
  coordinates from a fresh screenshot, or `ref` values from `read_page`.
- `javascript_tool` is still the fast way to *find* things — e.g. list button
  labels with
  `Array.from(document.querySelectorAll('button')).map(b=>b.textContent.trim())`
  — then click the real one.
- Panes scroll independently; a `computer` scroll aimed at the wrong pane can
  hang. Prefer `read_page` + `scroll_to` on a ref.
- Writes are one Supabase round trip each, and several refetch after. A tree of
  a dozen records takes a few seconds — screenshot again rather than assuming a
  stuck spinner.
- AI calls through `vercel dev` are slow on first hit (cold function compile).
  Give the first one 20-30s before treating it as hung.

### 4. Verify like you mean it

- `read_console_messages {onlyErrors: true}` and `preview_logs {level: "error"}`.
- Screenshot the actual result state, not just the form you filled in.
- For anything that writes: navigate back to where the data lives and confirm it
  is really there, in the right order, under the right parent. The staging tray
  saying "committed" is not proof the row landed correctly.

## Test data

`Test World` / the `Test` campaign is scratch space — safe to create modules,
NPCs, etc. in. Say what you left behind so the user can clear it.

## When unit tests are still the right call

Component and hook tests (vitest + testing-library, `src/test/contextMocks.ts`)
are better for enumerating edge cases — error paths, malformed AI JSON, ordering
under load. Use them *alongside* an e2e pass, not instead of one. The e2e run is
what proves the wiring; the unit tests are what pin the behavior down.
