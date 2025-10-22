import { QdrantClient } from '@qdrant/js-client-rest';

export const qdrant = new QdrantClient({ url: 'http://localhost:6333' });

/**
 * Ensure a Qdrant collection exists (documents, products, etc.)
 */
export async function ensureCollection(collectionName) {
    const collections = await qdrant.getCollections();
    const exists = collections.collections.find(c => c.name === collectionName);

    if (!exists) {
        console.log(`📦 Creating Qdrant collection "${collectionName}"...`);
        await qdrant.createCollection(collectionName, {
            vectors: { size: 1536, distance: 'Cosine' },
        });
    } else {
        console.log(`ℹ️ Collection "${collectionName}" already exists.`);
    }
}

/**
 * Insert or update a point in a specific collection
 */
export async function insertToQdrant(collectionName, id, vector, payload) {
     const plainVector = Array.from(vector).map(x => Number(x));
    return qdrant.upsert(collectionName, {
        points: [{ id, vector: plainVector, payload }]
    });
}

/**
 * Search vector similarity in a specific collection
 */
export async function searchQdrant(collectionName, vector) {
    return qdrant.search(collectionName, {
        vector,
        top: 3,
    });
}

/**
 * Delete a point from a specific collection
 */
export async function deleteFromQdrant(collectionName, id) {
    try {
        await qdrant.delete(collectionName, {
            points: [id],
        });
        console.log(`🗑️  Deleted point ${id} from Qdrant (${collectionName})`);
    } catch (err) {
        console.error(`Failed to delete point from Qdrant (${collectionName}):`, err.message);
    }
}
