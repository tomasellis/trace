import axios from 'axios';
import fs from 'fs';
import FormData from 'form-data';
import { querySimilarVectors } from './localVectorDB';

interface ScreenshotEmbedding {
    patchType: string;
    embedding: number[];
    x: number;
    y: number;
    width: number;
    height: number;
}

interface SearchResult {
    id: string;
    score: number;
    metadata: {
        movieId: number;
        movieTitle: string;
        director: string;
        movieUrl: string;
        frameId: number;
        timestamp: number;
        framePath: string;
        patchType: string;
        x: number;
        y: number;
        width: number;
        height: number;
    };
}

export async function generateScreenshotEmbeddings(screenshotPath: string): Promise<ScreenshotEmbedding[]> {
    try {
        console.log(`🤖 Generating embeddings for screenshot: ${screenshotPath}`);

        const form = new FormData();
        form.append('file', fs.createReadStream(screenshotPath));

        const embeddingApiUrl = process.env.EMBEDDING_SERVICE_URL || 'http://localhost:3001';

        const embeddingServiceUrl = `${embeddingApiUrl}/embed/single`;

        console.log('🔧 embeddingServiceUrl:', embeddingServiceUrl);

        const response = await axios.post(embeddingServiceUrl, form, {
            headers: form.getHeaders()
        });

        const result = response.data;
        console.log(`✅ Generated embeddings for screenshot: ${result.embeddings?.length || 0} patches`);

        const embeddings: ScreenshotEmbedding[] = [];

        if (result.embeddings && Array.isArray(result.embeddings)) {
            for (const embedding of result.embeddings) {
                embeddings.push({
                    patchType: embedding.patch_type || 'full',
                    embedding: embedding.embedding || [],
                    x: embedding.x || 0,
                    y: embedding.y || 0,
                    width: embedding.width || 0,
                    height: embedding.height || 0
                });
            }
        }

        return embeddings;

    } catch (error) {
        console.error('❌ Error generating screenshot embeddings:', error);
        throw new Error(`Failed to generate embeddings: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

export async function searchSimilarFrames(
    screenshotEmbeddings: ScreenshotEmbedding[],
    limit: number = 3 // default to 3 full
): Promise<{ results: SearchResult[], fallback: SearchResult[] }> {
    try {
        console.log(`🔍 Searching for similar frames with ${screenshotEmbeddings.length} embeddings`);

        const allResults: SearchResult[] = [];

        const fullPatch = screenshotEmbeddings.find(e => e.patchType === 'full');
        if (!fullPatch) {
            throw new Error('No full patch embedding found');
        }
        console.log(`🔍 Searching for full patch (limit: ${limit})`);
        const { results, fallback } = await querySimilarVectors(
            fullPatch.embedding,
            limit,
            { patchType: 'full' }
        );
        console.log('Raw results:', results);
        console.log('Raw fallback:', fallback);

        if (results && results.length > 0) {
            allResults.push(...results);
        } else if (fallback && fallback.length > 0) {
            allResults.push(...fallback);
        }

        // Deduplicate by framePath for robustness
        const uniqueResults = allResults
            .filter((result, index, self) =>
                index === self.findIndex(r => r.metadata.framePath === result.metadata.framePath)
            );

        uniqueResults.sort((a, b) => a.score - b.score);

        console.log(`✅ Found ${uniqueResults.length} unique similar frames (full patch)`);
        console.log('Returning results to frontend:', uniqueResults);
        return { results: uniqueResults, fallback: [] };

    } catch (error) {
        console.error('❌ Error searching similar frames:', error);
        throw new Error(`Failed to search similar frames: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
} 