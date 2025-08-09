// backend/src/routes/videos.ts
// Video-related API routes for the VTuber Video Archive.
import express, { Request, Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { processVideo } from "../utils/videoProcessing";
import {
  generateScreenshotEmbeddings,
  searchSimilarFrames,
} from "../utils/screenshotSearch";

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, "../../uploads/videos");
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `video-${uniqueSuffix}${ext}`);
  },
});

const fileFilter = (
  req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
) => {
  const allowedMimeTypes = [
    "video/mp4",
    "video/webm",
    "video/avi",
    "video/mov",
    "video/mkv",
    "video/flv",
    "video/x-matroska",
    "application/octet-stream",
  ];
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Invalid file type. Only video files are allowed."));
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 2 * 1024 * 1024 * 1024 },
});

const screenshotFileFilter = (
  req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
) => {
  const allowedMimeTypes = [
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/webp",
    "image/bmp",
    "image/gif",
  ];
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        "Invalid file type. Only image files are allowed for screenshot search.",
      ),
    );
  }
};

const screenshotUpload = multer({
  storage: storage,
  fileFilter: screenshotFileFilter,
  limits: { fileSize: 20 * 1024 * 1024 },
});

const router = express.Router();

// POST /api/movies/upload
router.post(
  "/upload",
  upload.single("movie"),
  async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: "No movie file provided" });
        return;
      }
      const { movieTitle, director } = req.body;
      if (!movieTitle || !director) {
        res.status(400).json({
          error: "Movie Title and Director name are required",
        });
        return;
      }

      const framesOutputDir = path.join(
        __dirname,
        "../../uploads/frames",
        path.parse(req.file.filename).name,
      );
      const processedFrames = await processVideo(
        req.file.path,
        framesOutputDir,
        3,
      );
      res.status(201).json({
        message: "Movie uploaded and processed successfully",
        movie: {
          movieTitle,
          director,
          filePath: req.file.path,
        },
        processing: {
          framesProcessed: processedFrames.length,
          timestamps: processedFrames.map((frame) => frame.timestamp),
        },
      });
    } catch (error) {
      res.status(500).json({
        error: "Failed to upload movie",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  },
);

router.post(
  "/search-screenshot",
  screenshotUpload.single("screenshot"),
  async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: "No screenshot file provided" });
        return;
      }
      const limit = parseInt(req.body.limit) || 3;
      const screenshotEmbeddings = await generateScreenshotEmbeddings(
        req.file.path,
      );
      if (!screenshotEmbeddings || screenshotEmbeddings.length === 0) {
        res.status(500).json({
          error: "Failed to generate embeddings for screenshot",
        });
        return;
      }
      const { results } = await searchSimilarFrames(
        screenshotEmbeddings,
        limit,
      );
      res.status(200).json({
        message: "Search completed successfully",
        results,
        searchInfo: {
          screenshotProcessed: true,
          embeddingsGenerated: screenshotEmbeddings.length,
          resultsFound: results.length,
          searchParameters: { limit },
        },
      });
    } catch (error) {
      res.status(500).json({
        error: "Internal server error during search",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  },
);

export default router;

