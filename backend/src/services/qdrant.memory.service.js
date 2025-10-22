// File: src/services/qdrant.memory.service.js - IMPROVED VERSION
import { qdrant } from './qdrant.service.js';
import { getEmbedding } from './embedding.service.js';

const COLLECTION = 'chat_memories';

export async function upsertChatMemory({
  text,
  payload // { userId, sessionId, messageId, role, agentType, ts, isDecision, entities, tags, segment }
}) {
  try {
    if (!text || !payload?.messageId) {
      console.warn('upsertChatMemory skipped: missing text or messageId');
      return;
    }

    console.log(`Generating embedding for upsert... (text length: ${text.length})`);
    const rawEmbedding = await getEmbedding(text);

    // Ensure clean number array
    const embedding = Array.isArray(rawEmbedding) ? rawEmbedding : Array.from(rawEmbedding || []);
    
    // Validate embedding dimensions
    if (embedding.length !== 1536) {
      console.error(`Wrong embedding dimensions: expected 1536, got ${embedding.length}`);
      return;
    }
    
    // Validate each value is a finite number
    for (let i = 0; i < embedding.length; i++) {
      const v = embedding[i];
      if (typeof v !== 'number' || !Number.isFinite(v)) {
        console.error(`Invalid embedding value at index ${i}: ${v} (type: ${typeof v})`);
        return;
      }
    }

    // Clean and structure payload properly
    const cleanPayload = {
      // Core identification
      userId: Number(payload.userId) || 0,
      sessionId: String(payload.sessionId || ''),
      messageId: String(payload.messageId || ''),
      
      // Message context
      role: String(payload.role || 'unknown'),
      agentType: String(payload.agentType || 'NONE'),
      
      // Metadata
      ts: Number(payload.ts) || Date.now(),
      isDecision: Boolean(payload.isDecision || false),
      segment: Number(payload.segment) || 1,
      
      // Arrays (ensure they're arrays)
      entities: Array.isArray(payload.entities) ? payload.entities : [],
      tags: Array.isArray(payload.tags) ? payload.tags : [],
      
      // Add the actual text content for retrieval
      content: String(text).substring(0, 1000), // Limit content length
      
      // Add timestamp for debugging
      createdAt: new Date().toISOString()
    };

    const id = String(cleanPayload.messageId);

    // Create point for upsert
    const point = {
      id,
      vector: embedding,
      payload: cleanPayload
    };

    console.log('Upserting to Qdrant:', {
      collection: COLLECTION,
      pointId: id,
      vectorLength: embedding.length,
      payloadSize: Object.keys(cleanPayload).length,
      payloadKeys: Object.keys(cleanPayload),
      contentLength: cleanPayload.content.length
    });

    // Upsert to Qdrant with better error handling
    const upsertResult = await qdrant.upsert(COLLECTION, {
      points: [point],
      wait: true
    });

    console.log(`Qdrant upsert successful for id: ${id}`, {
      operation_id: upsertResult?.operation_id,
      status: upsertResult?.status
    });

    // Verify the upsert by retrieving the point
    try {
      const retrievedPoints = await qdrant.retrieve(COLLECTION, {
        ids: [id],
        with_payload: true,
        with_vector: false
      });
      
      if (retrievedPoints?.length > 0) {
        console.log('Verification successful - point exists:', {
          id: retrievedPoints[0].id,
          payloadKeys: Object.keys(retrievedPoints[0].payload || {}),
          hasContent: !!retrievedPoints[0].payload?.content
        });
      } else {
        console.warn('Verification failed - point not found after upsert');
      }
    } catch (verifyError) {
      console.warn('Could not verify upsert:', verifyError.message);
    }

    return { success: true, id };

  } catch (error) {
    console.error('Qdrant upsert failed:', {
      message: error?.message,
      status: error?.response?.status,
      statusText: error?.response?.statusText,
      data: error?.response?.data
    });
    
    // Log more details for debugging
    if (error?.response?.data) {
      console.error('Error details:', JSON.stringify(error.response.data, null, 2));
    }
    
    // Don't throw - let the app continue even if memory storage fails
    console.log('Continuing without memory storage...');
    return { success: false, error: error.message };
  }
}

export async function searchChatMemory({
  sessionId,
  agentType = null,
  queryText,
  limit = 5
}) {
  try {
    if (!queryText) {
      console.log('Empty query text for memory search');
      return [];
    }

    console.log(`Searching Qdrant memories for session: ${sessionId}`);
    console.log(`Generating search embedding... (query: "${queryText.substring(0, 50)}...")`);

    const rawQueryEmbedding = await getEmbedding(queryText);
    const queryEmbedding = Array.isArray(rawQueryEmbedding) ? rawQueryEmbedding : Array.from(rawQueryEmbedding || []);

    if (queryEmbedding.length !== 1536) {
      console.error(`Wrong query embedding dimensions: ${queryEmbedding.length}`);
      return [];
    }

    // Build filter
    const filter = {
      must: [
        { key: 'sessionId', match: { value: sessionId } }
      ]
    };
    
    if (agentType) {
      filter.must.push({ key: 'agentType', match: { value: agentType } });
    }

    console.log('Qdrant search params:', {
      collection: COLLECTION,
      sessionId,
      agentType: agentType || 'any',
      limit
    });

    const searchResult = await qdrant.search(COLLECTION, {
      vector: queryEmbedding,
      filter,
      limit,
      with_payload: true,
      with_vector: false,
      score_threshold: 0.7
    });

    const results = searchResult || [];
    console.log(`Found ${results.length} relevant memories`);
    
    if (results.length > 0) {
      console.log('Top result:', {
        score: results[0]?.score?.toFixed(3),
        id: results[0]?.id,
        hasContent: !!results[0]?.payload?.content,
        role: results[0]?.payload?.role,
        agentType: results[0]?.payload?.agentType
      });
    }
    
    return results;

  } catch (error) {
    console.error('Qdrant search failed:', {
      message: error?.message,
      status: error?.response?.status,
      data: error?.response?.data
    });
    
    return [];
  }
}

// Enhanced health check
export async function checkQdrantHealth() {
  try {
    console.log('Checking Qdrant health...');
    
    const collections = await qdrant.getCollections();
    console.log('Qdrant is reachable');
    
    const collectionExists = collections.collections?.some(c => c.name === COLLECTION);
    console.log(`Collection '${COLLECTION}' exists:`, collectionExists);
    
    if (collectionExists) {
      const info = await qdrant.getCollection(COLLECTION);
      console.log('Collection stats:', {
        pointsCount: info.points_count,
        vectorSize: info.config?.params?.vectors?.size,
        distance: info.config?.params?.vectors?.distance,
        status: info.status
      });
      
      // Test retrieval of a few points
      try {
        const testPoints = await qdrant.scroll(COLLECTION, {
          limit: 3,
          with_payload: true,
          with_vector: false
        });
        
        console.log('Sample points check:', {
          retrieved: testPoints.points?.length || 0,
          samplePayloadKeys: testPoints.points?.[0]?.payload ? Object.keys(testPoints.points[0].payload) : []
        });
      } catch (scrollError) {
        console.warn('Could not retrieve sample points:', scrollError.message);
      }
    }
    
    return {
      healthy: true,
      collectionExists,
      pointsCount: collectionExists ? (await qdrant.getCollection(COLLECTION)).points_count : 0
    };
    
  } catch (error) {
    console.error('Qdrant health check failed:', error.message);
    return {
      healthy: false,
      error: error.message
    };
  }
}

// Enhanced debug function
export async function debugCollectionPoints(sessionId = null, limit = 10) {
  try {
    console.log(`Debugging collection points (limit: ${limit})...`);
    
    const filter = sessionId 
      ? { must: [{ key: 'sessionId', match: { value: sessionId } }] }
      : undefined;

    const scrollResult = await qdrant.scroll(COLLECTION, {
      filter,
      limit,
      with_payload: true,
      with_vector: false
    });

    const points = scrollResult.points || [];
    console.log(`Found ${points.length} points in collection`);
    
    points.forEach((point, i) => {
      const payload = point.payload || {};
      console.log(`Point ${i + 1}:`, {
        id: point.id,
        payloadKeys: Object.keys(payload),
        userId: payload.userId,
        sessionId: payload.sessionId,
        role: payload.role,
        agentType: payload.agentType,
        hasContent: !!payload.content,
        contentLength: payload.content?.length || 0,
        contentPreview: payload.content?.substring(0, 50) + '...'
      });
    });
    
    return points;
    
  } catch (error) {
    console.error('Debug collection failed:', error.message);
    return [];
  }
}

// New function to test memory storage end-to-end
export async function testMemoryStorage() {
  try {
    console.log('Testing memory storage end-to-end...');
    
    const testPayload = {
      userId: 999,
      sessionId: 'test-session-' + Date.now(),
      messageId: 'test-message-' + Date.now(),
      role: 'test',
      agentType: 'TEST_AGENT',
      ts: Date.now(),
      isDecision: true,
      entities: ['test'],
      tags: ['test'],
      segment: 1
    };
    
    const testText = 'This is a test message for memory storage verification.';
    
    // Test upsert
    const upsertResult = await upsertChatMemory({
      text: testText,
      payload: testPayload
    });
    
    if (!upsertResult?.success) {
      console.error('Test upsert failed');
      return false;
    }
    
    // Test search
    const searchResults = await searchChatMemory({
      sessionId: testPayload.sessionId,
      queryText: 'test message',
      limit: 1
    });
    
    if (searchResults.length === 0) {
      console.error('Test search failed - no results found');
      return false;
    }
    
    console.log('Memory storage test successful!');
    return true;
    
  } catch (error) {
    console.error('Memory storage test failed:', error.message);
    return false;
  }
}