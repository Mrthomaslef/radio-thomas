# Radio Thomas: instructions for AI agents

Website for **medical radiography courses with quizzes**. Vite + React frontend, serverless API in `api/`, Supabase (Postgres) database, hosted automatically from GitHub.

The person you are helping is **not very technical**. Explain in plain words, one step at a time, and say what you changed and how to see it.

## Language

- **Site copy (everything visitors read) is in French.** Keep it French and keep the tone clear and friendly. Use proper accents and typographic apostrophes (’).
- Code, identifiers, comments and commit messages: English.
- Talk to the user in the language they use.

## Run it locally

```bash
npm install          # first time only
npm run dev          # http://localhost:5173
npm run build        # production build, must pass before every push
```

- `npm run dev` forwards `/api/*` to the live backend (see `vite.config.js`), so no extra setup is needed. Open http://localhost:5173 in the browser.
- To stop the dev server: `Ctrl + C`.

## Project map

| Path | What |
|---|---|
| `src/components/` | Page sections (Hero, Courses, Quiz, ...) |
| `src/data/courses.js`, `src/data/quiz.js` | Course list and quiz questions (edit content here) |
| `src/styles.css` | All styling (mobile rules at the bottom) |
| `api/*.js` | Serverless functions, ES modules (`export default async function handler(req, res)`) |
| `.github/workflows/deploy.yml` | Automatic deploy, do not change without asking the owner |

## Publishing: push to `master`

**To publish a change, push it to `master`. That is the normal workflow.** Every push to `master` builds and deploys the site automatically in about 1–2 minutes. No hosting account, login or extra tool is needed.

Do this when the user asks to publish or save their work:

```bash
npm run build                      # must succeed first
git add -A
git commit -m "Short description of the change"
git push                           # pushes to master
```

Then check the result:

```bash
gh run list --limit 1              # "Deploy site" should end in success
```

Live site: https://radio-thomas-charlesandres-projects.vercel.app

Rules:
- Run `npm run build` before pushing. If it fails, fix it first. Never push a broken build.
- Pull before starting work: `git pull`.
- Never `git push --force`.
- Commit author email must be the user's own, set once with `git config user.email "..."` and `git config user.name "..."`.
- If the "Deploy site" run fails, read the log with `gh run view --log-failed`, fix the cause, push again.

## Database (Supabase, project `thomas-radio`)

- Use the Supabase MCP when available. The live database is production: there is no staging copy.
- Every new table needs **row-level security enabled and a tested policy**. After schema changes, run the Supabase advisors and fix any warning.
- Save schema changes as SQL files in `supabase/migrations/` (timestamped) and commit them.
- The browser may only use the **publishable** key. Never put a `service_role`/secret key in frontend code, Git or chat.
- Anything storing personal data (e.g. who passed a quiz) needs a privacy notice, only the data really needed, and a way to delete it (the site is French/EU, GDPR applies).

## Never

- Commit `.env` files, passwords, tokens or keys.
- Edit `.github/workflows/deploy.yml` or `vercel.json` unless the owner asks.
- Delete data or tables without explicit confirmation.
