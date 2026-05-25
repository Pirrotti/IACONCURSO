// API Handler — suporta Anthropic Claude E Google Gemini
// Se a key começa com "AIza" → usa Gemini (grátis)
// Se começa com "sk-ant" → usa Claude (pago)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,x-api-key');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { messages, system, max_tokens } = req.body || {};
  const apiKey = req.headers['x-api-key'] || process.env.ANTHROPIC_API_KEY || process.env.GEMINI_API_KEY;

  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });
  if (!messages) return res.status(400).json({ error: 'messages required' });

  // Detectar provider pela key
  const isGemini = apiKey.startsWith('AIza');

  try {
    if (isGemini) {
      // ── GOOGLE GEMINI (gratuito: 60 req/min, 1500 req/dia) ──
      const model = 'gemini-2.0-flash';
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

      // Converter formato Claude → Gemini
      const geminiContents = messages.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
      }));

      const geminiBody = {
        contents: geminiContents,
        systemInstruction: system ? { parts: [{ text: system }] } : undefined,
        generationConfig: {
          maxOutputTokens: max_tokens || 2000,
          temperature: 0.7,
        }
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geminiBody),
      });

      const data = await response.json();

      if (!response.ok) {
        const errMsg = data?.error?.message || 'Gemini API error';
        return res.status(response.status).json({ error: errMsg });
      }

      // Converter resposta Gemini → formato Claude
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || 'Sem resposta.';
      return res.status(200).json({
        content: [{ type: 'text', text }],
        model,
        usage: { input_tokens: 0, output_tokens: 0 }
      });

    } else {
      // ── ANTHROPIC CLAUDE ──
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-5',
          max_tokens: max_tokens || 2000,
          system: system || '',
          messages,
        }),
      });
      const data = await response.json();
      return res.status(response.status).json(data);
    }

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
