// Shared AI question generator helper (used by api/admin-questions.js and local Vite dev middleware).
// Leading "_" so Vercel does not expose it as a separate serverless endpoint.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { validateChapter, validateQuestion } from './_validate.js';

const CHAPTER_TITLES = {
  ch1: 'Pathologies de la coiffe des rotateurs',
  ch2: 'Instabilité glénohumérale',
  ch3: 'Pathologie nerveuse de la ceinture scapulaire',
  ch4: 'Autres pathologies scapulaires',
  ch5: 'Coude : Pathologies du compartiment latéral',
  ch6: 'Coude : Pathologies du compartiment médial',
  ch7: 'Coude : Pathologies du compartiment antérieur',
  ch8: 'Coude : Pathologies du compartiment postérieur',
  ch9: 'Autres affections du coude',
  ch10: 'Pathologies dégénératives du poignet',
  ch11: 'Pathologies ligamentaires du poignet',
  ch12: 'Pathologies tendineuses du poignet',
  ch13: 'Pathologies vasculonerveuses du poignet et de la main',
  ch14: 'Pathologies dégénératives et tendineuses de la main et des doigts',
  ch15: 'Discopathies dégénératives cervicales',
  ch16: 'Affections mécaniques du rachis dorsolombaire',
  ch17: 'Autres affections rachidiennes',
  ch18: 'Pathologies osseuses de la hanche',
  ch19: 'Pathologies articulaires de la hanche',
  ch20: 'Pathologies abarticulaires de la hanche',
  ch21: 'Pathologies du plexus lombosacré',
  ch22: 'Autres pathologies de la ceinture pelvienne',
  ch23: 'Genou : Pathologies antérieures',
  ch24: 'Pathologies des ménisques',
  ch25: 'Pathologies des ligaments croisés',
  ch26: 'Genou : Pathologies des tissus mous collatéraux et postérieurs',
  ch27: 'Autres pathologies du genou',
  ch28: 'Pathologies de la jambe',
  ch29: 'Cheville et pied : Pathologies des tissus mous',
  ch30: 'Autres pathologies de la cheville et du pied',
  ch31: 'Dysostoses crâniennes',
  ch32: 'Dysostoses rachidiennes',
  ch33: 'Dysostoses de la paroi thoracique',
  ch34: 'Dysostoses de la ceinture scapulaire et du membre supérieur',
  ch35: 'Dysostoses du membre inférieur',
  ch36: 'Déformations du pied du nourrisson',
};

let cachedApiKey = null;
let cachedAdminPw = null;

function decryptToken(token) {
  try {
    const parts = String(token || '').trim().split('.');
    if (parts.length !== 3) return null;
    const [ivB64, tagB64, encB64] = parts;
    const secret = crypto.scryptSync('cocochin', 'quiz-cotten-ai-salt', 32);
    const decipher = crypto.createDecipheriv('aes-256-gcm', secret, Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    const dec = Buffer.concat([decipher.update(Buffer.from(encB64, 'base64')), decipher.final()]);
    return dec.toString('utf8').trim();
  } catch {
    return null;
  }
}

export async function resolveAdminPasswordForReviewer(env = process.env) {
  if (cachedAdminPw) return cachedAdminPw;
  const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } = env;
  if (SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY) {
    try {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/quiz_questions?id=eq.cfg-ai-key&select=data&limit=1`,
        {
          headers: {
            apikey: SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
          },
        }
      );
      if (r.ok) {
        const rows = await r.json();
        const pw = decryptToken(rows?.[0]?.data?.explication);
        if (pw) {
          cachedAdminPw = pw;
          return pw;
        }
      }
    } catch {
      // Ignore fetch error
    }
  }
  return null;
}

export async function resolveGeminiApiKey(env = process.env) {
  if (env.GEMINI_API_KEY && env.GEMINI_API_KEY.trim()) {
    return env.GEMINI_API_KEY.trim();
  }
  if (cachedApiKey) return cachedApiKey;

  const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } = env;
  if (SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY) {
    try {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/quiz_questions?id=eq.cfg-ai-key&select=data&limit=1`,
        {
          headers: {
            apikey: SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
          },
        }
      );
      if (r.ok) {
        const rows = await r.json();
        const token = rows?.[0]?.data?.enonce;
        const key = decryptToken(token);
        if (key) {
          cachedApiKey = key;
          return key;
        }
      }
    } catch {
      // Ignore fetch error
    }
  }
  return null;
}

function loadBookChapter(chapter) {
  const candidates = [
    path.join(process.cwd(), 'public', 'book', `${chapter}.json`),
    path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'public', 'book', `${chapter}.json`),
  ];
  for (const file of candidates) {
    try {
      if (fs.existsSync(file)) {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
      }
    } catch {
      // Try next candidate
    }
  }
  return null;
}

// Selects a focused excerpt (~25k chars, ~6–10 pages) from the chapter so generation is fast (<4s),
// explores the whole chapter across calls, and prioritizes topicHint if provided.
function selectBookPages(pages, topicHint = '') {
  if (!Array.isArray(pages) || pages.length <= 8) return pages || [];
  const hint = String(topicHint || '').trim().toLowerCase();
  if (hint.length >= 2) {
    const words = hint.split(/\s+/).filter((w) => w.length >= 2);
    const scored = pages.map((p, idx) => {
      const low = (p.t || '').toLowerCase();
      let score = 0;
      if (low.includes(hint)) score += 10;
      for (const w of words) {
        if (low.includes(w)) score += 2;
      }
      return { p, idx, score };
    });
    const matched = scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score);
    if (matched.length > 0) {
      const chosenIndices = new Set();
      for (const m of matched.slice(0, 5)) {
        chosenIndices.add(m.idx);
        if (m.idx + 1 < pages.length && chosenIndices.size < 8) chosenIndices.add(m.idx + 1);
      }
      return [...chosenIndices].sort((a, b) => a - b).map((i) => pages[i]);
    }
  }

  // Pick a random contiguous window of ~7 pages so every click explores a fresh section of the chapter
  const windowSize = Math.min(pages.length, 7);
  const maxStart = Math.max(0, pages.length - windowSize);
  const start = Math.floor(Math.random() * (maxStart + 1));
  return pages.slice(start, start + windowSize);
}

export async function generateQuestionFromBook({
  chapter,
  questionType = 'AUTO',
  difficulty = 2,
  topicHint = '',
  existingQuestions = [],
  env = process.env,
}) {
  if (!validateChapter(chapter) || chapter === 'ch99') {
    throw new Error('Chapitre invalide.');
  }

  const book = loadBookChapter(chapter);
  if (!book || !Array.isArray(book.pages) || book.pages.length === 0) {
    throw new Error(`Le contenu du livre pour le chapitre ${chapter} est introuvable.`);
  }

  const apiKey = await resolveGeminiApiKey(env);
  if (!apiKey) {
    throw new Error('Clé API Gemini manquante sur le serveur.');
  }

  const chapterNum = Number.parseInt(chapter.replace('ch', ''), 10) || 1;
  const chapterTitle = CHAPTER_TITLES[chapter] || `Chapitre ${chapterNum}`;
  const diffLevel = [1, 2, 3].includes(Number(difficulty)) ? Number(difficulty) : 2;
  const diffDesc =
    diffLevel === 1
      ? 'Niveau 1 (Facile) : connaissance fondamentale, anatomie essentielle ou signe radiologique classique.'
      : diffLevel === 3
      ? 'Niveau 3 (Difficile) : détail sémiologique pointu, diagnostic différentiel fin, classification précise ou variante anatomique.'
      : 'Niveau 2 (Moyen) : sémiologie radiologique/échographique/IRM typique, corrélation anatomo-clinique.';

  const wantedType =
    questionType === 'QCU'
      ? 'Impérativement un QCU (4 propositions A, B, C, D avec EXACTEMENT 1 seule proposition correcte).'
      : questionType === 'QRM'
      ? 'Impérativement un QRM (4 ou 5 propositions A, B, C, D[, E] avec 2 ou 3 propositions correctes).'
      : 'Au choix : QCU (4 propositions, 1 seule vraie) ou QRM (4 à 5 propositions, 2 ou 3 vraies).';

  const existingList = Array.isArray(existingQuestions)
    ? existingQuestions
        .slice(0, 80)
        .map((q, i) => `${i + 1}. [${q.theme || 'Sans sous-thème'}] ${q.enonce || ''}`)
        .join('\n')
    : '';

  const selectedPages = selectBookPages(book.pages, topicHint);
  const bookExcerpt = selectedPages
    .map((p) => `=== [Page ${p.p}] ===\n${p.t}`)
    .join('\n\n');

  const prompt = `Tu es un professeur de radiologie ostéo-articulaire rédigeant des questions de quiz de haut niveau pédagogique à partir de l’ouvrage « Imagerie musculosquelettique – Pathologies locorégionales (2e édition, A. Cotten, Elsevier Masson) ».

CHAPITRE CIBLÉ : Chapitre ${chapterNum} — ${chapterTitle}

CONSIGNES STRICTES :
1. FIDÉLITÉ ABSOLUE AU TEXTE DU LIVRE :
   - La question, toutes les propositions (vraies comme fausses/distracteurs) et l’explication doivent reposer EXCLUSIVEMENT sur l’extrait du chapitre fourni ci-dessous.
   - N’invente aucune donnée chiffrée ou signe qui ne figure pas dans ce texte.
   - Indique dans "source.page" le numéro exact de la page du livre (ex: ${selectedPages[0]?.p || 1}) où se trouve l’information principale.

2. NE PAS SE RÉPÉTER :
${
  existingList
    ? `Voici les questions DÉJÀ présentes dans ce chapitre :\n${existingList}\n\n-> Choisis OBLIGATOIREMENT une notion, une pathologie, une structure anatomique, un signe d’imagerie ou un tableau/encadré qui N’EST PAS encore traité par les questions ci-dessus.`
    : '-> Choisis une notion importante et représentative du texte ci-dessous.'
}
${topicHint ? `\nCONSIGNE / SOUS-THÈME DEMANDÉ PAR LE FORMATEUR : « ${topicHint.trim()} » (priorise absolument ce sujet).` : ''}

3. FORMAT ET RÉDACTION :
   - Type demandé : ${wantedType}
   - Difficulté demandée : ${diffDesc}
   - Français médical irréprochable, utilise l’apostrophe typographique (’) et les accents corrects.
   - INTERDICTION ABSOLUE de faire référence aux lettres des propositions (« La réponse A », « Les propositions A et B », « Toutes les réponses ci-dessus ») ni dans les items ni dans l’explication, car l’ordre des propositions est mélangé aléatoirement pour chaque étudiant !
   - Dans "explication", justifie clairement et de façon pédagogique pourquoi la ou les bonnes propositions sont vraies et pourquoi chaque distracteur est faux, en nommant directement les structures ou pathologies.

4. FORMAT DE SORTIE JSON STRICT (aucun texte hors du JSON) :
{
  "type": "QCU" ou "QRM",
  "difficulty": ${diffLevel},
  "theme": "Catégorie : sous-thème précis (max 70 caractères)",
  "enonce": "Énoncé clair et précis de la question ?",
  "items": [
    { "id": "A", "texte": "Proposition A...", "correct": true },
    { "id": "B", "texte": "Proposition B...", "correct": false },
    { "id": "C", "texte": "Proposition C...", "correct": false },
    { "id": "D", "texte": "Proposition D...", "correct": false }
  ],
  "explication": "Explication détaillée, sourcée au mot près à partir du chapitre, sans jamais citer les lettres A, B, C, D...",
  "source": {
    "page": ${selectedPages[0]?.p || 1},
    "element": "Texte (ou Tableau X.Y / Encadré / Figure X.Y)",
    "refs": "[références bibliographiques éventuelles entre crochets ou chaîne vide]"
  }
}

EXTRAIT DU CHAPITRE ${chapterNum} (${chapterTitle}) :
${bookExcerpt}`;

  const models = [
    'gemini-3.8-flash',
    'gemini-3.7-flash',
    'gemini-3.6-flash',
    'gemini-3.5-flash',
    'gemini-3.1-flash-lite',
    'gemini-3.5-flash-lite',
    'gemini-3-flash-preview',
  ];
  let lastError = 'Impossible de joindre le modèle Gemini.';
  let rawJsonText = null;

  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.65,
            responseMimeType: 'application/json',
          },
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        lastError = data?.error?.message || `Erreur Gemini (${r.status})`;
        continue;
      }
      const parts = data?.candidates?.[0]?.content?.parts || [];
      const textPart =
        parts.find((p) => typeof p.text === 'string' && !p.thought) ||
        parts.find((p) => typeof p.text === 'string');
      if (textPart?.text) {
        rawJsonText = textPart.text;
        break;
      }
    } catch (e) {
      lastError = e.message || lastError;
    }
  }

  if (!rawJsonText) {
    throw new Error(`Échec de la génération IA : ${lastError}`);
  }

  let parsed;
  try {
    const cleaned = rawJsonText
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error('La réponse de l’IA n’était pas dans un format JSON valide. Réessayez.');
  }

  const typo = (s) => String(s || '').replace(/'/g, '’').trim();
  const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
  const rawItems = Array.isArray(parsed.items) ? parsed.items.slice(0, 6) : [];
  const normalizedItems = rawItems.map((it, idx) => ({
    id: letters[idx],
    texte: typo(it?.texte).slice(0, 400),
    correct: Boolean(it?.correct),
  }));

  let qType = parsed.type === 'QRM' ? 'QRM' : 'QCU';
  if (questionType === 'QCU') qType = 'QCU';
  if (questionType === 'QRM') qType = 'QRM';

  const correctCount = normalizedItems.filter((i) => i.correct).length;
  if (qType === 'QCU' && correctCount !== 1 && normalizedItems.length > 0) {
    const firstTrue = normalizedItems.findIndex((i) => i.correct);
    const keepIdx = firstTrue >= 0 ? firstTrue : 0;
    normalizedItems.forEach((it, idx) => {
      it.correct = idx === keepIdx;
    });
  } else if (qType === 'QRM' && correctCount === 0 && normalizedItems.length > 0) {
    normalizedItems[0].correct = true;
  }

  const defaultPage = selectedPages[0]?.p || book.pages[0]?.p || 1;
  const rawPage = Number.parseInt(parsed?.source?.page, 10);
  const candidate = {
    type: qType,
    difficulty: diffLevel,
    theme: typo(parsed.theme || chapterTitle).slice(0, 80),
    enonce: typo(parsed.enonce).slice(0, 1500),
    enonce_image: null,
    items: normalizedItems,
    explication: typo(parsed.explication).slice(0, 6000),
    correction_figures: [],
    source: {
      page: Number.isInteger(rawPage) && rawPage >= 1 && rawPage <= 9999 ? rawPage : defaultPage,
      element: typo(parsed?.source?.element || 'Texte').slice(0, 80) || 'Texte',
      refs: String(parsed?.source?.refs || '').trim().slice(0, 200),
    },
    reviewed: false,
  };

  const { data: validated, error } = validateQuestion(candidate);
  if (error) {
    throw new Error(`Question générée invalide : ${error}`);
  }

  return validated;
}
