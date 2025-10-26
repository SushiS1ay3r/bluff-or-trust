import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import OpenAI from 'openai';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

const PORT = process.env.PORT || 3000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

let openai = null;
if (OPENAI_API_KEY) {
  openai = new OpenAI({ apiKey: OPENAI_API_KEY });
}

// Helper: build a strict system prompt with desired JSON schema
const systemPrompt = `You are a concise strategist for a simple 0-3 card game aiming to avoid exceeding total 9. 
Return STRICT JSON only (no prose) following the schema for the given context.
Contexts and output schemas:
- choosePlay: {"action":"choosePlay","recommend":{"mode":"up|down","claim":0|1|2|3}}
- decideOnBluff: {"action":"decideOnBluff","trustCall":"t|b"}
- resolve: {"action":"resolve","resolution":"k|l|s"}
Rules:
- If mode is "down", include a claimed value between 0 and 3.
- If zero special applies in resolve, you may return "s" to steal.
- Do NOT include any commentary. Output JSON ONLY.`;

// Fallback simple policy if model unavailable or invalid response
function fallbackStrategy(context, summary) {
  if (context === 'choosePlay') {
    // Default: prefer face-up; bluff only if risky
    const risky = summary?.ai?.riskyCount ?? 0;
    const mode = risky > 0 ? 'down' : 'up';
    const claim = Math.max(0, Math.min(3, (summary?.safeClaim ?? 1)));
    return { action: 'choosePlay', recommend: { mode, claim } };
  }
  if (context === 'decideOnBluff') {
    const expect = (summary?.total ?? 0) + (summary?.opponentClaim ?? 0);
    const call = expect / 9 - 0.4 > 0.0 ? 'b' : 't';
    return { action: 'decideOnBluff', trustCall: call };
  }
  // resolve
  const x = (summary?.total ?? 0) + (summary?.actual ?? 0);
  if (summary?.zeroSpecial) return { action: 'resolve', resolution: 's' };
  if (x > 9) return { action: 'resolve', resolution: summary?.actor === 'Human' ? 'k' : 'l' };
  const margin = 9 - x;
  if (summary?.actor === 'AI') return { action: 'resolve', resolution: margin <= 1 ? 'k' : (margin >= 4 ? 'l' : 'k') };
  return { action: 'resolve', resolution: margin <= 1 ? 'l' : (margin >= 4 ? 'k' : 'l') };
}

app.post('/api/strategy', async (req, res) => {
  const { context, summary } = req.body || {};
  if (!context || !summary) {
    return res.status(400).json({ error: 'Missing context or summary' });
  }
  // If no API key, return fallback
  if (!openai) {
    console.log(`[strategist] Fallback used (no API key). context=${context}`);
    const fb = fallbackStrategy(context, summary);
    return res.json({ ...fb, meta: { source: 'fallback' } });
  }
  try {
    const userPrompt = JSON.stringify({ context, summary });
    console.log(`[strategist] Calling OpenAI model=${process.env.OPENAI_MODEL || 'gpt-4o-mini'} context=${context}`);
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      temperature: 0.2,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    });
    const raw = completion.choices?.[0]?.message?.content?.trim() || '';
    // Try parse JSON
    let parsed = null;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      // Attempt to extract JSON block
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) {
        parsed = JSON.parse(m[0]);
      }
    }
    if (!parsed || !parsed.action) {
      console.warn('[strategist] Invalid model response, using fallback.');
      const fb = fallbackStrategy(context, summary);
      return res.json({ ...fb, meta: { source: 'fallback' } });
    }
    console.log(`[strategist] Model response ok. action=${parsed.action}`);
    return res.json({ ...parsed, meta: { source: 'model' } });
  } catch (err) {
    console.error('LLM strategist error:', err.message);
    console.log(`[strategist] Error from model, using fallback. context=${context}`);
    const fb = fallbackStrategy(context, summary);
    return res.json({ ...fb, meta: { source: 'fallback' } });
  }
});

// Health endpoint to verify server config quickly
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    openaiAvailable: !!openai,
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    hasKey: !!process.env.OPENAI_API_KEY,
    port: PORT
  });
});

app.listen(PORT, () => {
  console.log(`Strategist server listening on http://localhost:${PORT}`);
});
