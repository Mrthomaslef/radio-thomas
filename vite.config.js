import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const CACHE_FILE = path.join(process.cwd(), 'node_modules', '.cache', 'quiz-cotten-leaderboard-v2.json');

function readDevLeaderboard() {
  try {
    return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')) || {};
  } catch {
    return {};
  }
}

function writeDevLeaderboard(map) {
  try {
    fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(map, null, 2), 'utf8');
  } catch {
    // Ignore fs errors
  }
}

function localLeaderboardPlugin(target) {
  return {
    name: 'local-leaderboard-api',
    configureServer(server) {
      server.middlewares.use('/api/leaderboard', async (req, res, next) => {
        if (req.method === 'GET') {
          const map = readDevLeaderboard();

          // Also merge from deployed backend if available
          try {
            const remote = await fetch(`${target}/api/leaderboard`);
            if (remote.ok) {
              const data = await remote.json();
              if (Array.isArray(data?.entries)) {
                for (const e of data.entries) {
                  if (!e?.name) continue;
                  const k = e.name.trim().toLowerCase();
                  const prev = map[k];
                  if (!prev || (e.points || 0) >= (prev.points || 0)) {
                    map[k] = {
                      ...prev,
                      ...e,
                      points: Math.max(prev?.points || 0, e.points || 0),
                      quizzes: Math.max(prev?.quizzes || 0, e.quizzes || 0),
                    };
                  }
                }
                writeDevLeaderboard(map);
              }
            }
          } catch {
            // Ignore remote error in dev
          }

          const entries = Object.values(map)
            .filter((e) => e && e.name && (e.points > 0 || e.quizzes > 0))
            .sort((a, b) => (b.points || 0) - (a.points || 0) || (b.quizzes || 0) - (a.quizzes || 0));

          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'no-store');
          res.end(JSON.stringify({ entries }));
          return;
        }

        if (req.method === 'POST') {
          let raw = '';
          req.on('data', (chunk) => { raw += chunk; });
          req.on('end', async () => {
            try {
              const body = JSON.parse(raw || '{}');
              const name = typeof body.name === 'string' ? body.name.trim().replace(/\s+/g, ' ') : '';
              if (!name) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'Pseudo invalide.' }));
                return;
              }
              const k = name.toLowerCase();
              const map = readDevLeaderboard();
              const prev = map[k] || {};
              const entry = {
                ...prev,
                ...body,
                name,
                points: Math.max(Number(prev.points) || 0, Number(body.points) || 0),
                quizzes: Math.max(Number(prev.quizzes) || 0, Number(body.quizzes) || 0),
                updatedAt: new Date().toISOString(),
              };
              map[k] = entry;
              writeDevLeaderboard(map);

              // Forward to remote if deployed
              fetch(`${target}/api/leaderboard`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(entry),
              }).catch(() => {});

              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ ok: true, entry }));
            } catch {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: 'Corps JSON invalide.' }));
            }
          });
          return;
        }

        next();
      });
    },
  };
}

// In local dev the /api functions (Vercel serverless) are not running, so we
// proxy /api to a deployed backend. Override with VITE_API_PROXY in .env.local.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const target =
    env.VITE_API_PROXY || 'https://radio-thomas-charlesandres-projects.vercel.app';

  return {
    plugins: [react(), localLeaderboardPlugin(target)],
    server: {
      proxy: {
        '/api': { target, changeOrigin: true },
      },
    },
  };
});
