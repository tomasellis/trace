const EMBEDDINGS_SERVICE_URL = process.env.EMBEDDINGS_SERVICE_URL || 'http://localhost:8000';

export async function processVideo(
    videoPath: string,
    outputDir: string,
    frameInterval: number = 3,
    maxFrames?: number
): Promise<Array<{
    framePath: string;
    timestamp: number;
    patches: Array<{
        patchType: string;
        x: number;
        y: number;
        width: number;
        height: number;
        embedding: number[];
    }>;
}>> {
    try {
        console.log(`🎬 Starting video processing: ${videoPath}`);
        console.log(`📂 Output directory: ${outputDir}`);

        const body: any = {
            video_path: videoPath,
            output_dir: outputDir,
            frame_interval: frameInterval
        };
        if (typeof maxFrames === 'number') body.max_frames = maxFrames;

        // call Python microservice for video processing
        const response = await fetch(`${EMBEDDINGS_SERVICE_URL}/process-video`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const result = await response.json() as any;

        console.log(`✅ Video processing complete! Processed ${result.total_frames} frames`);
        console.log(`📊 Model info: ${result.model_info.model} on ${result.model_info.device}`);

        const processedFrames = result.frames.map((frame: any) => ({
            framePath: frame.frame_path,
            timestamp: frame.timestamp,
            patches: frame.patches.map((patch: any) => ({
                patchType: patch.patch_type,
                x: patch.x,
                y: patch.y,
                width: patch.width,
                height: patch.height,
                embedding: patch.embedding
            }))
        }));

        return processedFrames;

    } catch (error) {
        console.error(`❌ Error processing video ${videoPath}:`, error);
        throw new Error(`Failed to process video: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

export async function getVideoProcessingHealth(): Promise<any> {
    try {
        const response = await fetch(`${EMBEDDINGS_SERVICE_URL}/health`);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return await response.json();
    } catch (error) {
        console.error('❌ Error checking video processing service health:', error);
        throw new Error(`Failed to check service health: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
} 