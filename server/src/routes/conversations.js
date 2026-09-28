import { Router } from 'express';
import path from 'node:path';
import { query } from '../db.js';

const router = Router();
const MEDIA_DIR = path.resolve(process.env.MEDIA_DIR || './data/media');

function range(req) {
  const start = String(req.query.start || '1970-01-01');
  const end = String(req.query.end || '2100-01-01');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
    throw Object.assign(new Error('start/end must be YYYY-MM-DD'), { status: 400 });
  }
  return [start, end];
}

function parseNames(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Resolve group-message sender numbers to contact names.
async function senderNames(numbers) {
  if (!numbers.length) return {};
  const map = {};
  const hints = await query(
    'SELECT number, name FROM contact_names WHERE number IN (?)', [numbers]);
  for (const row of hints) map[row.number] = row.name;
  const oneToOne = await query(
    `SELECT address_key AS number, display_name AS name FROM conversations
     WHERE is_group = 0 AND display_name <> '' AND address_key IN (?)`, [numbers]);
  for (const row of oneToOne) map[row.number] = row.name;
  return map;
}

// Conversations active in the given range, most active first.
router.get('/conversations', async (req, res, next) => {
  try {
    const [start, end] = range(req);
    const rows = await query(
      `SELECT c.id, c.display_name AS name, c.address_key AS addressKey,
              c.is_group AS isGroup, c.participant_names AS participantNames,
              COUNT(*) AS total,
              SUM(m.direction = 'sent')     AS sent,
              SUM(m.direction = 'received') AS received,
              MAX(m.date_ms) AS lastMessageMs
       FROM messages m JOIN conversations c ON c.id = m.conversation_id
       WHERE m.local_date BETWEEN ? AND ?
       GROUP BY c.id
       ORDER BY total DESC`,
      [start, end]);
    res.json(rows.map(({ participantNames, ...row }) => ({
      ...row,
      participants: parseNames(participantNames),
    })));
  } catch (err) { next(err); }
});

// Thread view. Paged oldest-first within the range.
router.get('/conversations/:id/messages', async (req, res, next) => {
  try {
    const [start, end] = range(req);
    const id = Number(req.params.id);
    const limit = Math.min(Number(req.query.limit) || 200, 500);
    const offset = Math.max(Number(req.query.offset) || 0, 0);

    const messages = await query(
      `SELECT id, kind, direction, sender_address AS senderAddress,
              body, date_ms AS dateMs, has_media AS hasMedia
       FROM messages
       WHERE conversation_id = ? AND local_date BETWEEN ? AND ?
       ORDER BY date_ms ASC
       LIMIT ? OFFSET ?`,
      [id, start, end, limit, offset]);

    const ids = messages.filter((m) => m.hasMedia).map((m) => m.id);
    let mediaByMessage = {};
    if (ids.length) {
      const media = await query(
        `SELECT id, message_id AS messageId, content_type AS contentType, byte_size AS byteSize
         FROM media WHERE message_id IN (?) ORDER BY message_id, seq`, [ids]);
      for (const m of media) {
        (mediaByMessage[m.messageId] ||= []).push(m);
      }
    }

    const [{ total }] = await query(
      `SELECT COUNT(*) AS total FROM messages
       WHERE conversation_id = ? AND local_date BETWEEN ? AND ?`,
      [id, start, end]);

    const names = await senderNames([
      ...new Set(messages.map((m) => m.senderAddress).filter(Boolean)),
    ]);

    res.json({
      total,
      offset,
      messages: messages.map((m) => ({
        ...m,
        senderName: m.senderAddress ? names[m.senderAddress] || null : null,
        media: mediaByMessage[m.id] || [],
      })),
    });
  } catch (err) { next(err); }
});

// Serve an attachment from the media directory.
router.get('/media/:id', async (req, res, next) => {
  try {
    const rows = await query(
      'SELECT file_path AS filePath, content_type AS contentType FROM media WHERE id = ?',
      [Number(req.params.id)]);
    if (!rows.length) return res.status(404).json({ error: 'not found' });
    const filePath = path.resolve(MEDIA_DIR, rows[0].filePath);
    if (!filePath.startsWith(MEDIA_DIR)) return res.status(400).json({ error: 'bad path' });
    res.type(rows[0].contentType);
    res.set('Cache-Control', 'private, max-age=31536000, immutable');
    res.sendFile(filePath, (err) => { if (err && !res.headersSent) next(err); });
  } catch (err) { next(err); }
});

export default router;
