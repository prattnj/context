const MAX_ATTEMPTS = 5;
const BASE_DELAY_MS = 1000;
const MAX_TOTAL_MS = 30_000;

export class GeminiError extends Error {
  constructor(status, detail) {
    super(`Gemini API error (${status})`);
    this.status = status;
    this.detail = detail;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Gemini frequently returns a transient 503; retry with exponential backoff so
// callers see a single successful call.
export async function generateContent(model, prompt, { temperature = 0.7 } = {}) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature },
  });

  const startedAt = Date.now();
  let attempt = 0;

  for (;;) {
    attempt += 1;
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': process.env.GEMINI_API_KEY,
      },
      body,
    });

    if (resp.ok) {
      if (attempt > 1) {
        console.warn(`[gemini] succeeded on attempt ${attempt} after ${Date.now() - startedAt}ms`);
      }
      return resp.json();
    }

    const detail = (await resp.text()).slice(0, 500);
    const elapsed = Date.now() - startedAt;
    const delay = BASE_DELAY_MS * 2 ** (attempt - 1) + Math.floor(Math.random() * 250);
    const canRetry =
      resp.status === 503 && attempt < MAX_ATTEMPTS && elapsed + delay < MAX_TOTAL_MS;

    if (!canRetry) {
      if (resp.status === 503) {
        console.warn(`[gemini] giving up after ${attempt} attempt(s), ${elapsed}ms`);
      }
      throw new GeminiError(resp.status, detail);
    }

    console.warn(`[gemini] 503 on attempt ${attempt}, retrying in ${delay}ms`);
    await sleep(delay);
  }
}
