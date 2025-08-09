interface VectorMetadata {
    frameId: number;
    movieId: number;
    framePath: string;
    timestamp: number;
    director: string;
    movieTitle: string;
    movieUrl: string;
    patchType: string;
    x: number;
    y: number;
    width: number;
    height: number;
    createdAt: string;
}

interface SearchResult {
    id: string;
    score: number;
    metadata: VectorMetadata;
}

interface UpsertRequest {
    frameId: number;
    movieId: number;
    framePath: string;
    timestamp: number;
    director: string;
    movieTitle: string;
    embeddings: Array<{
        patchType: string;
        embedding: number[];
        x?: number;
        y?: number;
        width?: number;
        height?: number;
    }>;
}

interface SearchRequest {
    embedding: number[];
    limit: number;
    threshold?: number;
    filter?: Record<string, any>;
}

const BASE_URL = process.env.EMBEDDING_SERVICE_URL || 'http://localhost:8080';

export async function initializeVectorDB(): Promise<void> {
    try {
        console.log('🔧 Initializing local vector database...');

        const response = await fetch(`${BASE_URL}/vector-db/init`, {
            method: 'POST'
        });

        if (response.ok) {
            console.log('✅ Local vector database initialized successfully');
        } else {
            throw new Error(`Failed to initialize vector database: ${response.status}`);
        }
    } catch (error) {
        console.error('❌ Error initializing vector database:', error);
        throw new Error(`Failed to initialize vector database: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

export async function upsertFrameEmbeddings(
    frameId: number,
    movieId: number,
    framePath: string,
    timestamp: number,
    director: string,
    movieTitle: string,
    embeddings: Array<{
        patchType: string;
        embedding: number[];
        x?: number;
        y?: number;
        width?: number;
        height?: number;
    }>
): Promise<Array<string>> {
    try {
        const vectorIds: string[] = [];

        // prepare vectors for upsert
        const vectors = embeddings.map((embeddingData, index) => {
            const vectorId = `frame_${frameId}_${embeddingData.patchType}_${index}`;
            vectorIds.push(vectorId);

            return {
                id: vectorId,
                embedding: embeddingData.embedding,
                metadata: {
                    frameId,
                    movieId,
                    framePath,
                    timestamp,
                    director,
                    movieTitle,
                    movieUrl: `file://${framePath}`,
                    patchType: embeddingData.patchType,
                    x: embeddingData.x || 0,
                    y: embeddingData.y || 0,
                    width: embeddingData.width || 0,
                    height: embeddingData.height || 0,
                    createdAt: new Date().toISOString()
                }
            };
        });

        console.log(`📤 Upserting ${vectors.length} vectors for frame ${frameId}`);

        const response = await fetch(`${BASE_URL}/vector-db/upsert`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ vectors })
        });

        if (response.ok) {
            console.log(`✅ Successfully upserted ${vectors.length} vectors`);
            return vectorIds;
        } else {
            throw new Error(`Failed to upsert vectors: ${response.status}`);
        }
    } catch (error) {
        console.error(`❌ Error upserting embeddings for frame ${frameId}:`, error);
        throw new Error(`Failed to upsert embeddings: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

export async function querySimilarVectors(
    queryEmbedding: number[],
    topK: number = 10,
    filter?: Record<string, any>,
    threshold?: number
): Promise<{ results: Array<SearchResult>, fallback: Array<SearchResult> }> {
    try {
        console.log(`🔍 Querying local vector database for ${topK} similar vectors`);

        const searchRequest: SearchRequest = {
            embedding: queryEmbedding,
            limit: topK
        };

        if (filter) {
            searchRequest.filter = filter;
        }
        if (threshold !== undefined) {
            searchRequest.threshold = threshold;
        }

        const response = await fetch(`${BASE_URL}/vector-db/query`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(searchRequest)
        });

        if (response.ok) {
            const data = await response.json() as any;
            const results = data.results || [];
            const fallback = data.fallback || [];
            console.log(`✅ Found ${results.length} similar vectors, fallback: ${fallback.length}`);
            return { results, fallback };
        } else {
            throw new Error(`Failed to query vectors: ${response.status}`);
        }
    } catch (error) {
        const cause = (error && typeof error === 'object' && 'cause' in error) ? (error as any).cause : undefined;
        console.error(`[localVectorDB] Error querying ${BASE_URL}/vector-db/query:`, error, cause ? `cause: ${JSON.stringify(cause)}` : '');
        throw new Error(`Failed to query similar vectors: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

export async function deleteFrameVectors(frameId: number): Promise<void> {
    try {
        console.log(`🗑️  Deleting vectors for frame ${frameId}`);

        const response = await fetch(`${BASE_URL}/vector-db/delete`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ frameId })
        });

        if (response.ok) {
            console.log(`✅ Successfully deleted vectors for frame ${frameId}`);
        } else {
            throw new Error(`Failed to delete vectors: ${response.status}`);
        }
    } catch (error) {
        console.error(`❌ Error deleting vectors for frame ${frameId}:`, error);
        throw new Error(`Failed to delete frame vectors: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

export async function getDatabaseStats(): Promise<any> {
    try {
        const response = await fetch(`${BASE_URL}/vector-db/stats`);

        if (response.ok) {
            const data = await response.json() as any;
            return data;
        } else {
            throw new Error(`Failed to get database stats: ${response.status}`);
        }
    } catch (error) {
        console.error('❌ Error getting database stats:', error);
        throw new Error(`Failed to get database stats: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
} 