import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';

const API_BASE = process.env.EXPO_PUBLIC_WEB_ORIGIN ?? 'https://kejitbe.app';
const GEMINI_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? '';

function normalizeLabel(raw: string | null | undefined): string | null {
	if (!raw?.trim()) return null;
	const cleaned = raw
		.trim()
		.replace(/^["'`]+|["'`]+$/g, '')
		.replace(/[.!?:;]+$/g, '');
	const words = cleaned.split(/\s+/).filter(Boolean).slice(0, 2);
	const label = words.join(' ').trim();
	if (!label) return null;
	return label.slice(0, 40);
}

async function uriToVisionPayload(
	uri: string,
): Promise<{ base64: string; mimeType: string } | null> {
	try {
		let localUri = uri;
		if (uri.startsWith('http')) {
			const ext = uri.split('?')[0].split('.').pop()?.toLowerCase() || 'jpg';
			const dest = `${FileSystem.cacheDirectory}vision_${Date.now()}.${ext}`;
			const dl = await FileSystem.downloadAsync(uri, dest);
			localUri = dl.uri;
		}
		const result = await ImageManipulator.manipulateAsync(
			localUri,
			[{ resize: { width: 512 } }],
			{
				compress: 0.82,
				format: ImageManipulator.SaveFormat.JPEG,
				base64: true,
			},
		);
		if (!result.base64) return null;
		return { base64: result.base64, mimeType: 'image/jpeg' };
	} catch {
		return null;
	}
}

async function suggestViaApi(
	base64: string,
	mimeType: string,
): Promise<string | null> {
	try {
		const res = await fetch(`${API_BASE}/api/suggest-image-label`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ imageBase64: base64, mimeType }),
		});
		if (!res.ok) return null;
		const data = (await res.json()) as { label?: string | null };
		return normalizeLabel(data.label);
	} catch {
		return null;
	}
}

/** Dev-only fallback when the Vercel function is not deployed yet. */
async function suggestViaGeminiDirect(
	base64: string,
	mimeType: string,
): Promise<string | null> {
	if (!GEMINI_KEY) return null;
	const prompt =
		'You label one side of a social comparison poll image. Identify the main subject. ' +
		'If it is a recognizable person, use their common English name (e.g. Lionel Messi). ' +
		'Otherwise use 1-2 everyday words. Reply with ONLY the label, max 2 words.';
	try {
		const res = await fetch(
			`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					contents: [
						{
							parts: [
								{ text: prompt },
								{ inline_data: { mime_type: mimeType, data: base64 } },
							],
						},
					],
					generationConfig: { maxOutputTokens: 24, temperature: 0.2 },
				}),
			},
		);
		if (!res.ok) return null;
		const data = await res.json();
		const text = data?.candidates?.[0]?.content?.parts?.[0]?.text as
			| string
			| undefined;
		return normalizeLabel(text);
	} catch {
		return null;
	}
}

/** Guess a short label (1–2 words) from image pixels via vision AI. */
export async function suggestImageLabelFromUri(
	uri: string,
): Promise<string | null> {
	const payload = await uriToVisionPayload(uri);
	if (!payload) return null;
	const fromApi = await suggestViaApi(payload.base64, payload.mimeType);
	if (fromApi) return fromApi;
	return suggestViaGeminiDirect(payload.base64, payload.mimeType);
}
