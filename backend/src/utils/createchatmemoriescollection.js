import { QdrantClient } from '@qdrant/js-client-rest';

const qdrant = new QdrantClient({ url: 'http://localhost:6333' });

async function initChatMemoriesCollection() {
    const collectionName = 'chat_memories';
    
    try {
        console.log('🔍 Checking Qdrant connection...');
        
        // First, test if Qdrant is reachable
        const health = await qdrant.getCollections().catch(err => {
            throw new Error(`Cannot connect to Qdrant at localhost:6333: ${err.message}`);
        });
        
        console.log('✅ Qdrant is reachable');
        console.log('📋 Existing collections:', health.collections?.map(c => c.name) || []);
        
        // Check if collection exists
        const exists = await qdrant.getCollection(collectionName).catch(() => null);

        if (!exists) {
            console.log(`🔧 Creating collection: ${collectionName}...`);
            
            await qdrant.createCollection(collectionName, {
                vectors: {
                    size: 1536, // OpenAI text-embedding-ada-002 size
                    distance: 'Cosine'
                },
                // Optional: Add these for better performance
                optimizers_config: {
                    default_segment_number: 2
                },
                replication_factor: 1
            });
            
            console.log(`✅ Created Qdrant collection: ${collectionName}`);
        } else {
            console.log(`ℹ️ Collection ${collectionName} already exists`);
            
            // Show collection info
            const info = await qdrant.getCollection(collectionName);
            console.log('📊 Collection info:', {
                pointsCount: info.points_count,
                vectorSize: info.config?.params?.vectors?.size,
                distance: info.config?.params?.vectors?.distance,
                status: info.status
            });
        }
        
        // Test collection is working
        console.log('🧪 Testing collection...');
        
        // Try to add a test point
        const testPoint = {
            id: 'test-point-123',
            vector: new Array(1536).fill(0.1), // Dummy vector
            payload: {
                test: true,
                timestamp: Date.now()
            }
        };
        
        await qdrant.upsert(collectionName, {
            points: [testPoint],
            wait: true
        });
        
        console.log('✅ Test upsert successful');
        
        // Clean up test point
        await qdrant.delete(collectionName, {
            points: ['test-point-123'],
            wait: true
        });
        
        console.log('✅ Test cleanup successful');
        console.log('🎉 Qdrant setup complete and tested!');
        
    } catch (error) {
        console.error('❌ Setup failed:', error.message);
        console.error('Full error:', error);
        process.exit(1);
    }
}

initChatMemoriesCollection();