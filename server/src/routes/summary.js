import { Router } from 'express';
import { query } from '../db.js';
import { generateContent, GeminiError } from '../gemini.js';

const router = Router();
const MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
const MAX_MESSAGES = 6000;

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

router.get('/summaries/:month', async (req, res, next) => {
  try {
    const { month } = req.params;
    if (!MONTH_RE.test(month)) return res.status(400).json({ error: 'bad month' });
    const rows = await query(
      'SELECT month, model, summary, created_at AS createdAt FROM ai_summaries WHERE month = ?',
      [month]);
    res.json(rows[0] || null);
  } catch (err) { next(err); }
});

router.post('/summaries/:month', async (req, res, next) => {
  try {
    const { month } = req.params;
    if (!MONTH_RE.test(month)) return res.status(400).json({ error: 'bad month' });
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: 'GEMINI_API_KEY is not configured' });
    }

    const force = req.query.force === '1';
    if (!force) {
      const cached = await query('SELECT month, model, summary, created_at AS createdAt FROM ai_summaries WHERE month = ?', [month]);
      if (cached.length) return res.json(cached[0]);
    }

    const messages = await query(
      `SELECT c.display_name AS name, c.is_group AS isGroup,
              m.direction, m.sender_address AS sender, cn.name AS senderName,
              m.body, m.local_date AS date, m.has_media AS hasMedia
       FROM messages m JOIN conversations c ON c.id = m.conversation_id
       LEFT JOIN contact_names cn ON cn.number = m.sender_address
       WHERE m.local_month = ?
       ORDER BY m.date_ms ASC
       LIMIT ?`,
      [month, MAX_MESSAGES]);

    if (!messages.length) {
      return res.status(404).json({ error: 'no messages for that month' });
    }

    const transcript = messages
      .map((m) => {
        const who = m.direction === 'sent'
          ? 'Me'
          : m.isGroup && m.sender
            ? `${m.senderName || m.sender} in ${m.name}`
            : m.name || 'Unknown';
        const body = (m.body || '').replace(/\s+/g, ' ').slice(0, 400);
        const media = m.hasMedia ? ' [attachment]' : '';
        return `${m.date} | ${who}: ${body}${media}`;
      })
      .join('\n');

    const prompt = [
      `Below is a transcript of all my SMS/MMS text messages from ${month}. `,
      'Write a personal journal-style summary of the month: key events, plans, ',
      'trips, milestones, notable conversations, and the people I talked with most. ',
      'Be specific with names and dates where possible. Write in second person ',
      '("you") in a warm but plain tone, 3-6 paragraphs. Do not include a preamble ',
      'or headers, just the summary text.\n\n',
      transcript,
    ].join('');

    let data;
    try {
      data = await generateContent(MODEL, prompt);
    } catch (err) {
      if (err instanceof GeminiError) {
        return res.status(502).json({ error: err.message, detail: err.detail });
      }
      throw err;
    }

    const summary = data?.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || '')
      .join('')
      .trim();
    if (!summary) return res.status(502).json({ error: 'Gemini returned an empty response' });

    await query(
      `INSERT INTO ai_summaries (month, model, summary) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE model = VALUES(model), summary = VALUES(summary),
                               created_at = CURRENT_TIMESTAMP`,
      [month, MODEL, summary]);

    const [row] = await query(
      'SELECT month, model, summary, created_at AS createdAt FROM ai_summaries WHERE month = ?',
      [month]);
    res.json(row);
  } catch (err) { next(err); }
});

export default router;
