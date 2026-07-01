/**
 * POST /api/suggest-image-label
 * Vision label for compare/poll option images (e.g. "Lionel Messi").
 * Requires GEMINI_API_KEY in Vercel env (server-side only).
 */

const PROMPT =
  "You label one side of a social comparison poll image. " +
  "Identify the main subject. If it is a recognizable person, use their common English name " +
  '(for example "Lionel Messi", not "football player"). ' +
  "Otherwise use 1-2 everyday words (e.g. Red Shoes, Pizza). " +
  "Reply with ONLY the label, maximum 2 words, no punctuation or quotes.";

function normalizeLabel(raw) {
  if (!raw || typeof raw !== "string") return null;
  const cleaned = raw
    .trim()
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/[.!?:;]+$/g, "");
  const words = cleaned.split(/\s+/).filter(Boolean).slice(0, 2);
  const label = words.join(" ").trim();
  if (!label || label.length > 40) return label ? label.slice(0, 40) : null;
  return label;
}

async function fetchImageAsBase64(imageUrl) {
  const res = await fetch(imageUrl);
  if (!res.ok) throw new Error(`image fetch failed: ${res.status}`);
  const mimeType = res.headers.get("content-type")?.split(";")[0]?.trim() || "image/jpeg";
  const base64 = Buffer.from(await res.arrayBuffer()).toString("base64");
  return { base64, mimeType };
}

async function callGemini(apiKey, base64, mimeType) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: PROMPT },
              { inline_data: { mime_type: mimeType, data: base64 } },
            ],
          },
        ],
        generationConfig: { maxOutputTokens: 24, temperature: 0.2 },
      }),
    },
  );
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Gemini error ${res.status}: ${errText.slice(0, 200)}`);
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  return normalizeLabel(text);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: "Vision labeling is not configured", label: null });
    return;
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body ?? {};
    let { imageBase64, mimeType = "image/jpeg", imageUrl } = body;

    if (!imageBase64 && imageUrl) {
      const fetched = await fetchImageAsBase64(imageUrl);
      imageBase64 = fetched.base64;
      mimeType = fetched.mimeType;
    }

    if (!imageBase64 || typeof imageBase64 !== "string") {
      res.status(400).json({ error: "imageBase64 or imageUrl is required", label: null });
      return;
    }

    if (imageBase64.length > 6_000_000) {
      res.status(413).json({ error: "Image too large", label: null });
      return;
    }

    const label = await callGemini(apiKey, imageBase64, mimeType);
    res.status(200).json({ label });
  } catch (err) {
    console.error("[suggest-image-label]", err);
    res.status(500).json({ error: "Could not suggest label", label: null });
  }
}
