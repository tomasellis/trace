# Trace - AI-Powered Video Frame Search

Trace is an application that enables users to find specific frames within video content using image similarity search. The system processes video frames, generates embeddings, and provides a search interface to locate where specific images appear in videos.

## Architecture Overview

The project consists of three microservices:

### 1. Frontend Service (React + Vite)

**Location**: `frontend/`

**Tech Stack**:
- **Framework**: React 19 with TypeScript
- **Build Tool**: Vite 7
- **Styling**: Tailwind CSS 4
- **Routing**: React Router DOM 7
- **Icons**: Lucide React
- **Development**: ESLint, TypeScript ESLint

**Key Features**:
- Modern, responsive UI with cinema-themed design
- Image upload via drag & drop, paste, or file browser
- Real-time image search interface
- Mobile-optimized layout

**Architecture**:
- Component-based structure with hooks for state management
- Custom hooks for flash messages and paste functionality
- Modular routing system
- Responsive design with Tailwind CSS utilities

### 2. Backend Service (Node.js + Express)

**Location**: `backend/`

**Tech Stack**:
- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js 5
- **Vector Database**: ChromaDB
- **AI/ML**: OpenAI API, Xenova Transformers
- **Video Processing**: FFmpeg (fluent-ffmpeg)
- **File Handling**: Multer for multipart uploads
- **Development**: Nodemon, ts-node

**Key Features**:
- RESTful API endpoints for video management
- Video upload and processing pipeline
- Integration with embedding service
- Vector database operations
- Bulk video import capabilities

**Architecture**:
- Express.js middleware stack with CORS support
- Modular route structure
- Environment-based configuration
- Error handling middleware
- Background task processing

### 3. Embeddings Service (Python + FastAPI)

**Location**: `embeddings-service/`

**Tech Stack**:
- **Framework**: FastAPI with Python 3.11+
- **AI/ML**: PyTorch, OpenCLIP, OpenCV
- **Vector Database**: ChromaDB
- **Image Processing**: Pillow (PIL), NumPy
- **Video Processing**: FFmpeg integration
- **Async Support**: Uvicorn with standard extras
- **Development**: uv package manager

**Key Features**:
- Image embedding generation using OpenCLIP models
- Video frame extraction and processing
- Patch-based embedding generation for detailed analysis
- Vector database operations (ChromaDB)
- Background job processing for video analysis
- RESTful API with comprehensive endpoints

**Architecture**:
- FastAPI with lifespan management for model initialization
- Background task processing
- Comprehensive error handling and logging
- CORS middleware support
- Modular endpoint structure

## Core Functionality

### Video Processing Pipeline
1. **Upload**: Videos are uploaded through the frontend
2. **Frame Extraction**: FFmpeg extracts frames at configurable intervals
3. **Embedding Generation**: OpenCLIP generates embeddings for each frame
4. **Vector Storage**: Embeddings are stored in ChromaDB for similarity search
5. **Search Interface**: Users can search for frames using image similarity

### AI/ML Capabilities
- **OpenCLIP Models**: State-of-the-art image understanding
- **Patch-based Analysis**: Detailed frame analysis using grid patches
- **Vector Similarity**: Fast similarity search using ChromaDB
- **Batch Processing**: Efficient handling of multiple images/videos

### Data Flow
```
Frontend → Backend → Embeddings Service → Vector Database
    ↑                                         ↓
    ←────────── Search Results ←──────────────┘
```

## Development Setup TODO
