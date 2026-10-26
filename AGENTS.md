# Radio Thomas: instructions for AI agents

"QUIZ Cotten": a website of **medical radiography quizzes** (currently the shoulder theme, 4 chapters, 40 questions with corrections and figures). Vite + React frontend, serverless API in `api/`, Supabase (Postgres) database, deployed automatically from GitHub.

The person you are helping is **not very technical**. Explain in plain words, one step at a time, and say what you changed and how to see it.

## Language

- **Site copy (everything visitors read) is in French.** Keep it French, clear and friendly, with proper accents and typographic apostrophes (’).
- Code, identifiers, comments and commit messages: English.
- Talk to the user in the language they use.

## Run it locally

```bash
npm install          # first time only
npm run dev          # http://localhost:5173
npm run build        # production build, must pass before every push
```

- `npm run dev` forwards `/api/*` to the live backend (`vite.config.js`, override with `VITE_API_PROXY` in `.env.local`), so no extra setup is needed. Local quiz results and admin edits therefore hit the **live database**.
- To stop the dev server: `Ctrl + C`.

## Architecture in one picture

```
Browser (React SPA, hash routes)
   │  fetch('/api/...')
   ▼
api/*.js  (Vercel serverless functions, ES modules)
   │  Supabase REST with the PUBLISHABLE key (SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY env vars)
   ▼
Supabase Postgres (project thomas-radio): RLS everywhere, admin writes only via password-checked SQL functions
```

There is **no router library and no state library**: routes are `window.location.hash`, state is React `useState`, animations use `framer-motion`.

## Routes (hash router in `src/App.jsx`)

| Hash | Shows |
|---|---|
| `#/` (anything else) | `Home`: asks a pseudo, then lists themes/chapters |
| `#/epaule` | `Home` with the theme "L’épaule" opened (so "back" from a chapter lands there) |
| `#/quiz/<ch1..ch4>` | `ChapterQuiz` for that chapter |
| `#/admin` | `AdminPage` (password-protected; footer link "Espace formateur") |

To add a theme: add it to `src/data/themes.js`. To add a chapter: add `src/data/quiz/chN.json`, register it in `src/data/useQuestions.js` (`CHAPTERS`) and `src/App.jsx` (`chapters`), and put its figures in `public/figures/chN/`.

## Project map

| Path | What |
|---|---|
| `src/main.jsx`, `src/App.jsx` | Entry point and hash router |
| `src/components/Home.jsx` | Pseudo step + theme/chapter picker (counts come from live questions) |
| `src/components/ChapterQuiz.jsx` | The quiz player: sub-theme filter chips, QCU/QRM, correction with figures and book reference, result screen, saves the result |
| `src/components/AdminPage.jsx` | Login + tab "Résultats" (who/when/score, filters) and tab "Questions" |
| `src/components/QuestionsAdmin.jsx` | Question editor: list, create, edit, soft-delete, restore, import, preview |
| `src/components/Navbar.jsx`, `Footer.jsx`, `Icons.jsx` | Layout pieces and inline SVG icons |
| `src/data/themes.js` | Themes and their chapters (home page structure) |
| `src/data/useQuestions.js` | Hook that loads live questions from `/api/questions`; falls back to the bundled JSON; module-level cache; `resetQuestionsCache()` after admin edits |
| `src/data/quiz/ch1–ch4.json` | Bundled questions + chapter metadata (title, authors, book) = fallback and source of the one-time import |
| `src/data/player.js` | Pseudo kept in `localStorage` (`radio-thomas:name`) |
| `src/styles.css` | All styling in one file (CSS variables on `:root`, mobile rules at the bottom) |
| `api/*.js` | Serverless endpoints (see below); `_validate.js` is shared and not an endpoint (leading `_`) |
| `supabase/migrations/` | SQL schema, timestamped; applied by hand (Supabase MCP or SQL editor) |
| `public/figures/<chN>/` | Figures used in corrections (static PNG files) |
| `.github/workflows/deploy.yml`, `vercel.json` | Automatic deploy; do not change without asking the owner |

**Legacy, no longer used by the app:** `src/components/CoursePage.jsx`, `Quiz.jsx` and `Reveal.jsx` (the earlier single-course page and landing quiz). Do not build on them; delete them only if the owner agrees.

## Quiz data model (one question)

```jsonc
{
  "id": "c1-q01",                 // unique, /^[a-z0-9-]{1,40}$/
  "type": "QCU",                  // QCU = one right answer, QRM = several
  "theme": "Anatomie : insertions humérales",   // sub-theme, drives the filter chips
  "enonce": "…", "enonce_image": null,
  "items": [{ "id": "A", "texte": "…", "correct": true }, …],   // ids A–F
  "explication": "…",
  "correction_figures": [{ "file": "….png", "caption": "…" }],  // files in public/figures/<chapter>/
  "source": { "page": 7, "element": "Texte", "refs": "[129, 150]" }
}
```

- Scoring: a question counts only if the selected set equals the set of correct items (QRM is all-or-nothing). A quiz is "passed" at 60 %.
- Item order is shuffled with a seed from the question id: stable across reloads.
- Progress is kept in `localStorage` (`quiz-cotten:v1:<chapter>`); the pseudo in `radio-thomas:name`. Both fail silently in private mode.

## API endpoints (`api/`)

| Endpoint | Method | What |
|---|---|---|
| `/api/questions` | GET | Live (non-deleted) questions, short cache. Empty list → site uses the bundled JSON |
| `/api/attempts` | POST | Stores one result `{name, course, quiz, score, total, passed, startedAt?}`; validated server-side. Public insert only |
| `/api/admin` | POST | `{password}` → list of all attempts (RPC `admin_list_attempts`) |
| `/api/admin-questions` | POST | `{password, action: list/save/delete/import, …}`; content validated by `_validate.js` |
| `/api/hello` | GET | Smoke test that reads the `hello` table |
| `/api/admin-questions` saves | POST | A `save` on an existing question must send `baseUpdatedAt` (the `updated_at` last seen); otherwise **409 conflict**, nothing is written. Review flags go through `action:'set_reviewed'` (server re-reads the row, only the flag changes). Never push whole questions from a possibly stale page |
| `/api/leaderboard` | GET | Quiz points (`get_leaderboard()`); `?type=contributors` → contributor points (`get_contributors_leaderboard()`). Both computed in SQL, never stored client-side: do not add localStorage/blob merging back |

Error messages returned by the API are in French. Functions use the **publishable** key only; they never have a secret key.

## Database (Supabase, project `thomas-radio`, region eu-west-1)

| Table | Access |
|---|---|
| `public.quiz_attempts` | RLS: anon/authenticated can only INSERT. No public read |
| `public.quiz_questions` (`id`, `chapter`, `position`, `data` jsonb, `deleted_at`) | Public SELECT of rows where `deleted_at is null`. Writes only through admin functions |
| `public.hello` | Public read, smoke test |
| `private.admin_secret`, `private.admin_login_failures`, `private.quiz_question_versions` | No grants: unreachable from the API; used by the functions |

Admin functions (`admin_list_attempts`, `admin_list_questions`, `admin_save_question`, `admin_delete_question`, `admin_import_questions`) are `SECURITY DEFINER`, check the password in Postgres (bcrypt) and lock everyone out for 10 min after 5 failed tries. Deleting a question is soft (`deleted_at`) and every change keeps the previous version in `private.quiz_question_versions`. The admin password is **never written in the repo or in chat**; it is rotated with SQL in the Supabase editor.

Rules:
- Use the Supabase MCP when available. The live database is **production**: there is no staging copy.
- Every new table needs **row-level security and a tested policy**. After schema changes, run the Supabase advisors and fix any warning.
- Save schema changes as SQL files in `supabase/migrations/` and **apply them** (a file in the repo is not applied automatically; check with the MCP `list_migrations`). Never `DELETE` without a `WHERE` (PostgREST refuses it).
- The browser and the API may only use the **publishable** key. Never put a `service_role`/secret key in frontend code, Git or chat.
- Names are personal data (GDPR, French/EU site): keep the privacy notice, collect nothing more than needed, delete a person's rows if asked.

## Editing questions

Normal path: the admin page, tab « Questions » (no deploy needed). The JSON files only matter as fallback, chapter metadata and the first import; the import never overwrites a question already edited on the site, so editing a JSON file does **not** change the live site. Images can be uploaded from the admin (a picture before the statement for iconography questions, and extra correction figures; **not** inside answers): the browser shrinks them (max 1400 px, JPEG), `POST /api/admin-questions {action:'upload'}` checks the real file signature, and they are stored in `public.quiz_images` (migration `20261018170000_quiz_images.sql`, to be applied by hand) and served by `GET /api/image?id=<32 hex>`. In a question they appear as `{upload:"<id>", alt|caption}` (bundled figures stay `{file, …}`). Use `imageSrc()` from `src/data/useQuestions.js` to build any image URL.

## Publishing: push to `master`

**To publish a change, push it to `master`. That is the normal workflow.** Every push to `master` builds and deploys the site automatically in about 1–2 minutes (GitHub Action "Deploy site"). No hosting account or extra tool is needed.

```bash
npm run build                      # must succeed first
git add -A
git commit -m "Short description of the change"
git push                           # pushes to master
gh run list --limit 1              # "Deploy site" should end in success
```

Live site: https://quizcotten.fr (domain bought at OVH, DNS: `A @ 216.198.79.1` and `CNAME www` → Vercel; `www` redirects to the root; the old `radio-thomas-charlesandres-projects.vercel.app` address still works and is the default target of the local dev proxy in `vite.config.js`)

Rules:
- Run `npm run build` before pushing. If it fails, fix it first. Never push a broken build.
- `git pull` before starting work (the owner and a friend both push to `master`).
- Never `git push --force`.
- Commit author must be the user's own name and email (`git config user.email`, `git config user.name`).
- If the "Deploy site" run fails: `gh run view --log-failed`, fix the cause, push again.

## Figures and copyright

Quiz text is our own wording. The owner confirmed (Oct 2026) the right to publish the figures extracted from the source book (« Imagerie musculosquelettique », Elsevier Masson), so `public/figures/<chN>/` is committed and shown in corrections with their captions and the book reference. Do not add figures from other sources without the owner confirming the rights.

## Quota & Anti-Loop Guardrails (Vercel & Supabase Free Tier)

- **Never use inline array/object default props** (`prop = []` or `prop = {}`) in React components when those props are passed into `useEffect` or `useCallback` dependency arrays (use a module-level constant like `const EMPTY_ARRAY = []`). Inline literals create a new reference on every render and can trigger infinite `fetch()` loops that burn gigabytes of Vercel Fast Origin Transfer and Supabase Egress in minutes.
- **No background polling (`setInterval`)**: never poll `/api/*` endpoints on a timer.
- **Keep client & server circuit-breakers**: every high-payload endpoint (`GET /api/questions`, `POST /api/admin-questions {action:'list'}`, `GET /api/image`, `GET /api/leaderboard`) must keep its client-side cooldown/deduplication and server-side rate-limit or CDN cache headers (`s-maxage`).
- **Proactive check**: whenever modifying data-fetching hooks (`useQuestions.js`, `QuestionsAdmin.jsx`, `AdminPage.jsx`, `player.js`), verify via Supabase `query_logs` MCP that no endpoint is being called repeatedly in a loop.

## Never

- Commit `.env` files, passwords, tokens or keys.
- Edit `.github/workflows/deploy.yml` or `vercel.json` unless the owner asks.
- Delete data or tables without explicit confirmation.
