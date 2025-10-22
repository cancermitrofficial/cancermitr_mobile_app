import { prisma } from '../services/db.service.js';
import { getEmbedding } from '../services/embedding.service.js';
import { ensureCollection, insertToQdrant } from '../services/qdrant.service.js';

async function indexAllDocuments() {
    try {
        console.log('🚀 Starting document indexing process...');

        // Ensure collection exists in Qdrant
        await ensureCollection('documents');
        console.log('✅ Qdrant collection checked/created');

        // Fetch all documents from MySQL
        const docs = await prisma.document.findMany();
        console.log(`📄 Found ${docs.length} documents in MySQL`);

        if (docs.length === 0) {
            console.warn('⚠️ No documents found in MySQL. Nothing to index.');
            return;
        }

        // Loop through and push to Qdrant
        for (const doc of docs) {
            const text = `${doc.title}\n${doc.content}`;
            const embedding = await getEmbedding(text);
            await insertToQdrant('documents', doc.id, embedding, {
                title: doc.title,
                content: doc.content,
            });
            console.log(`✅ Indexed: [${doc.id}] ${doc.title}`);
        }

        console.log('🎉 All documents indexed into Qdrant!');
    } catch (err) {
        console.error('❌ Error indexing documents:', err);
    } finally {
        await prisma.$disconnect();
    }
}

// 🔁 Call the function directly
indexAllDocuments();
