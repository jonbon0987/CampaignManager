# DM Lair

*Where every campaign comes to life.*

DM Lair is a prep-and-run companion for tabletop Dungeon Masters — world lore, locations,
NPCs, factions, modules, encounters, session notes, and live-session tools in one place.

> **Naming:** the product is **DM Lair** (the name used everywhere in the app). *Scriptorium*
> is the internal codename of the design system only (referenced in `src/index.css`,
> `src/lib/theme.ts`, and `src/components/ui/`), not a user-facing product name.

Built with React 19 + TypeScript + Vite + Tailwind, backed by Supabase.

---

## Getting started

Requires Node 22 (the Discord bot needs 22.12 or later) and a Supabase project.

```bash
npm install
cp .env.example .env.local   # then fill it in, see below
npm run migrate              # apply migrations/ to your Supabase database
npm run dev                  # the app, on Vite's dev server
```

The AI features call the serverless functions in `api/`. To use them locally, run
`vercel dev` alongside the app; Vite proxies `/api` to `localhost:3000`. Without it
the app works and AI calls report that the API server is down.

## Environment

All variables are documented in `.env.example`. In short:

| Variable | Needed for |
|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | The app. It will not start without both. |
| `SUPABASE_DB_URL` | `npm run migrate` only. Use the direct connection, not the pooled port. |
| `GOOGLE_AI_API_KEY` | The assistant and generators (Gemini is the default provider). Server-side only. |
| `ANTHROPIC_API_KEY`, `VITE_AI_PROVIDER` | Optional: switch the provider to Claude. |
| `GEMINI_MODEL` | Optional: override the Gemini model. |
| `VITE_E2E_USER_EMAIL`, `VITE_E2E_USER_PASSWORD` | Optional: dev-only sign-in at `/?auto-login`. |

Server-side keys are read by the functions in `api/`, never by the browser. In
production they belong in the host's environment settings; `.env.local` is not deployed.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the app with hot reload. |
| `npm run build` | Production build into `dist/`. Does not typecheck; see below. |
| `npm run lint` | ESLint over the project. |
| `npx tsc -b` | Typecheck. |
| `npm test` | Run the Vitest suite once. `npm run test:watch` to watch, `npm run test:coverage` for coverage. |
| `npm run migrate` | Apply pending SQL migrations. `-- --status` lists them, `-- --dry-run` changes nothing. |
| `npm run migrate:gen-constraints` | Regenerate the field-length constraints. |
| `npm run bot` | Run the Discord recording bot. See [`bot/README.md`](bot/README.md) for setup and the `bot:*` helpers. |

Tests need `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to be set to something,
because the Supabase client refuses to load without them. Any placeholder works; the
tests do not contact a real project.

## Checks on every pull request

`.github/workflows/ci.yml` runs lint, typecheck and tests on pull requests and on
`main`. Lint must report no errors; warnings are a tracked backlog, not a failure.

## Layout

```
api/          Serverless functions: assistant chat, generators, document parsing, transcription
bot/          Discord bot that records each player's voice track
migrations/   Ordered SQL, applied by scripts/migrate.ts
src/
  components/
    ui/       Shared primitives: Button, IconButton, Badge, EmptyState, PageHeader, ListDetail
    shell/    Sidebar, top bar, command palette, scope switcher
    tabs/     One file per campaign section
    world/    World-level views and the creation gates
    play/, session/, entity/, items/, …   Feature areas
  context/    React contexts: campaign, world, play, recording, navigation
  hooks/      Data and behaviour hooks, including the assistant backend
  lib/        Database access, theme maps, combat rules, routing, utilities
  index.css   Design tokens (:root) and component styles
```

## Design system (Scriptorium)

- **Tokens** live in `src/index.css` under `:root`: colours, the type scale (`--fs-*`),
  layers (`--z-*`), radii and fonts. `tailwind.config.js` points at the same variables,
  so utilities and hand-written CSS cannot drift apart. Add a token rather than a
  literal colour.
- **Taxonomy colours** (creature types, thread states, difficulty, timeline event
  types and so on) live in `src/lib/theme.ts`, not in components.
- **Buttons** go through `<Button>` and `<IconButton>` from `src/components/ui`.
  ESLint warns on a styled raw `<button>` outside `ui/`, and on `onClick` on an element
  the keyboard cannot reach. A control that is deliberately bespoke carries an
  `eslint-disable-next-line no-restricted-syntax -- reason` comment.
- **Styling:** prefixed classes in the stylesheets for feature surfaces, Tailwind
  utilities for one-off layout, inline `style` only for values computed at runtime.
- **Breakpoints** by convention: 640px (phone), 900px (narrow), 1240px (wide).
