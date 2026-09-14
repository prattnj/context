import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkPassword, issueCookie, clearCookie, requireAuth, isAuthed } from './auth.js';
import statsRouter from './routes/stats.js';
import conversationsRouter from './routes/conversations.js';
import summaryRouter from './routes/summary.js';
import extrasRouter from './routes/extras.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 3000);
const STATIC_DIR = path.resolve(process.env.STATIC_DIR || path.join(__dirname, '../../frontend/dist'));

app.disable('x-powered-by');
app.use(express.json());
app.use(cookieParser());

// --- auth ---
app.post('/api/login', (req, res) => {
  if (!checkPassword(req.body?.password)) {
    return res.status(401).json({ error: 'incorrect password' });
  }
  issueCookie(res);
  res.json({ ok: true });
});

app.post('/api/logout', (req, res) => {
  clearCookie(res);
  res.json({ ok: true });
});

app.get('/api/session', (req, res) => {
  res.json({ authenticated: isAuthed(req) });
});

// --- protected API ---
app.use('/api', requireAuth, statsRouter, conversationsRouter, summaryRouter, extrasRouter);

// --- static frontend ---
app.use(express.static(STATIC_DIR, { index: 'index.html' }));
app.get(/^\/(?!api\/).*/, (req, res) => {
  res.sendFile(path.join(STATIC_DIR, 'index.html'));
});

// --- error handler ---
app.use((err, req, res, next) => {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.message || 'server error' });
});

app.listen(PORT, () => {
  console.log(`context server listening on :${PORT}`);
});
