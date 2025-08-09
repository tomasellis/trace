/**
 * backend/src/utils/bulkVideoImport.ts
 *
 * Utility for bulk importing existing videos for local testing.
 * Allows importing videos from a local directory without re-uploading.
 */

import fs from 'fs';
import path from 'path';
import { eq } from 'drizzle-orm';
import { processVideo } from '../utils/videoProcessing';
import { upsertFrameEmbeddings } from '../utils/localVectorDB';
import { generateScreenshotEmbeddings } from '../utils/screenshotSearch';
import axios from 'axios'; // Added for batch embedding
import FormData from 'form-data';

/**
 * Video file information for bulk import
 */
interface VideoFileInfo {
    filePath: string;
    fileName: string;
    movieTitle: string;
    director: string;
}

/**
 * Import a single video file
 * 
 * @param {VideoFileInfo} videoInfo - Video file information
 * @param {string} outputBaseDir - Base directory for frame output
 * @returns {Promise<Object>} Import result
 */
async function importSingleVideo(
    videoInfo: VideoFileInfo,
    outputBaseDir: string,
    options: { skipExtraction?: boolean } = { skipExtraction: true }
): Promise<{
    success: boolean;
    framesProcessed?: number;
    embeddingsStored?: number;
    error?: string;
}> {
    try {
        console.log(`📹 Importing video: ${videoInfo.fileName}`);

        // Determine frames output directory
        const framesOutputDir = path.join(outputBaseDir, path.basename(videoInfo.fileName, path.extname(videoInfo.fileName)));
        let processedFrames;

        // --- Skip extraction if frames already exist and option is set ---
        let useExistingFrames = false;
        if (options.skipExtraction && fs.existsSync(framesOutputDir)) {
            const frameFiles = fs.readdirSync(framesOutputDir).filter(f => f.endsWith('.jpg'));
            if (frameFiles.length > 0) {
                useExistingFrames = true;
                console.log(`⏩ Skipping extraction: Found ${frameFiles.length} existing frames in ${framesOutputDir}`);
                processedFrames = frameFiles.map((file, idx) => ({
                    framePath: path.join(framesOutputDir, file),
                    timestamp: idx * 3, // Approximate, or parse from filename if available
                    patches: []
                }));
            }
        }

        // --- ASYNC EMBEDDING PIPELINE ---
        if (!useExistingFrames) {
            // Start async video processing job in Python service
            console.log(`🎬 Starting async video processing job...`);
            const response = await axios.post('http://localhost:8000/start-process-video', {
                video_path: videoInfo.filePath,
                output_dir: framesOutputDir,
                frame_interval: 3
            });
            const { job_id } = response.data;
            if (!job_id) throw new Error('Failed to start embedding job');
            // Poll for job status
            let status = 'pending';
            let progress = 0;
            let total = 0;
            let error = null;
            const pollInterval = 3000; // ms
            console.log(`⏳ Polling job status for job_id: ${job_id}`);
            while (status !== 'done' && status !== 'error') {
                await new Promise(res => setTimeout(res, pollInterval));
                const statusResp = await axios.get(`http://localhost:8000/status/${job_id}`);
                status = statusResp.data.status;
                progress = statusResp.data.progress;
                total = statusResp.data.total;
                error = statusResp.data.error;
                process.stdout.write(`\r  Status: ${status} | Progress: ${progress}/${total}`);
            }
            process.stdout.write('\n');
            if (status === 'error') {
                throw new Error(`Embedding job failed: ${error}`);
            }
            console.log(`✅ Embedding job complete! Processed ${total} frames.`);
            // After job, enumerate frames
            const frameFiles = fs.readdirSync(framesOutputDir).filter(f => f.endsWith('.jpg'));
            processedFrames = frameFiles.map((file, idx) => ({
                framePath: path.join(framesOutputDir, file),
                timestamp: idx * 3, // Approximate, or parse from filename if available
                patches: []
            }));
        }

        if (!processedFrames) {
            throw new Error('No frames found for video: ' + videoInfo.fileName);
        }

        // No DB: just report stats
        const totalEmbeddings = processedFrames.length;
        console.log(`✅ Successfully imported video: ${videoInfo.fileName}`);
        console.log(`📊 Stats: ${processedFrames.length} frames, ${totalEmbeddings} embeddings`);

        return {
            success: true,
            framesProcessed: processedFrames.length,
            embeddingsStored: totalEmbeddings
        };

    } catch (error) {
        console.error(`❌ Error importing video ${videoInfo.fileName}:`, error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

/**
 * Scan directory for video files
 * 
 * @param {string} directoryPath - Directory to scan
 * @returns {Promise<Array<VideoFileInfo>>} Array of video file information
 */
async function scanForVideos(directoryPath: string): Promise<VideoFileInfo[]> {
    const videoExtensions = ['.mp4', '.webm', '.avi', '.mov', '.mkv', '.flv'];
    const videoFiles: VideoFileInfo[] = [];

    try {
        const files = await fs.promises.readdir(directoryPath);

        for (const file of files) {
            const filePath = path.join(directoryPath, file);
            const stat = await fs.promises.stat(filePath);

            if (stat.isFile()) {
                const ext = path.extname(file).toLowerCase();
                if (videoExtensions.includes(ext)) {
                    // Generate movieTitle and director from filename
                    const fileNameWithoutExt = path.basename(file, ext);
                    const movieTitle = fileNameWithoutExt;
                    const director = 'Unknown Director'; // Can be customized

                    videoFiles.push({
                        filePath,
                        fileName: file,
                        movieTitle,
                        director
                    });
                }
            }
        }

        return videoFiles;
    } catch (error) {
        console.error(`❌ Error scanning directory ${directoryPath}:`, error);
        return [];
    }
}

/**
 * Bulk import videos from a directory
 * 
 * @param {string} videosDirectory - Directory containing video files
 * @param {string} outputBaseDir - Base directory for frame output
 * @param {Object} options - Import options
 * @returns {Promise<Object>} Import summary
 */
export async function bulkImportVideos(
    videosDirectory: string,
    outputBaseDir: string = path.join(__dirname, '../../uploads/frames'),
    options: {
        customTitles?: Record<string, string>;
        customDirectors?: Record<string, string>;
        skipExisting?: boolean;
        skipExtraction?: boolean; // New option
    } = {}
): Promise<{
    total: number;
    successful: number;
    failed: number;
    results: Array<{
        fileName: string;
        success: boolean;
        framesProcessed?: number;
        embeddingsStored?: number;
        error?: string;
    }>;
}> {
    console.log(`🔍 Scanning directory for videos: ${videosDirectory}`);

    const videoFiles = await scanForVideos(videosDirectory);
    console.log(`📁 Found ${videoFiles.length} video files`);

    if (videoFiles.length === 0) {
        return {
            total: 0,
            successful: 0,
            failed: 0,
            results: []
        };
    }

    // Apply custom titles and directors if provided
    const processedMovies = videoFiles.map(movie => ({
        ...movie,
        movieTitle: options.customTitles?.[movie.fileName] || movie.movieTitle,
        director: options.customDirectors?.[movie.fileName] || movie.director
    }));

    console.log(`🚀 Starting bulk import of ${processedMovies.length} videos...`);

    const results: Array<{
        fileName: string;
        success: boolean;
        framesProcessed?: number;
        embeddingsStored?: number;
        error?: string;
    }> = [];
    let successful = 0;
    let failed = 0;

    for (const movie of processedMovies) {
        console.log(`\n📹 Processing: ${movie.fileName}`);

        const result = await importSingleVideo(movie, outputBaseDir, { skipExtraction: options.skipExtraction });

        results.push({
            fileName: movie.fileName,
            ...result
        });

        if (result.success) {
            successful++;
        } else {
            failed++;
            if (result.error === 'Video already exists in database' && options.skipExisting) {
                console.log(`⏭️  Skipping existing video: ${movie.fileName}`);
            } else {
                console.log(`❌ Failed to import: ${movie.fileName} - ${result.error}`);
            }
        }
    }

    console.log(`\n🎉 Bulk import completed!`);
    console.log(`📊 Summary: ${successful} successful, ${failed} failed`);

    return {
        total: processedMovies.length,
        successful,
        failed,
        results
    };
}

/**
 * Import videos with custom metadata from a JSON file
 * 
 * @param {string} videosDirectory - Directory containing video files
 * @param {string} metadataFile - JSON file with video metadata
 * @param {string} outputBaseDir - Base directory for frame output
 * @returns {Promise<Object>} Import summary
 */
export async function importVideosWithMetadata(
    videosDirectory: string,
    metadataFile: string,
    outputBaseDir: string = path.join(__dirname, '../../uploads/frames')
): Promise<{
    total: number;
    successful: number;
    failed: number;
    results: Array<any>;
}> {
    try {
        const metadataContent = await fs.promises.readFile(metadataFile, 'utf-8');
        const metadata = JSON.parse(metadataContent);

        const customTitles: Record<string, string> = {};
        const customDirectors: Record<string, string> = {};

        // Build lookup maps from metadata
        for (const movie of metadata.videos || []) {
            if (movie.fileName && movie.movieTitle) {
                customTitles[movie.fileName] = movie.movieTitle;
            }
            if (movie.fileName && movie.director) {
                customDirectors[movie.fileName] = movie.director;
            }
        }

        return await bulkImportVideos(videosDirectory, outputBaseDir, {
            customTitles,
            customDirectors,
            skipExisting: true
        });

    } catch (error) {
        console.error(`❌ Error reading metadata file ${metadataFile}:`, error);
        throw new Error(`Failed to read metadata file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

// Helper to chunk an array
function chunkArray<T>(array: T[], size: number): T[][] {
    const result: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
        result.push(array.slice(i, i + size));
    }
    return result;
} 