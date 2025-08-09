"""
embeddings-service/main.py

FastAPI microservice for generating image embeddings using OpenCLIP.
Provides endpoints for single image and batch embedding generation.
"""

import os
import io
import logging
import tempfile
from typing import List, Dict, Any
import torch
import open_clip
from PIL import Image
import cv2
from fastapi import FastAPI, HTTPException, UploadFile, File, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn
import chromadb
import uuid
from datetime import datetime
from threading import Lock
import glob
from fastapi.responses import JSONResponse
import subprocess
import json
from dotenv import load_dotenv
from contextlib import asynccontextmanager

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

print("[LOG] main.py module imported (process startup)")
logger.info("[LOG] main.py module imported (process startup)")


def chroma_env_vars():
    """
    Checks if CHROMA_DB_URL is set and not empty.
    Raises a RuntimeError if not.
    """
    chroma_db_url = os.getenv("CHROMA_DB_URL")
    chroma_db_port = os.getenv("CHROMA_DB_PORT")

    if not chroma_db_url or not chroma_db_port:
        print("CHROMA_DB_URL is missing or empty in the env.")
        print("CHROMA_DB_PORT is missing or empty in the .env file.")
        return None, None
    else:
        print("CHROMA DB is on:")
        print(chroma_db_url)
        print("CHROMA PORT is on:")
        print(chroma_db_port)
        return chroma_db_url, chroma_db_port


app = FastAPI(
    title="Movie Video Archive - Embeddings Service",
    description="Microservice for generating image embeddings using OpenCLIP for movies",
    version="1.0.0",
)

logger.info("[LOG] FastAPI app instance created")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

model = None
preprocess = None
device = None

chroma_client = None
collection = None

job_status = {}
job_status_lock = Lock()


class EmbeddingRequest(BaseModel):
    image_paths: List[str]


class EmbeddingResponse(BaseModel):
    embeddings: List[Dict[str, Any]]
    model_info: Dict[str, Any]


class VideoProcessingRequest(BaseModel):
    video_path: str
    output_dir: str
    frame_interval: int = 3


class FramePatch(BaseModel):
    patch_type: str
    x: int
    y: int
    width: int
    height: int
    embedding: List[float]


class ProcessedFrame(BaseModel):
    frame_path: str
    timestamp: int
    patches: List[FramePatch]


class VideoProcessingResponse(BaseModel):
    video_path: str
    frames: List[ProcessedFrame]
    total_frames: int
    model_info: Dict[str, Any]


def load_model():
    """Load OpenCLIP model and preprocessor."""
    global model, preprocess, device

    if model is None:
        logger.info("🤖 Loading OpenCLIP model...")

        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        logger.info(f"📱 Using device: {device}")

        model, _, preprocess = open_clip.create_model_and_transforms(
            model_name="ViT-B-32", pretrained="openai", device=device
        )

        logger.info("✅ OpenCLIP model loaded successfully")

    return model, preprocess


def init_chroma_db():
    """Initialize ChromaDB client and collection."""
    global chroma_client, collection

    if chroma_client is None:
        logger.info("🗄️  Initializing ChromaDB...")
        chroma_db_url, chroma_db_port = chroma_env_vars()

        print("logging chroma db url and port: //////////????>>>")
        print(chroma_db_url)
        print(chroma_db_port)

        if chroma_db_url:
            chroma_client = chromadb.HttpClient(host=chroma_db_url, port=chroma_db_port)
        else:
            chroma_client = chromadb.PersistentClient(path="./chroma_db")

        try:
            collection = chroma_client.get_collection("movie_video_embeddings")
            logger.info(
                f"✅ Connected to existing ChromaDB collection (metric: {getattr(collection, 'metadata', {}).get('metric', 'unknown')})"
            )
        except:
            collection = chroma_client.create_collection(
                name="movie_video_embeddings",
                metadata={"description": "Movie video frame embeddings"},
                embedding_function=None,
                configuration={
                    "hnsw": {
                        "space": "cosine",
                    }
                },
            )
            logger.info("✅ Created new ChromaDB collection with cosine metric")
    return chroma_client, collection


chroma_client_test, collection_test = init_chroma_db()
print("[DEBUG] init_chroma_db() returned:", chroma_client_test, collection_test)


def generate_patch_configs(width: int, height: int):
    """Generate full image, 4 quadrants, and split each quadrant vertically (13 patches total)."""
    mid_x = width // 2
    mid_y = height // 2

    patches = [{"patch_type": "full", "x": 0, "y": 0, "width": width, "height": height}]

    # 4 quadrants
    quadrants = [
        {"patch_type": "top-left", "x": 0, "y": 0, "width": mid_x, "height": mid_y},
        {
            "patch_type": "top-right",
            "x": mid_x,
            "y": 0,
            "width": width - mid_x,
            "height": mid_y,
        },
        {
            "patch_type": "bottom-left",
            "x": 0,
            "y": mid_y,
            "width": mid_x,
            "height": height - mid_y,
        },
        {
            "patch_type": "bottom-right",
            "x": mid_x,
            "y": mid_y,
            "width": width - mid_x,
            "height": height - mid_y,
        },
    ]

    # for each quadrant, split vertically into two
    sub_quadrants = []
    for q in quadrants:
        q_mid_x = q["width"] // 2
        sub_quadrants.append(
            {
                "patch_type": f"{q['patch_type']}-left",
                "x": q["x"],
                "y": q["y"],
                "width": q_mid_x,
                "height": q["height"],
            }
        )
        sub_quadrants.append(
            {
                "patch_type": f"{q['patch_type']}-right",
                "x": q["x"] + q_mid_x,
                "y": q["y"],
                "width": q["width"] - q_mid_x,
                "height": q["height"],
            }
        )

    return patches + quadrants + sub_quadrants


def detect_video_codec(video_path: str) -> str:
    """Detect the video codec using ffprobe."""
    cmd = [
        "ffprobe",
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=codec_name",
        "-of",
        "json",
        video_path,
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        info = json.loads(result.stdout)
        codec = info["streams"][0]["codec_name"]
        return codec
    except Exception as e:
        logger.warning(f"[ffprobe] Could not detect codec for {video_path}: {e}")
        return "h264"  # Default fallback


def extract_every_nth_frame_ffmpeg(
    video_path: str, output_dir: str, n: int = 5
) -> list:
    """Extract every Nth frame using ffmpeg (CPU decode for all codecs). Returns list of frame info dicts."""
    import os

    os.makedirs(output_dir, exist_ok=True)
    cmd = [
        "ffmpeg",
        "-i",
        video_path,
        "-vf",
        f"select='not(mod(n\\,{n}))'",
        "-vsync",
        "0",
        "-pix_fmt",
        "yuv420p",
        os.path.join(output_dir, "frame_%06d.jpg"),
    ]
    logger.info(
        f"[FFMPEG] Extracting every {n}th frame from {video_path} using CPU decode (all codecs)"
    )
    import subprocess

    subprocess.run(cmd, check=True)
    frame_files = sorted([f for f in os.listdir(output_dir) if f.endswith(".jpg")])
    frames = []
    for idx, fname in enumerate(frame_files):
        try:
            ts = int(os.path.splitext(fname)[0].replace("frame_", ""))
        except Exception:
            ts = idx * n
            frames.append(
                {
                    "path": os.path.join(output_dir, fname),
                    "timestamp": ts,
                    "frame_number": idx,
                }
            )
    logger.info(f"[FFMPEG] Extracted {len(frames)} frames from {video_path}")
    return frames


def extract_frames_from_video(
    video_path: str, output_dir: str, frame_interval: int = 5
) -> list:
    """
    Extract frames from video at specified intervals using ffmpeg+NVDEC for maximum performance.
    Returns a list of dicts: {path, timestamp, frame_number}
    """
    return extract_every_nth_frame_ffmpeg(video_path, output_dir, n=frame_interval)


def generate_patch_embeddings(
    frame_path: str, model, preprocess, device
) -> List[FramePatch]:
    """Generate embeddings for all patches of a frame."""
    frame = cv2.imread(frame_path)
    if frame is None:
        raise ValueError(f"Could not load frame: {frame_path}")

    height, width = frame.shape[:2]
    patch_configs = generate_patch_configs(width, height)

    patches = []
    for config in patch_configs:
        try:
            x, y, w, h = config["x"], config["y"], config["width"], config["height"]
            patch = frame[y : y + h, x : x + w]

            patch_rgb = cv2.cvtColor(patch, cv2.COLOR_BGR2RGB)
            pil_patch = Image.fromarray(patch_rgb)

            image_tensor = preprocess(pil_patch).unsqueeze(0).to(device)
            with torch.no_grad():
                image_features = model.encode_image(image_tensor)
                embedding = image_features.cpu().numpy().flatten().tolist()

            patches.append(
                FramePatch(
                    patch_type=config["patch_type"],
                    x=x,
                    y=y,
                    width=w,
                    height=h,
                    embedding=embedding,
                )
            )

        except Exception as e:
            logger.error(f"❌ Error processing patch {config['patch_type']}: {str(e)}")
            continue

    return patches


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("[LOG] Lifespan handler START (before model/db init)")
    global model, preprocess, device, chroma_client, collection
    model, preprocess = load_model()
    chroma_client, collection = init_chroma_db()
    logger.info("[LOG] Lifespan handler END (after model/db init)")
    yield
    logger.info("[LOG] Lifespan handler SHUTDOWN (after yield)")


app.router.lifespan_context = lifespan


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "model_loaded": model is not None,
        "device": str(device) if device else None,
    }


@app.post("/embed/single", response_model=Dict[str, Any])
async def generate_single_embedding(file: UploadFile = File(...)):
    try:
        logger.info(
            f"[EMBED/SINGLE] Received file: {file.filename}, content_type: {file.content_type}"
        )
        contents = await file.read()
        logger.info(f"[EMBED/SINGLE] File size: {len(contents)} bytes")
        from PIL import Image
        import io

        try:
            image = Image.open(io.BytesIO(contents)).convert("RGB")
            logger.info(f"[EMBED/SINGLE] Image loaded: {image.size}")
        except Exception as e:
            logger.error(f"[EMBED/SINGLE] Failed to load image: {str(e)}")
            return {"embeddings": []}

        width, height = image.size
        patch_configs = generate_patch_configs(width, height)
        embeddings = []
        for config in patch_configs:
            patch = image.crop(
                (
                    config["x"],
                    config["y"],
                    config["x"] + config["width"],
                    config["y"] + config["height"],
                )
            )
            image_tensor = preprocess(patch).unsqueeze(0).to(device)
            with torch.no_grad():
                image_features = model.encode_image(image_tensor)
                embedding = image_features.cpu().numpy().flatten().tolist()
            embeddings.append(
                {
                    "patch_type": config["patch_type"],
                    "embedding": embedding,
                    "x": config["x"],
                    "y": config["y"],
                    "width": config["width"],
                    "height": config["height"],
                }
            )
        logger.info(
            f"[EMBED/SINGLE] Returning {len(embeddings)} patch embeddings for screenshot"
        )
        logger.debug(f"[EMBED/SINGLE] Embeddings: {embeddings}")
        return {"embeddings": embeddings}

    except Exception as e:
        logger.error(f"[EMBED/SINGLE] Error in /embed/single: {str(e)}")
        raise


@app.post("/embed/batch", response_model=EmbeddingResponse)
async def generate_batch_embeddings(request: EmbeddingRequest):
    """
    Generate embeddings for multiple images by file paths.
    Args:
        request: List of image file paths
    Returns:
        List of embeddings with metadata
    """
    try:
        embeddings = []
        for image_path in request.image_paths:
            try:
                if not os.path.exists(image_path):
                    logger.warning(f"⚠️  Image file not found: {image_path}")
                    continue
                image = Image.open(image_path).convert("RGB")
                image_tensor = preprocess(image).unsqueeze(0).to(device)
                with torch.no_grad():
                    image_features = model.encode_image(image_tensor)
                    embedding = image_features.cpu().numpy().flatten().tolist()
                embeddings.append(
                    {
                        "path": image_path,
                        "embedding": embedding,
                        "dimensions": len(embedding),
                        "filename": os.path.basename(image_path),
                    }
                )
                logger.info(
                    f"✅ Generated embedding for: {os.path.basename(image_path)}"
                )
            except Exception as e:
                logger.error(f"❌ Error processing {image_path}: {str(e)}")
                continue
        return EmbeddingResponse(
            embeddings=embeddings,
            model_info={
                "model": "open_clip_vit_b_32",
                "device": str(device),
                "total_processed": len(embeddings),
                "total_requested": len(request.image_paths),
            },
        )
    except Exception as e:
        logger.error(f"❌ Error in batch embedding generation: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Failed to generate batch embeddings: {str(e)}"
        )


@app.post("/process-video", response_model=VideoProcessingResponse)
async def process_video(request: VideoProcessingRequest):
    """
    Process a video file: extract frames, generate patches, and create embeddings.
    Args:
        request: Video processing request with path and output directory
    Returns:
        Processed frames with patches and embeddings
    """
    try:
        logger.info(f"🎬 Starting video processing: {request.video_path}")
        extracted_frames = extract_frames_from_video(
            request.video_path, request.output_dir, request.frame_interval
        )
        processed_frames = []
        for frame_data in extracted_frames:
            try:
                logger.info(f"🖼️  Processing frame at {frame_data['timestamp']}s")
                patches = generate_patch_embeddings(
                    frame_data["path"], model, preprocess, device
                )
                processed_frames.append(
                    ProcessedFrame(
                        frame_path=frame_data["path"],
                        timestamp=frame_data["timestamp"],
                        patches=patches,
                    )
                )
                logger.info(f"✅ Processed frame with {len(patches)} patches")
            except Exception as e:
                logger.error(
                    f"❌ Error processing frame {frame_data['path']}: {str(e)}"
                )
                continue
        return VideoProcessingResponse(
            video_path=request.video_path,
            frames=processed_frames,
            total_frames=len(processed_frames),
            model_info={
                "model": "open_clip_vit_b_32",
                "device": str(device),
                "frame_interval": request.frame_interval,
            },
        )
    except Exception as e:
        logger.error(f"❌ Error processing video: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Failed to process video: {str(e)}"
        )


@app.post("/start-process-video")
async def start_process_video(
    request: VideoProcessingRequest, background_tasks: BackgroundTasks
):
    job_id = str(uuid.uuid4())
    with job_status_lock:
        job_status[job_id] = {
            "status": "pending",
            "progress": 0,
            "total": 0,
            "error": None,
        }
    background_tasks.add_task(process_video_job, request, job_id)
    return {"job_id": job_id, "status": "started"}


@app.get("/status/{job_id}")
async def get_status(job_id: str):
    with job_status_lock:
        return job_status.get(job_id, {"status": "unknown"})


@app.get("/jobs")
async def list_jobs():
    with job_status_lock:
        return [{"job_id": job_id, **status} for job_id, status in job_status.items()]


def process_video_job(request, job_id):
    try:
        logger.info(f"[Job {job_id}] Starting video processing: {request.video_path}")

        movie_title = getattr(request, "movieTitle", "Unknown Movie Title")
        director = getattr(request, "director", "Unknown Director")
        movie_url = getattr(request, "movieUrl", "")

        image_exts = ("*.jpg", "*.jpeg", "*.png", "*.webp", "*.bmp")
        frame_files = []
        for ext in image_exts:
            frame_files.extend(glob.glob(os.path.join(request.output_dir, ext)))
        frame_files = sorted(frame_files)
        if frame_files:
            logger.info(
                f"[Job {job_id}] Using {len(frame_files)} existing frames in {request.output_dir}"
            )
            extracted_frames = [
                {
                    "path": frame_path,
                    "timestamp": int(
                        os.path.splitext(os.path.basename(frame_path))[0].replace(
                            "frame_", ""
                        )
                    )
                    if os.path.basename(frame_path).startswith("frame_")
                    else idx * request.frame_interval,
                }
                for idx, frame_path in enumerate(frame_files)
            ]
        else:
            extracted_frames = extract_frames_from_video(
                request.video_path, request.output_dir, request.frame_interval
            )

        total_frames = len(extracted_frames)
        with job_status_lock:
            job_status[job_id]["status"] = "processing"
            job_status[job_id]["total"] = total_frames
            job_status[job_id]["progress"] = 0

        BATCH_SIZE = 20
        batches = [
            extracted_frames[i : i + BATCH_SIZE]
            for i in range(0, total_frames, BATCH_SIZE)
        ]
        for batch_idx, batch in enumerate(batches):
            logger.info(
                f"[Job {job_id}] Embedding batch {batch_idx+1}/{len(batches)} (size {len(batch)})..."
            )
            paths = [f["path"] for f in batch]
            timestamps = [f["timestamp"] for f in batch]
            existing = set()
            if collection is not None:
                try:
                    existing_ids = set(collection.get(ids=paths)["ids"])
                    existing = set(existing_ids)
                except Exception as e:
                    logger.error(
                        f"[Job {job_id}] Error checking existing embeddings: {str(e)}"
                    )
            image_tensors = []
            valid_indices = []
            valid_paths = []
            valid_timestamps = []
            created_ats = []
            vector_ids = []
            patch_vector_ids = []
            patch_embeddings = []
            patch_metadatas = []
            for i, frame_path in enumerate(paths):
                if frame_path in existing:
                    continue
                try:
                    image = Image.open(frame_path).convert("RGB")
                    image_tensor = preprocess(image).unsqueeze(0)
                    frame = cv2.imread(frame_path)
                    if frame is not None:
                        height, width = frame.shape[:2]
                        patch_configs = generate_patch_configs(width, height)
                        for config in patch_configs:
                            x, y, w, h = (
                                config["x"],
                                config["y"],
                                config["width"],
                                config["height"],
                            )
                            patch_type = config["patch_type"]
                            patch = frame[y : y + h, x : x + w]
                            patch_rgb = cv2.cvtColor(patch, cv2.COLOR_BGR2RGB)
                            pil_patch = Image.fromarray(patch_rgb)
                            patch_tensor = preprocess(pil_patch).unsqueeze(0).to(device)
                            with torch.no_grad():
                                patch_features = model.encode_image(patch_tensor)
                                patch_embedding = (
                                    patch_features.cpu().numpy().flatten().tolist()
                                )
                            # deterministic vector ID: {movieTitle}_{timestamp}_{patchType}
                            movie_title_safe = movie_title.replace(" ", "_")
                            vector_id = (
                                f"{movie_title_safe}_{timestamps[i]:06d}_{patch_type}"
                            )
                            patch_vector_ids.append(vector_id)
                            patch_embeddings.append(patch_embedding)
                            patch_metadatas.append(
                                {
                                    "framePath": frame_path,
                                    "timestamp": timestamps[i],
                                    "movieTitle": movie_title,
                                    "director": director,
                                    "movieUrl": movie_url,
                                    "patchType": patch_type,
                                    "x": x,
                                    "y": y,
                                    "width": w,
                                    "height": h,
                                    "createdAt": datetime.utcnow().isoformat(),
                                }
                            )
                except Exception as e:
                    logger.error(f"[Job {job_id}] Error loading {frame_path}: {str(e)}")
            # upsert all patch embeddings in this batch
            if patch_vector_ids:
                try:
                    collection.upsert(
                        ids=patch_vector_ids,
                        embeddings=patch_embeddings,
                        metadatas=patch_metadatas,
                    )
                except Exception as e:
                    logger.error(
                        f"[Job {job_id}] Error upserting patch batch to ChromaDB: {str(e)}"
                    )
            logger.info(f"[Job {job_id}] Finished batch {batch_idx+1}/{len(batches)}")
            with job_status_lock:
                job_status[job_id]["progress"] += len(batch)
        with job_status_lock:
            job_status[job_id]["status"] = "done"
        logger.info(f"[Job {job_id}] Video processing complete.")
    except Exception as e:
        logger.error(f"[Job {job_id}] Error: {str(e)}")
        with job_status_lock:
            job_status[job_id]["status"] = "error"
            job_status[job_id]["error"] = str(e)


@app.post("/vector-db/init")
async def init_vector_db():
    """Initialize the vector database."""
    try:
        return {"status": "success", "message": "Vector database initialized"}
    except Exception as e:
        logger.error(f"❌ Error initializing vector database: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Failed to initialize vector database: {str(e)}"
        )


@app.post("/vector-db/upsert")
async def upsert_vectors(request: dict):
    """Upsert vectors to the database."""
    if collection is None:
        logger.error("ChromaDB collection is not initialized. Cannot upsert vectors.")
        return {"error": "ChromaDB collection not initialized"}
    try:
        vectors = request.get("vectors", [])
        if not vectors:
            raise HTTPException(status_code=400, detail="No vectors provided")

        ids = [v["id"] for v in vectors]
        embeddings = [v["embedding"] for v in vectors]
        metadatas = [v["metadata"] for v in vectors]

        collection.upsert(ids=ids, embeddings=embeddings, metadatas=metadatas)

        logger.info(f"✅ Upserted {len(vectors)} vectors to ChromaDB")
        return {"status": "success", "count": len(vectors)}

    except Exception as e:
        logger.error(f"❌ Error upserting vectors: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Failed to upsert vectors: {str(e)}"
        )


@app.post("/vector-db/query")
async def query_vectors(request: dict):
    """Query similar vectors."""
    if collection is None:
        logger.error("ChromaDB collection is not initialized. Cannot query vectors.")
        return {"error": "ChromaDB collection not initialized"}
    try:
        embedding = request.get("embedding")
        limit = request.get("limit", 10)
        filter_dict = request.get("filter")
        threshold = request.get("threshold", None)

        if not embedding:
            raise HTTPException(status_code=400, detail="No embedding provided")

        results = collection.query(
            query_embeddings=[embedding], n_results=limit, where=filter_dict
        )

        formatted_results = []
        if results["ids"] and results["ids"][0]:
            for i in range(len(results["ids"][0])):
                formatted_results.append(
                    {
                        "id": results["ids"][0][i],
                        "score": results["distances"][0][i]
                        if results["distances"]
                        else 0,
                        "metadata": results["metadatas"][0][i]
                        if results["metadatas"]
                        else {},
                    }
                )

        filtered_results = formatted_results
        if threshold is not None:
            filtered_results = [r for r in formatted_results if r["score"] <= threshold]

        fallback_vectors = []
        if not filtered_results:
            fallback = collection.query(query_embeddings=[embedding], n_results=10)
            if fallback["ids"] and fallback["ids"][0]:
                for i in range(len(fallback["ids"][0])):
                    fallback_vectors.append(
                        {
                            "id": fallback["ids"][0][i],
                            "score": fallback["distances"][0][i]
                            if fallback["distances"]
                            else 0,
                            "metadata": fallback["metadatas"][0][i]
                            if fallback["metadatas"]
                            else {},
                        }
                    )
            logger.info(
                f"[VectorDB] No results above threshold. Fallback top 10: {fallback_vectors}"
            )

        logger.info(
            f"✅ Found {len(filtered_results)} similar vectors (cosine distance threshold: {threshold})"
        )
        return {"results": filtered_results, "fallback": fallback_vectors}

    except Exception as e:
        logger.error(f"❌ Error querying vectors: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Failed to query vectors: {str(e)}"
        )


@app.delete("/vector-db/delete")
async def delete_vectors(request: dict):
    """Delete vectors by frame ID."""
    if collection is None:
        logger.error("ChromaDB collection is not initialized. Cannot delete vectors.")
        return {"error": "ChromaDB collection not initialized"}
    try:
        frame_id = request.get("frameId")
        if not frame_id:
            raise HTTPException(status_code=400, detail="No frame ID provided")

        collection.delete(where={"frameId": frame_id})

        logger.info(f"✅ Deleted vectors for frame {frame_id}")
        return {"status": "success", "message": f"Deleted vectors for frame {frame_id}"}

    except Exception as e:
        logger.error(f"❌ Error deleting vectors: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Failed to delete vectors: {str(e)}"
        )


@app.get("/vector-db/stats")
async def get_db_stats():
    """Get database statistics."""
    if collection is None:
        logger.error("ChromaDB collection is not initialized. Cannot get stats.")
        return {"error": "ChromaDB collection not initialized"}
    try:
        count = collection.count()

        return {
            "total_vectors": count,
            "collection_name": collection.name,
            "status": "healthy",
        }

    except Exception as e:
        logger.error(f"❌ Error getting database stats: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Failed to get database stats: {str(e)}"
        )


@app.get("/debug/embedding/{frame_path:path}")
async def debug_embedding(frame_path: str):
    """Debug endpoint: print the embedding for a given image path."""
    try:
        image = Image.open(frame_path).convert("RGB")
        image_tensor = preprocess(image).unsqueeze(0).to(device)
        with torch.no_grad():
            image_features = model.encode_image(image_tensor)
            embedding = image_features.cpu().numpy().flatten().tolist()
        logger.info(f"[DEBUG] Embedding for {frame_path}: {embedding}")
        return JSONResponse({"embedding": embedding})
    except Exception as e:
        logger.error(f"[DEBUG] Error embedding {frame_path}: {str(e)}")
        return JSONResponse({"error": str(e)}, status_code=500)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8080, log_level="info", reload=True)
