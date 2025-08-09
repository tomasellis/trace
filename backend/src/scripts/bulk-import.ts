import path from 'path';
import { bulkImportVideos, importVideosWithMetadata } from './bulkVideoImport';

function parseArgs(): {
    videosDirectory: string;
    metadataFile?: string;
    help: boolean;
} {
    const args = process.argv.slice(2);

    if (args.includes('--help') || args.includes('-h')) {
        return { videosDirectory: '', help: true };
    }

    if (args.length === 0) {
        return { videosDirectory: '', help: true };
    }

    const videosDirectory = args[0];
    const metadataFile = args[1];

    return {
        videosDirectory,
        metadataFile,
        help: false
    };
}

/**
 * Display help information
 */
function showHelp() {
    console.log(`
📹 Movie Video Archive - Bulk Import Utility

Usage:
  npm run bulk-import <movies-directory> [metadata-file]

Arguments:
  movies-directory  Path to directory containing movie files
  metadata-file     Optional JSON file with custom movie metadata

Examples:
  # Import movies with auto-generated titles
  npm run bulk-import ./my-movies

  # Import movies with custom metadata
  npm run bulk-import ./my-movies metadata.json

Metadata JSON format:
  {
    "movies": [
      {
        "fileName": "movie1.mp4",
        "movieTitle": "Custom Movie Title 1",
        "director": "Custom Director 1"
      },
      {
        "fileName": "movie2.mp4",
        "movieTitle": "Custom Movie Title 2",
        "director": "Custom Director 2"
      }
    ]
  }

Supported movie formats: MP4, WebM, AVI, MOV, MKV, FLV
`);
}

/**
 * Main function
 */
async function main() {
    const { videosDirectory, metadataFile, help } = parseArgs();

    if (help) {
        showHelp();
        return;
    }

    // Validate videos directory
    if (!videosDirectory) {
        console.error('❌ Error: Videos directory is required');
        showHelp();
        process.exit(1);
    }

    const absoluteVideosPath = path.resolve(videosDirectory);

    try {
        console.log('🚀 Starting bulk video import...');
        console.log(`📁 Videos directory: ${absoluteVideosPath}`);

        let result;

        if (metadataFile) {
            const absoluteMetadataPath = path.resolve(metadataFile);
            console.log(`📄 Metadata file: ${absoluteMetadataPath}`);
            result = await importVideosWithMetadata(absoluteVideosPath, absoluteMetadataPath);
        } else {
            result = await bulkImportVideos(absoluteVideosPath);
        }

        console.log('\n📊 Import Summary:');
        console.log(`   Total videos found: ${result.total}`);
        console.log(`   Successfully imported: ${result.successful}`);
        console.log(`   Failed: ${result.failed}`);

        if (result.failed > 0) {
            console.log('\n❌ Failed imports:');
            result.results
                .filter(r => !r.success)
                .forEach(r => {
                    console.log(`   - ${r.fileName}: ${r.error}`);
                });
        }

        if (result.successful > 0) {
            console.log('\n✅ Successfully imported videos:');
            result.results
                .filter(r => r.success)
                .forEach(r => {
                    console.log(`   - ${r.fileName} (ID: ${r.videoId}, Frames: ${r.framesProcessed}, Embeddings: ${r.embeddingsStored})`);
                });
        }

        console.log('\n🎉 Bulk import completed!');

    } catch (error) {
        console.error('❌ Error during bulk import:', error);
        process.exit(1);
    }
}

// Run if this file is executed directly
if (require.main === module) {
    main().catch(console.error);
}

export { main }; 