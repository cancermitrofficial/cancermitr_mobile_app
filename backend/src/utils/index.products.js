import { prisma } from '../services/db.service.js';
import { getEmbedding } from '../services/embedding.service.js';
import { ensureCollection, insertToQdrant } from '../services/qdrant.service.js';

async function indexAllProducts() {
    try {
        console.log('🚀 Starting product indexing process...');

        // Ensure 'products' collection exists in Qdrant
        await ensureCollection('products');
        console.log('✅ Qdrant collection "products" checked/created');

        // Fetch all products from MySQL
        const products = await prisma.product.findMany();
        console.log(`📦 Found ${products.length} products in MySQL`);

        if (products.length === 0) {
            console.warn('⚠️ No products found in MySQL. Nothing to index.');
            return;
        }

        for (const product of products) {
            const text = `${product.name}\n${product.description || ''}\nSymptoms: ${product.symptoms?.join(', ')}\nCancer Types: ${product.cancerTypes?.join(', ')}`;
            const embedding = await getEmbedding(text);

            await insertToQdrant('products', product.id, embedding, {
                name: product.name,
                description: product.description,
                symptoms: product.symptoms,
                cancerTypes: product.cancerTypes,
                category: product.category,
                stage: product.stage,
                price: product.price,
                available: product.available
            });

            console.log(`✅ Indexed Product: [${product.id}] ${product.name}`);
        }

        console.log('🎉 All products indexed into Qdrant!');
    } catch (err) {
        console.error('❌ Error indexing products:', err);
    } finally {
        await prisma.$disconnect();
    }
}

indexAllProducts();
