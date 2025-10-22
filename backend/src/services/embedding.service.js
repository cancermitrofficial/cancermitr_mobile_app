import { openai } from './llm.service.js';

export async function getEmbedding(text) {
    const response = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: text,
    });

    const raw = response.data[0].embedding;

    // Force convert to plain JS numbers
    const vector = Array.from(raw, x => Number(x));

    // Optional: Validate
    if (!Array.isArray(vector) || vector.some(x => typeof x !== 'number' || isNaN(x))) {
        throw new Error('Embedding is not a valid number array');
    }

    return vector;
}
