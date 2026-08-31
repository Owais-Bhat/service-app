// Compares a mobile clock-in selfie against an employee's stored reference
// selfie using an NVIDIA-hosted vision-language model — mobile has no
// on-device face-recognition model (unlike web's face-api.js descriptor
// matching), so this is the mobile-only stand-in. No DB/Express dependency
// beyond the fetch call itself, mirrors server/face-match.cjs's shape.

const NVIDIA_API_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';
const NVIDIA_MODEL = 'moonshotai/kimi-k3';
const REQUEST_TIMEOUT_MS = 20000;

const PROMPT = [
    "Image 1 is an employee's registered reference photo for a workplace attendance system.",
    'Image 2 is a selfie just taken at clock-in.',
    'Are Image 1 and Image 2 the same person?',
    'Reply with exactly one word first — MATCH, NO_MATCH, or UNCLEAR (use UNCLEAR only if a face is not clearly visible in either image) — then, on a new line, a brief one-sentence reason.',
].join(' ');

function toDataUri(buffer, mime) {
    return `data:${mime || 'image/jpeg'};base64,${buffer.toString('base64')}`;
}

// Returns { verdict: 'match' | 'no_match' | 'unclear', reason }.
// Throws on a hard failure (missing key, network error, non-2xx response) —
// callers should treat a throw the same as 'no_match' (fail closed).
async function verifySamePerson(referenceBuffer, referenceMime, selfieBuffer, selfieMime) {
    const apiKey = process.env.NVIDIA_API_KEY;
    if (!apiKey) throw new Error('NVIDIA_API_KEY is not configured');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
        const res = await fetch(NVIDIA_API_URL, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
            body: JSON.stringify({
                model: NVIDIA_MODEL,
                max_tokens: 60,
                seed: 0,
                stream: false,
                temperature: 0,
                messages: [
                    {
                        role: 'user',
                        content: [
                            { type: 'text', text: PROMPT },
                            { type: 'image_url', image_url: { url: toDataUri(referenceBuffer, referenceMime) } },
                            { type: 'image_url', image_url: { url: toDataUri(selfieBuffer, selfieMime) } },
                        ],
                    },
                ],
            }),
            signal: controller.signal,
        });
        if (!res.ok) {
            const text = await res.text().catch(() => '');
            throw new Error(`NVIDIA vision API returned ${res.status}: ${text.slice(0, 200)}`);
        }
        const data = await res.json();
        const reply = (data?.choices?.[0]?.message?.content || '').trim();
        const firstWord = (reply.split(/\s+/)[0] || '').toUpperCase().replace(/[^A-Z_]/g, '');
        const verdict = firstWord === 'MATCH' ? 'match' : firstWord === 'NO_MATCH' ? 'no_match' : 'unclear';
        return { verdict, reason: reply };
    } finally {
        clearTimeout(timeout);
    }
}

module.exports = { verifySamePerson };
