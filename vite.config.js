import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const CACHE_FILE = path.join(process.cwd(), 'node_modules', '.cache', 'quiz-cotten-leaderboard-v2.json');
const CONTRIB_CACHE_FILE = path.join(process.cwd(), 'node_modules', '.cache', 'quiz-cotten-contributors-v4.json');

function readJsonCache(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) || {};
  } catch {
    return {};
  }
}

function writeJsonCache(file, map) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(map, null, 2), 'utf8');
  } catch {
    // Ignore fs errors
  }
}

function localLeaderboardPlugin(target) {
  return {
    name: 'local-leaderboard-api',
    configureServer(server) {
      server.middlewares.use('/api/leaderboard', async (req, res, next) => {
        const isContribUrl = (req.url || '').includes('type=contributors');
        const cacheFile = isContribUrl ? CONTRIB_CACHE_FILE : CACHE_FILE;

        if (req.method === 'GET') {
          const map = readJsonCache(cacheFile);

          // Also merge from deployed backend if available
          try {
            const remoteUrl = isContribUrl
              ? `${target}/api/leaderboard?type=contributors`
              : `${target}/api/leaderboard`;
            const remote = await fetch(remoteUrl);
            if (remote.ok) {
              const data = await remote.json();
              const validType = isContribUrl
                ? data?.type === 'contributors_v4'
                : data?.type !== 'contributors_v4' && data?.type !== 'contributors_v3' && data?.type !== 'contributors';
              if (validType && Array.isArray(data?.entries)) {
                for (const e of data.entries) {
                  if (!e?.name) continue;
                  if (isContribUrl && e.kind !== 'contributors_v4') {
                    continue;
                  }
                  const k = e.name.trim().toLowerCase();
                  const prev = map[k];
                  if (!prev || (e.points || 0) >= (prev.points || 0)) {
                    const nextReps = isContribUrl ? Math.max(prev?.reports || 0, e.reports || 0) : 0;
                    const nextSubs = isContribUrl ? Math.max(prev?.submissions || 0, e.submissions || 0) : 0;
                    map[k] = {
                      ...prev,
                      ...e,
                      ...(isContribUrl ? { kind: 'contributors_v4' } : {}),
                      points: Math.max(prev?.points || 0, e.points || 0, nextReps + nextSubs * 10),
                      quizzes: isContribUrl ? 0 : Math.max(prev?.quizzes || 0, e.quizzes || 0),
                      reports: nextReps,
                      submissions: nextSubs,
                    };
                  }
                }
                writeJsonCache(cacheFile, map);
              }
            }
          } catch {
            // Ignore remote error in dev
          }

          const entries = Object.values(map)
            .filter((e) => {
              if (!e || !e.name) return false;
              if (isContribUrl) {
                return e.kind === 'contributors_v4' && (e.reports > 0 || e.points > 0);
              }
              return e.points > 0 || e.quizzes > 0;
            })
            .sort((a, b) => (b.points || 0) - (a.points || 0) || (b.quizzes || 0) - (a.quizzes || 0));

          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'no-store');
          res.end(JSON.stringify({ type: isContribUrl ? 'contributors_v4' : 'quiz', entries }));
          return;
        }

        if (req.method === 'POST') {
          let raw = '';
          req.on('data', (chunk) => { raw += chunk; });
          req.on('end', async () => {
            try {
              const body = JSON.parse(raw || '{}');
              const isContrib = isContribUrl || body?.type === 'contributors';
              const targetFile = isContrib ? CONTRIB_CACHE_FILE : CACHE_FILE;
              const name = typeof body.name === 'string' ? body.name.trim().replace(/\s+/g, ' ') : '';
              if (!name) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'Pseudo invalide.' }));
                return;
              }
              const k = name.toLowerCase();
              const map = readJsonCache(targetFile);
              const prev = map[k] || {};
              const nextReps = isContrib ? Math.max(Number(prev.reports) || 0, Number(body.reports) || 0) : 0;
              const nextSubs = isContrib ? Math.max(Number(prev.submissions) || 0, Number(body.submissions) || 0) : 0;
              const pts = Math.max(Number(prev.points) || 0, Number(body.points) || 0, nextReps + nextSubs * 10);
              const entry = {
                ...prev,
                ...body,
                ...(isContrib ? { kind: 'contributors_v4' } : {}),
                name,
                points: pts,
                quizzes: isContrib ? 0 : Math.max(Number(prev.quizzes) || 0, Number(body.quizzes) || 0),
                reports: nextReps,
                submissions: nextSubs,
                updatedAt: new Date().toISOString(),
              };
              map[k] = entry;
              writeJsonCache(targetFile, map);

              // Forward to remote if deployed
              const remoteUrl = isContrib
                ? `${target}/api/leaderboard?type=contributors`
                : `${target}/api/leaderboard`;
              fetch(remoteUrl, {
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
