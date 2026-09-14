import { Router } from 'express';
import { query } from '../db.js';

const router = Router();

// Text analysis scans message bodies, so results are cached per range.
// The data only changes on manual imports, so no TTL is needed.
const cache = new Map();
const CACHE_MAX = 24;

const STOPWORDS = new Set(`
a about after again all also am an and any are as at be because been before
being but by can cant could did do does doing dont down for from get got had
has have havent he her here hers him his how i if im in into is isnt it its
ive just like me more most my no nor not now of off on once only or other our
out over own re s so some such t than that thats the their them then there
these they this those through to too under until up very was we were what
when where which while who whom why will with would you your yours youre
gonna wanna yeah yes ok okay oh hey lol u ur idk rn im dont didnt wont
`.trim().split(/\s+/));

function range(req) {
  const start = String(req.query.start || '1970-01-01');
  const end = String(req.query.end || '2100-01-01');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
    throw Object.assign(new Error('start/end must be YYYY-MM-DD'), { status: 400 });
  }
  return [start, end];
}

const EMOJI_RE = /\p{RGI_Emoji}/gv;
const WORD_RE = /[a-z]+(?:'[a-z]+)?/g;

function top(counter, n) {
  return [...counter.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([value, count]) => ({ value, count }));
}

router.get('/stats/extra', async (req, res, next) => {
  try {
    const [start, end] = range(req);
    const key = `${start}|${end}`;
    if (cache.has(key)) return res.json(cache.get(key));

    // --- word + emoji frequency ---
    const bodies = await query(
      `SELECT direction, body FROM messages
       WHERE local_date BETWEEN ? AND ? AND body IS NOT NULL AND body <> ''`,
      [start, end]);

    const words = { sent: new Map(), received: new Map() };
    const emojis = { sent: new Map(), received: new Map() };

    for (const row of bodies) {
      const w = words[row.direction];
      const e = emojis[row.direction];
      for (const match of row.body.toLowerCase().matchAll(WORD_RE)) {
        const word = match[0].replace(/'/g, '');
        if (word.length < 3 || STOPWORDS.has(word)) continue;
        w.set(word, (w.get(word) || 0) + 1);
      }
      for (const match of row.body.matchAll(EMOJI_RE)) {
        e.set(match[0], (e.get(match[0]) || 0) + 1);
      }
    }

    // --- response times (1:1 conversations only) ---
    const timeline = await query(
      `SELECT m.conversation_id AS cid, c.display_name AS name,
              m.direction, m.date_ms AS dateMs
       FROM messages m JOIN conversations c ON c.id = m.conversation_id
       WHERE m.local_date BETWEEN ? AND ? AND c.is_group = 0
       ORDER BY m.conversation_id, m.date_ms`,
      [start, end]);
    const responseTimes = computeResponseTimes(timeline);

    const result = {
      words: { sent: top(words.sent, 20), received: top(words.received, 20) },
      emojis: { sent: top(emojis.sent, 15), received: top(emojis.received, 15) },
      responseTimes,
    };

    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
    cache.set(key, result);
    res.json(result);
  } catch (err) { next(err); }
});

// A reply is a direction change within the same conversation, within 24h.
const MAX_GAP_MS = 24 * 60 * 60 * 1000;
const MIN_REPLIES = 10;

function computeResponseTimes(rows) {
  const mine = [];
  const theirs = [];
  const perContact = new Map(); // cid -> { name, deltas: [] } (their replies to me)

  let prev = null;
  for (const row of rows) {
    if (prev && prev.cid === row.cid && prev.direction !== row.direction) {
      const delta = row.dateMs - prev.dateMs;
      if (delta > 0 && delta <= MAX_GAP_MS) {
        if (row.direction === 'sent') {
          mine.push(delta);
        } else {
          theirs.push(delta);
          const entry = perContact.get(row.cid) || { name: row.name, deltas: [] };
          entry.deltas.push(delta);
          perContact.set(row.cid, entry);
        }
      }
    }
    prev = row;
  }

  const fastestRepliers = [...perContact.values()]
    .filter((c) => c.deltas.length >= MIN_REPLIES)
    .map((c) => ({
      name: c.name || 'Unknown',
      medianSeconds: median(c.deltas) / 1000,
      replies: c.deltas.length,
    }))
    .sort((a, b) => a.medianSeconds - b.medianSeconds)
    .slice(0, 5);

  return {
    mine: summarize(mine),
    theirs: summarize(theirs),
    fastestRepliers,
  };
}

function summarize(deltas) {
  if (!deltas.length) return null;
  const avg = deltas.reduce((a, b) => a + b, 0) / deltas.length;
  return {
    count: deltas.length,
    avgSeconds: avg / 1000,
    medianSeconds: median(deltas) / 1000,
  };
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export default router;
