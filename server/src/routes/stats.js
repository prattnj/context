import { Router } from 'express';
import { query } from '../db.js';

const router = Router();

function range(req) {
  const start = String(req.query.start || '1970-01-01');
  const end = String(req.query.end || '2100-01-01');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
    throw Object.assign(new Error('start/end must be YYYY-MM-DD'), { status: 400 });
  }
  return [start, end];
}

router.get('/stats', async (req, res, next) => {
  try {
    const [start, end] = range(req);
    const where = 'local_date BETWEEN ? AND ?';
    const p = [start, end];

    const [totals] = await query(
      `SELECT
         SUM(direction = 'sent')     AS sent,
         SUM(direction = 'received') AS received,
         SUM(has_media)              AS withMedia,
         SUM(CASE WHEN direction = 'sent' THEN char_count ELSE 0 END) AS charsSent,
         COUNT(DISTINCT conversation_id) AS conversations,
         COUNT(DISTINCT local_date)      AS activeDays
       FROM messages WHERE ${where}`, p);

    const topContacts = await query(
      `SELECT c.id, c.display_name AS name, c.is_group AS isGroup,
              COUNT(*) AS total,
              SUM(m.direction = 'sent')     AS sent,
              SUM(m.direction = 'received') AS received
       FROM messages m JOIN conversations c ON c.id = m.conversation_id
       WHERE m.${where}
       GROUP BY c.id ORDER BY total DESC LIMIT 10`, p);

    const busiestDays = await query(
      `SELECT local_date AS date, COUNT(*) AS total
       FROM messages WHERE ${where}
       GROUP BY local_date ORDER BY total DESC LIMIT 5`, p);

    const longest = await query(
      `(SELECT m.direction, m.body, m.char_count AS chars, m.date_ms AS dateMs,
               c.display_name AS name
        FROM messages m JOIN conversations c ON c.id = m.conversation_id
        WHERE m.${where} AND m.direction = 'sent' AND m.body IS NOT NULL
        ORDER BY m.char_count DESC LIMIT 1)
       UNION ALL
       (SELECT m.direction, m.body, m.char_count, m.date_ms, c.display_name
        FROM messages m JOIN conversations c ON c.id = m.conversation_id
        WHERE m.${where} AND m.direction = 'received' AND m.body IS NOT NULL
        ORDER BY m.char_count DESC LIMIT 1)`, [...p, ...p]);

    const daily = await query(
      `SELECT local_date AS date,
              SUM(direction = 'sent')     AS sent,
              SUM(direction = 'received') AS received
       FROM messages WHERE ${where}
       GROUP BY local_date ORDER BY local_date`, p);

    const heatmap = await query(
      `SELECT WEEKDAY(local_date) AS weekday, local_hour AS hour, COUNT(*) AS total
       FROM messages WHERE ${where}
       GROUP BY weekday, hour`, p);

    // Longest consecutive-day texting streaks per conversation.
    const streakRows = await query(
      `SELECT DISTINCT m.conversation_id AS cid, c.display_name AS name,
              m.local_date AS date
       FROM messages m JOIN conversations c ON c.id = m.conversation_id
       WHERE m.${where}
       ORDER BY m.conversation_id, m.local_date`, p);
    const streaks = computeStreaks(streakRows).slice(0, 5);

    const [callTotals] = await query(
      `SELECT COUNT(*) AS total,
              SUM(call_type = 1) AS incoming,
              SUM(call_type = 2) AS outgoing,
              SUM(call_type = 3) AS missed,
              SUM(duration_s)    AS totalSeconds
       FROM calls WHERE ${where}`, p);

    const [longestCall] = await query(
      `SELECT contact_name AS name, number, duration_s AS seconds, date_ms AS dateMs
       FROM calls WHERE ${where} AND duration_s > 0
       ORDER BY duration_s DESC LIMIT 1`, p);

    const topCalled = await query(
      `SELECT COALESCE(NULLIF(contact_name, ''), number) AS name,
              COUNT(*) AS total, SUM(duration_s) AS totalSeconds
       FROM calls WHERE ${where}
       GROUP BY name ORDER BY total DESC LIMIT 5`, p);

    res.json({
      totals, topContacts, busiestDays,
      longestSent: longest.find((r) => r.direction === 'sent') || null,
      longestReceived: longest.find((r) => r.direction === 'received') || null,
      daily, heatmap, streaks,
      calls: { totals: callTotals, longest: longestCall || null, topCalled },
    });
  } catch (err) { next(err); }
});

function computeStreaks(rows) {
  const best = new Map(); // cid -> { name, length, start, end }
  let cid = null; let prev = null; let runStart = null; let runLen = 0; let name = '';

  const flush = () => {
    if (cid === null || runLen === 0) return;
    const cur = best.get(cid);
    if (!cur || runLen > cur.length) {
      best.set(cid, { name, length: runLen, start: runStart, end: prev });
    }
  };

  for (const r of rows) {
    const d = r.date instanceof Date
      ? r.date.toISOString().slice(0, 10)
      : String(r.date).slice(0, 10);
    if (r.cid !== cid) { flush(); cid = r.cid; name = r.name; prev = null; runLen = 0; }
    if (prev !== null && dayDiff(prev, d) === 1) {
      runLen += 1;
    } else {
      flush();
      runStart = d; runLen = 1;
    }
    prev = d;
  }
  flush();
  return [...best.values()].sort((a, b) => b.length - a.length);
}

function dayDiff(a, b) {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
}

export default router;
