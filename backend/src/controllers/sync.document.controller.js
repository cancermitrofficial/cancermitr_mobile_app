import { prisma } from '../services/db.service.js';
import { getEmbedding } from '../services/embedding.service.js';
import {
    insertToQdrant,
    deleteFromQdrant,
    ensureCollection,
} from '../services/qdrant.service.js';

let collectionEnsured = false;
async function ensureOnce() {
    if (!collectionEnsured) {
        await ensureCollection();
        collectionEnsured = true;
    }
}

export async function syncDocumentToQdrant(id) {
    await ensureOnce();

    const doc = await prisma.document.findUnique({ where: { id } });
    if (!doc) throw new Error(`❌ Document with ID ${id} not found in MySQL`);

    const text = `${doc.title}\n${doc.content}`;
    const vector = await getEmbedding(text);

    await insertToQdrant(doc.id, vector, {
        title: doc.title,
        content: doc.content,
    });

    console.log(`✅ Synced to Qdrant: ID ${doc.id} - ${doc.title}`);
}

export async function removeDocumentFromQdrant(id) {
    await ensureOnce();
    await deleteFromQdrant(id);
    console.log(`🗑️  Deleted from Qdrant: ID ${id}`);
}

export async function resyncAllDocuments() {
    await ensureOnce();
    const docs = await prisma.document.findMany();
    console.log(`🔁 Reindexing ${docs.length} documents...`);

    for (const doc of docs) {
        const text = `${doc.title}\n${doc.content}`;
        const vector = await getEmbedding(text);

        await insertToQdrant(doc.id, vector, {
            title: doc.title,
            content: doc.content,
        });
        console.log(`📌 Reindexed: ID ${doc.id}`);
    }
    console.log(`✅ Done: All documents re-synced to Qdrant.`);
}
