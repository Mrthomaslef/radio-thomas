# Radio Thomas — Handover Guide

Welcome! This guide takes you from "I have nothing installed" to "I changed the website and it is live". No coding experience needed — you will mostly be talking to your AI assistant (Antigravity) and copy-pasting a few commands.

**How to read this guide:** go top to bottom the first time. Every command is in a grey box — copy it exactly. After important steps there is a **"You should see"** line so you know it worked.

## Table of contents

1. [What this project is](#1-what-this-project-is)
2. [Install the tools (one time)](#2-install-the-tools-one-time)
3. [Get the code and run it on your computer](#3-get-the-code-and-run-it-on-your-computer)
4. [Day-to-day: saving your work with Git](#4-day-to-day-saving-your-work-with-git)
5. [Putting the site live (deploying)](#5-putting-the-site-live-deploying)
6. [Connecting Vercel and Supabase to your AI (MCP)](#6-connecting-vercel-and-supabase-to-your-ai-mcp)
7. [How to ask the AI (copy-paste prompts)](#7-how-to-ask-the-ai-copy-paste-prompts)
8. [Security rules](#8-security-rules)
9. [Troubleshooting](#9-troubleshooting)
10. [Glossary](#10-glossary)

---

## 1. What this project is

A website for **medical radiography courses**, with a landing page, course content and quizzes.

| Piece | What it is | Where it lives |
|---|---|---|
| **Frontend** | The pages people see. Built with *Vite + React*. | `src/`, `index.html` |
| **Backend (API)** | Small server functions the pages call. | `api/` (e.g. `api/hello.js`) |
| **Database** | Stores data (e.g. quiz content). Run by *Supabase*. Project name: `thomas-radio`. | Supabase cloud |
| **Hosting** | Puts the site on the internet. Run by *Vercel*. Project: `radio-thomas`. | Vercel cloud |
| **Code storage** | Keeps all versions of the code. *GitHub* repo `charlesandre/radio-thomas`. | GitHub cloud |

Simple picture:

```
   Visitor's browser
          |
          v
  +----------------+        +------------------+        +------------------+
  |    Vercel      | -----> |  /api functions  | -----> |  Supabase (DB)   |
  | (hosts the     |        |  (api/*.js)      |        |  project         |
  |  React site)   |        |                  |        |  thomas-radio    |
  +----------------+        +------------------+        +------------------+
          ^
          |  every time new code is pushed
     +----------+
     |  GitHub  |  <---- you push your changes here
     +----------+
```

Live site: https://radio-thomas-charlesandres-projects.vercel.app

---

## 2. Install the tools (one time)

You need four things: **Git**, **Node.js**, the **GitHub CLI** (`gh`), and **Antigravity CLI** (you already have it).

### macOS

1. Open the **Terminal** app (press `Cmd + Space`, type `Terminal`, press Enter).
2. Install Homebrew (a tool installer) if you don't have it — follow the one-line command at https://brew.sh
3. Then run:

```bash
brew install git node gh
```

### Windows

1. Install **Git for Windows**: https://git-scm.com/download/win (keep all default options).
2. Install **Node.js LTS**: https://nodejs.org (click the "LTS" button, keep defaults).
3. Install the **GitHub CLI**: https://cli.github.com (or in PowerShell: `winget install GitHub.cli`).
4. Open **PowerShell** (Start menu → type `PowerShell`) for all commands below. **Close and reopen it after installing** so it finds the new tools.

### Check it worked (both systems)

```bash
git --version
node --version
gh --version
```

**You should see** three version numbers (for example `git version 2.x`, `v22.x` or higher, `gh version 2.x`). If one says "command not found", see [Troubleshooting](#9-troubleshooting).

### Accept the GitHub invite

The owner (Charles) adds you as a collaborator on the repo. You get an email from GitHub → click **View invitation** → **Accept**. Without this you cannot download or push the code.

### Antigravity CLI

You already have it. Just start it the way you normally do, inside the project folder (see step 3.4).

---

## 3. Get the code and run it on your computer

### 3.1 Log in to GitHub from the terminal

```bash
gh auth login
```

Answer the questions like this:

- **Where do you use GitHub?** → `GitHub.com`
- **Preferred protocol for Git operations?** → **`HTTPS`** (important — simpler than SSH keys)
- **Authenticate Git with your GitHub credentials?** → `Yes`
- **How would you like to authenticate?** → `Login with a web browser`

Copy the one-time code shown, press Enter, paste it in the browser page that opens, and approve.

**You should see:** `✓ Logged in as <your-username>`.

### 3.2 Download the project ("clone")

Pick a folder where you keep projects (for example your Documents), then:

```bash
cd ~/Documents
gh repo clone charlesandre/radio-thomas
cd radio-thomas
```

(On Windows `~/Documents` also works in PowerShell.)

**You should see:** a new folder `radio-thomas` containing files like `package.json`, `index.html`, `src`, `api`.

### 3.3 Install the project's dependencies and start it

```bash
npm install
npm run dev
```

- `npm install` downloads the libraries the site uses. Takes about a minute. Needed only the first time (and when `package.json` changes).
- `npm run dev` starts the site on your computer.

**You should see** something like:

```
  VITE v5.x  ready in 300 ms
  ➜  Local:   http://localhost:5173/
```

Open **http://localhost:5173** in your browser. That is the website, running on your machine. Edit a file → the page updates by itself. Press `Ctrl + C` in the terminal to stop it.

### 3.4 Start Antigravity in the project folder

In a **second** terminal window (leave `npm run dev` running in the first):

```bash
cd ~/Documents/radio-thomas
```

then start Antigravity CLI. Now you can ask it to change the site (see [section 7](#7-how-to-ask-the-ai-copy-paste-prompts)).

### 3.5 About the "/api" and the database locally

The site calls `/api/...` for data (the API reads Supabase). On your computer the API functions are **not** running, so `vite.config.js` automatically **forwards `/api` to the live backend** on Vercel. Result: everything works locally with no extra setup, and you read the real database.

Want to point at a different backend? Create a file called `.env.local` in the project root with:

```
VITE_API_PROXY=https://your-other-backend.vercel.app
```

(see `.env.example`). Never commit `.env.local` (it is already ignored by Git).

*Advanced, optional:* `vercel dev` can run the API functions locally too, but it requires being logged in to the Vercel account that owns the project and having the Supabase variables set — skip it unless the owner gives you access. The proxy is enough for 99% of work.

### 3.6 Check a production build (optional)

```bash
npm run build
```

**You should see** `✓ built in …` and a `dist/` folder. This is what Vercel runs when deploying. If it fails, the site would fail to deploy too — fix it before pushing.

---

## 4. Day-to-day: saving your work with Git

Git = a history of the project. **Commit** = a saved snapshot with a message. **Push** = upload your snapshots to GitHub.

### 4.1 One-time: tell Git who you are (IMPORTANT)

```bash
git config --global user.name "Your Name"
git config --global user.email "the-email-on-your-github-account@example.com"
```

Use an email that is **attached to your GitHub account** (GitHub → Settings → Emails).

> **Why this matters for deployment:** Vercel checks **who authored the commit**. See [5.2](#52-the-important-catch-hobby-plan-and-commit-authors) — this is the #1 cause of "my change is not live".

### 4.2 The normal loop (use a branch + pull request — recommended)

A **branch** is a safe copy to experiment on. The live site only changes when the branch is merged into `master`.

```bash
git checkout master
git pull
git checkout -b my-change-name
```

Make your changes (with the AI). Look at what changed:

```bash
git status
```

Save and upload:

```bash
git add -A
git commit -m "Short description of what I changed"
git push -u origin my-change-name
```

**You should see** a line with a link like `Create a pull request for 'my-change-name' on GitHub`. Open it → **Create pull request** → ask Charles to review and merge. Or do it from the terminal:

```bash
gh pr create --fill
```

Before every new piece of work: `git checkout master && git pull` so you start from the latest version.

### 4.3 Direct to master (only if the owner agrees)

```bash
git add -A
git commit -m "Short description"
git push
```

On this project **every push to `master` triggers a production deployment**, so only do this for small, tested changes (`npm run build` passes).

### 4.4 Never do these

- Don't `git push --force`.
- Don't commit `.env` files, passwords or keys (see [section 8](#8-security-rules)).
- Don't delete the `.git` folder.

---

## 5. Putting the site live (deploying)

### 5.1 How it works

The Vercel project **`radio-thomas`** (team `charlesandres-projects`) is connected to the GitHub repo. When a new commit lands on `master`, Vercel builds the site (`npm run build` → `dist/`) and publishes it at:

https://radio-thomas-charlesandres-projects.vercel.app

Environment variables set on Vercel (Production):

| Name | What it is | Where to find the value |
|---|---|---|
| `SUPABASE_URL` | Address of the database API | Supabase dashboard → project `thomas-radio` → **Project Settings → API** (also shown as "Project URL") |
| `SUPABASE_PUBLISHABLE_KEY` | Public (browser-safe) key, protected by row-level security | Supabase dashboard → **Project Settings → API keys** → "Publishable key" |

You normally never need to touch them. If you do, Vercel dashboard → project → **Settings → Environment Variables**. Don't paste key values into chat, docs, or Git.

### 5.2 The important catch: Hobby plan and commit authors

The Vercel account is on the **free "Hobby" plan**. Hobby has **no collaboration**: Vercel only deploys a commit if its **author is the account owner**. Otherwise the deployment shows as **BLOCKED**, with messages like:

> "The Deployment was blocked because the commit author does not have contributing access to the project on Vercel. Hobby teams do not support collaboration."

(We hit this ourselves: commits authored with the wrong email were blocked even when deployed from the command line.) Source: https://vercel.com/docs/deployments/troubleshoot-project-collaboration

**What it means for you:** if *your* commit is the latest on `master`, Vercel will block that deployment, even though the push to GitHub works fine. Nothing breaks — the old site stays online — your change just doesn't go live.

**Your options (honest trade-offs):**

| Option | Cost | Effort | Notes |
|---|---|---|---|
| **A. Friend pushes a branch / pull request, owner publishes** | Free | Small, needs the owner for each release | You do all the work; Charles merges and publishes. No account sharing. |
| **B. Upgrade Vercel to Pro and add you as a team member** | About $20/month per paid seat (check current pricing) | One-time setup, then you deploy yourself | Cleanest long-term. |
| C. Make the GitHub repo public | Free | Easy, but **anyone can read the code** | Vercel community answers say collaboration is allowed for public repos on Hobby; we have not verified it for this project. Not recommended unless the code is meant to be public. |
| D. Share the owner's Vercel login | Free | Easy | **Don't.** Never share passwords. |

**Recommendation:** start with **A** (free, safe). If waiting for the owner becomes annoying, switch to **B**.

**How option A works in practice** (for the owner, Charles):

```bash
git checkout master
git pull
git merge friend-branch-name      # review the changes first!
git commit --allow-empty -m "Release"   # an owner-authored commit on top, so Vercel accepts it
git push
```

The empty "Release" commit is authored by the owner, so Vercel's check passes and the site publishes. (Merging a PR with the GitHub button keeps *your* name as author and would be blocked on Hobby — hence the manual merge.)

### 5.3 Deploying from the command line (owner only)

```bash
npm install -g vercel
vercel login
vercel deploy --prod --scope charlesandres-projects
```

**You should see** a line ending with `Production: https://radio-thomas-….vercel.app`. The latest commit's author must still be the owner (same rule as above).

### 5.4 Check a deployment worked

- Open the live URL and refresh (`Cmd/Ctrl + Shift + R`).
- Vercel dashboard → project `radio-thomas` → **Deployments**: the top one should say **Ready**. **Blocked** = commit author problem (see 5.2). **Error** = build failed → run `npm run build` locally and read the error.
- Quick backend test: open https://radio-thomas-charlesandres-projects.vercel.app/api/hello — you should see JSON with a `message`.

---

## 6. Connecting Vercel and Supabase to your AI (MCP)

**MCP** lets your AI assistant talk directly to Vercel (see deployments, logs) and Supabase (look at tables, run queries) instead of you copying things around. Optional but very handy.

> **Honest heads-up:** Vercel only approves a list of AI tools to connect to its MCP server (https://vercel.com/docs/mcp/vercel-mcp). Antigravity is not on that list at the time of writing, so the Vercel connection may be refused. If so, use the Vercel command line instead (`vercel logs`, `vercel ls`) or the Vercel dashboard. Supabase's MCP server has no such restriction.

### 6.1 Where Antigravity stores MCP settings

Source: https://antigravity.google/docs/mcp/

- Global (all projects): `~/.gemini/config/mcp_config.json`
- Just this project: `.agents/mcp_config.json` (in the project folder)

The file is JSON. Remote servers use the key **`serverUrl`** (not `url`). In the Antigravity app you can also open: agent side panel → **…** → **MCP Servers** → **Manage MCP Servers** → **View raw config**.

### 6.2 Add Supabase and Vercel

Open (or create) `~/.gemini/config/mcp_config.json` and put:

```json
{
  "mcpServers": {
    "supabase": {
      "serverUrl": "https://mcp.supabase.com/mcp?project_ref=bfpyeoeggxhaiyvvltbm"
    },
    "vercel": {
      "serverUrl": "https://mcp.vercel.com"
    }
  }
}
```

If the file already has other servers, just add these two entries inside the existing `mcpServers` block (mind the commas).

Notes on the Supabase URL (source: https://supabase.com/docs/guides/getting-started/mcp):

- `?project_ref=bfpyeoeggxhaiyvvltbm` limits the AI to the `thomas-radio` project only — safer.
- Add `&read_only=true` (so the full URL ends `...bfpyeoeggxhaiyvvltbm&read_only=true`) if you only want the AI to *look* at the data and not change it. Recommended until you are comfortable. Remove it when you need the AI to create tables.

### 6.3 Log in (authenticate)

Per the Antigravity docs:

1. Open **Agent settings**: `Cmd + ,` (macOS) or `Ctrl + ,` (Windows).
2. Go to the **Customizations** tab → click **Authenticate** next to the server.
3. Finish the login in the browser, copy the authorization code it gives you.
4. Paste it back in the settings panel → **Submit**.
5. The server reconnects by itself.

In the CLI, type `/mcp` and press Enter to see each server's status, reload them, and read connection logs.

By default Antigravity will **ask your permission** before using an MCP tool the first time. Keep that on — it protects you from the AI doing something unexpected.

**Test it:** ask your AI *"Use the Supabase MCP to list the tables in the database."* You should get a list that includes `hello`.

### 6.4 The owner gives you access (Charles does this)

| Service | What Charles does | Notes |
|---|---|---|
| **GitHub** | Repo → **Settings → Collaborators → Add people** → your username | You accept the email invite. |
| **Supabase** | Dashboard → organization → **Team** (members) → invite your email, access to project `thomas-radio` | You log in with *your own* Supabase account at https://supabase.com, then the MCP login in 6.3 uses it. |
| **Vercel** | **Hobby plan limits this:** Hobby accounts can't have extra members. So your own Vercel account will **not** see the `radio-thomas` project. | To change that: option B in [5.2](#52-the-important-catch-hobby-plan-and-commit-authors) (Pro + add you as member). Until then, you work through GitHub and the owner deploys; the Vercel MCP is not useful for you. |

---

## 7. How to ask the AI (copy-paste prompts)

Start Antigravity inside the project folder. Be specific, one task at a time, and always finish with "and make sure `npm run build` passes".

**Look around first**
> Explain the structure of this project in simple words. What file controls the landing page? What file controls the quizzes?

**Change something small**
> On the landing page, change the main button color to a deeper blue and the hero title to "Master Medical Radiography". Keep the animations. Run `npm run build` to check nothing broke.

**Add a quiz question**
> Add a new quiz question to the radiography quiz: "Which projection is standard for a chest X-ray?" with 4 answers, correct answer "PA upright". Add a short explanation shown after answering. Follow the format of the existing questions.

**Add a course page**
> Add a new course page "Radiation Protection" with a title, a short intro, 3 lesson sections, and a "Start quiz" button. Link it from the landing page courses section. Match the existing design.

**Check the result**
> Start the dev server and tell me the address. Then list what files you changed.

**Save and send to GitHub**
> Create a git branch called `add-radiation-protection`, commit the changes with a clear message, and push it. Then give me the link to open a pull request.

**Deploy / check the live site**
> Show me the latest deployments of the radio-thomas project and tell me if the newest one is Ready, Blocked or in Error, and why.

**Something is broken**
> The page is blank at http://localhost:5173. Look at the terminal and browser console errors and fix it.

Tips: if the AI wants to run a command you don't understand, ask *"explain what this does before I approve it"*. Say **no** to anything that deletes data, force-pushes, or touches keys.

---

## 8. Security rules

- **Never commit secrets.** Files named `.env` or `.env.*` are ignored by Git on purpose (except `.env.example`, which holds no real values). Don't remove that protection.
- **Never share the Supabase `service_role` key** (or "secret" key). It bypasses all database protection. Only the *publishable* key is allowed in this project's configuration, and even that you shouldn't paste into chats.
- **Row Level Security (RLS) is ON** for our tables. It means the public key can only do what the table's policies allow (e.g. the `hello` table is read-only to the public). When the AI creates a new table, always ask it to **enable RLS and add policies** — a table without RLS is readable and writable by anyone.
- **Never share passwords or login codes** (GitHub, Vercel, Supabase), not even with the owner. Use invites instead.
- Keep **tool-approval prompts on** in Antigravity, especially for MCP tools and terminal commands.
- If you ever paste a secret by accident: tell the owner immediately so it can be rotated.

---

## 9. Troubleshooting

| Problem | Fix |
|---|---|
| `command not found: git` / `node` / `gh` / `npm` | Close and reopen the terminal. Still failing → reinstall that tool (section 2). On Windows use PowerShell, not an old Command Prompt. |
| `gh repo clone` says **Repository not found** | You haven't accepted the GitHub invite, or you're logged in to the wrong GitHub account. Run `gh auth status`; check your email for the invitation. |
| Git asks for a password / `Permission denied (publickey)` | You chose SSH. Redo `gh auth login` and pick **HTTPS**, then run `gh auth setup-git`. |
| `npm install` fails with permission or network errors | Check your internet, then delete the `node_modules` folder and run `npm install` again. Make sure `node --version` is a recent LTS. |
| `npm run dev`: **port 5173 already in use** | Another copy is running — close it (`Ctrl + C`) or use the new port Vite suggests. |
| Page is blank / red error in the browser | Read the terminal running `npm run dev` and the browser console (`F12`). Paste the error to your AI and ask it to fix it. |
| The backend message never appears locally | The `/api` proxy needs internet. Check https://radio-thomas-charlesandres-projects.vercel.app/api/hello opens in your browser. |
| I pushed, but the live site didn't change | Vercel → Deployments. **Blocked** → commit author problem (section 5.2). **Error** → run `npm run build` locally. **Nothing new** → you pushed a branch, not `master`; merge it first. |
| Deployment says **BLOCKED** | Hobby plan + commit author isn't the owner. See 5.2 options. Also double check `git config user.email`. |
| Wrong email on my commits | `git config --global user.email "right@email.com"`. Only affects *new* commits. |
| `git push` rejected ("fetch first" / "non-fast-forward") | Someone pushed before you. Run `git pull`, then `git push` again. If it reports conflicts, ask your AI: *"Help me resolve these git merge conflicts"*. |
| MCP server shows "needs authentication" | Do the steps in 6.3. In the CLI use `/mcp` to check status and logs. |
| Vercel MCP refuses to connect | Expected for some clients (see the note at the top of section 6). Use the Vercel dashboard or `vercel` CLI instead. |
| Supabase MCP can't see tables | Check you accepted the Supabase invite, and that the URL has the right `project_ref` (`bfpyeoeggxhaiyvvltbm`). |
| Something is really stuck | Save nothing, copy the full error text, and ask Charles. Don't delete the project folder in a panic — Git keeps everything safe on GitHub. |

---

## 10. Glossary

- **Repo / repository** — the project folder with its full history, stored on GitHub.
- **Clone** — download a repo to your computer.
- **Commit** — a saved snapshot of changes, with a message.
- **Push / pull** — upload / download commits to/from GitHub.
- **Branch** — a parallel copy of the project to work on safely.
- **Pull request (PR)** — "please review my branch and merge it".
- **Deploy** — publish a version of the site to the internet.
- **Frontend / backend** — what visitors see / the server code behind it.
- **API** — a URL the frontend calls to get data (here `/api/...`).
- **Environment variable** — a setting (like a database address) kept outside the code.
- **MCP** — a plug that lets your AI assistant use outside tools (Vercel, Supabase).
- **RLS (Row Level Security)** — database rules that decide who can read or write which rows.
