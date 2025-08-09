import { Copy, ImageIcon, Loader2, Upload, X } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import usePaste from "../hooks/usePaste"
import useFlash from "../hooks/useFlash"
import SamplesPicker from "./SamplesPicker"

type MatchResult = {
    timestampSeconds: number
    timecode: string
    confidence: number
}

interface SearchResult {
    id: string;
    score: number;
    metadata: {
        movieTitle: string;
        director: string;
        movieUrl: string;
        framePath: string;
        height: number;
        createdAt: string;
        y: number;
        x: number;
        width: number;
        timestamp: number;
        patchType: string;
    };
}

interface SearchResponse {
    message: string;
    results: SearchResult[];
    searchInfo: {
        screenshotProcessed: boolean;
        embeddingsGenerated: number;
        resultsFound: number;
        searchParameters: {
            limit: number;
            threshold: number;
        };
    };
    fallback?: SearchResult[];
}

const API_URL = import.meta.env.VITE_FULL_API_URL || 'http://localhost:3010';

export default function ImageSearcher() {
    const [file, setFile] = useState<File | null>(null)
    const [preview, setPreview] = useState<string | null>(null)
    const [dragActive, setDragActive] = useState(false)
    const [status, setStatus] = useState<"idle" | "uploading" | "done" | "error">("idle")
    const [progress, setProgress] = useState(0)
    const [result, setResult] = useState<MatchResult | null>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const [isSearching, setIsSearching] = useState(false);
    const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [searchLimit, setSearchLimit] = useState(3);

    const [flash, showFlash] = useFlash()

    const handleNewFile = (f: File) => {
        if (!f.type.startsWith("image/")) {
            showFlash("Unsupported file. Please choose an image.")
            return
        }
        if (f.size > 10 * 1024 * 1024) {
            showFlash("File too large. Max size is 10 MB.")
            return
        }
        setFile(f)
        const url = URL.createObjectURL(f)
        setPreview((prev) => {
            if (prev) URL.revokeObjectURL(prev)
            return url
        })
        setResult(null)
        setStatus("idle")
    }

    usePaste({ handlePasted: handleNewFile, showFlash: () => showFlash("Image pasted. Ready to analyze.") })

    const onDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault()
        e.stopPropagation()
        setDragActive(false)
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleNewFile(e.dataTransfer.files[0])
        }
    }, [])

    const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault()
        e.stopPropagation()
        if (!dragActive) setDragActive(true)
    }
    const onDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault()
        e.stopPropagation()
        setDragActive(false)
    }

    const onBrowseClick = () => fileInputRef.current?.click()

    const onReset = () => {
        setFile(null)
        setResult(null)
        setStatus("idle")
        setProgress(0)
        setSearchResults([])
        if (preview) {
            URL.revokeObjectURL(preview)
            setPreview(null)
        }
        if (fileInputRef.current) fileInputRef.current.value = ""
    }

    const onPickSample = async (src: string, label: string) => {
        console.log({ src, label })
        try {
            setStatus("idle")
            setResult(null)
            setProgress(0)
            const r = await fetch(src)
            const blob = await r.blob()
            const ext = (blob.type && blob.type.split("/")[1]) || "jpg"
            const sampleFile = new File([blob], `${label.replace(/\s+/g, "_").toLowerCase()}.${ext}`, {
                type: blob.type || "image/jpeg",
            })
            handleNewFile(sampleFile)
            showFlash("Sample loaded.")
        } catch {
            showFlash("Failed to load sample.")
        }
    }

    const handleSearch = useCallback(async () => {
        if (!file) {
            setError('Please select a screenshot first');
            return;
        }

        setIsSearching(true);
        setError(null);
        setSearchResults([]);

        try {
            const formData = new FormData();
            formData.append('screenshot', file);
            formData.append('limit', searchLimit.toString());

            console.log('[ScreenshotSearch] Request:', {
                fileName: file.name,
                limit: searchLimit
            });

            const response = await fetch(`${API_URL}/api/videos/search-screenshot`, {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                const errorData = await response.json();
                console.error('[ScreenshotSearch] Error response:', errorData);
                throw new Error(errorData.error || 'Search failed');
            }

            const data: SearchResponse = await response.json();
            console.log('[ScreenshotSearch] Response:', data);
            setSearchResults(data.results ? data.results : data.fallback ?? []);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Search failed');
            console.error('[ScreenshotSearch] Fetch error:', err);
        } finally {
            setIsSearching(false);
        }
    }, [file, searchLimit, API_URL]);

    useEffect(() => {
        if (error) {
            showFlash(error)
            setError(null)
        }
    }, [
        error
    ])

    function formatTimestampHMS(seconds: number): string {
        if (isNaN(seconds) || seconds < 0) return '00:00';
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        if (h > 0) {
            return [h, m, s].map(v => v.toString().padStart(2, '0')).join(':');
        } else {
            return [m, s].map(v => v.toString().padStart(2, '0')).join(':');
        }
    }

    const dropClasses = useMemo(
        () =>
            [
                "relative flex items-center justify-center w-full rounded-lg border border-dashed transition",
                "h-[320px] md:h-[360px]",
                dragActive
                    ? "border-amber-400/60 bg-amber-400/[0.06] shadow-[0_0_0_4px_rgba(245,158,11,0.08)]"
                    : "border-white/20 hover:border-amber-400/60 hover:bg-amber-400/[0.06] hover:shadow-[0_0_0_4px_rgba(245,158,11,0.08)]",
                "cursor-pointer overflow-hidden bg-transparent",
            ].join(" "),
        [dragActive]
    )

    return (
        <>
            <SamplesPicker onPickSample={onPickSample} />
            <section className="relative border border-white/10 bg-white/5 backdrop-blur rounded-xl">
                <div className="p-5 border-b border-white/10">
                    <h3 className="text-lg font-semibold">Upload or paste an image</h3>
                    <p className="text-white/60 text-sm mt-1">Drop a file, press {"'Cmd/Ctrl+V'"} to paste, or browse your device.</p>
                </div>

                <div className="p-5">
                    {/* unified dropzone + preview box */}
                    <div
                        role="button"
                        aria-label="Image dropzone"
                        tabIndex={0}
                        onClick={onBrowseClick}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") "browse()"
                        }}
                        onDrop={onDrop}
                        onDragOver={onDragOver}
                        onDragLeave={onDragLeave}
                        className={dropClasses}
                    >
                        {preview && (
                            <>
                                <img
                                    src={preview}
                                    alt="Selected image"
                                    className="absolute inset-0 h-full w-full object-contain"
                                    aria-live="polite"
                                    aria-atomic="true"
                                />
                                <div
                                    aria-hidden="true"
                                    className="pointer-events-none absolute inset-0"
                                    style={{
                                        background:
                                            "linear-gradient(to top, rgba(0,0,0,0.35), rgba(0,0,0,0.0) 30%, rgba(0,0,0,0.0) 70%, rgba(0,0,0,0.25))",
                                    }}
                                />
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        onReset()
                                    }}
                                    aria-label="Remove image"
                                    className="absolute left-2 top-2 inline-flex items-center justify-center rounded-md border border-white/10 bg-white/10 px-2 py-1 text-white/80 hover:text-white hover:bg-white/20 transition"
                                >
                                    <X className="mr-1 size-3.5" />
                                    <span className="text-[11px]">Clear</span>
                                </button>
                            </>
                        )}

                        {!preview && (
                            <div className="relative z-10 flex flex-col items-center gap-3 text-center">
                                <ImageIcon className="size-6 text-white/60" aria-hidden="true" />
                                <div className="text-sm">
                                    <span className="font-medium text-amber-300">Drop image</span> or click to browse
                                </div>
                                <div className="text-xs text-white/50">You can also paste from clipboard</div>
                            </div>
                        )}

                        {/* hidden input */}
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            className="sr-only"
                            aria-label="Choose image file"
                            onChange={(e) => {
                                if (e.target.files && e.target.files[0]) {
                                    handleNewFile(e.target.files[0])
                                }
                            }}
                        />

                        {/* soft inner glow */}
                        <div
                            aria-hidden="true"
                            className="pointer-events-none absolute inset-0 rounded-lg"
                            style={{
                                background: "radial-gradient(800px 200px at 50% 0%, rgba(245,158,11,0.06), rgba(245,158,11,0) 60%)",
                            }}
                        />
                    </div>

                    {/* uploading */}
                    {status === "uploading" && (
                        <div className="mt-6">
                            <div className="flex items-center gap-2 text-sm text-white/70">
                                <Loader2 className="size-4 animate-spin text-amber-300" />
                                Analyzing image...
                            </div>
                            <div className="mt-2 h-2 w-full rounded bg-white/10 overflow-hidden">
                                <div className="h-full bg-amber-400 transition-[width] duration-200" style={{ width: `${progress}%` }} />
                            </div>
                        </div>
                    )}

                    {/* error */}
                    {status === "error" && (
                        <div className="mt-6 rounded-md border border-red-500/40 bg-red-500/10 p-3 text-red-200 text-sm">
                            Something went wrong. Please try again, or use a different image.
                        </div>
                    )}

                    {/* result */}
                    {result && status === "done" && (
                        <div className="mt-6 rounded-lg border border-white/10 bg-black/40 backdrop-blur">
                            <div className="p-4 border-b border-white/10">
                                <div className="text-base font-medium">Match result</div>
                                <div className="text-white/60 text-sm">We found the most likely position in the film.</div>
                            </div>
                            <div className="p-4 grid gap-3">
                                <div className="flex flex-wrap items-center gap-3">
                                    <div className="text-3xl md:text-4xl font-semibold tabular-nums text-amber-300 drop-shadow-[0_0_24px_rgba(245,158,11,0.25)]">
                                        {result.timecode}
                                    </div>
                                    <span className="inline-flex items-center rounded border border-amber-400/30 bg-amber-400/15 px-2 py-1 text-xs text-amber-300">
                                        {Math.round(result.confidence * 100)}% confidence
                                    </span>
                                </div>
                                <div className="text-sm text-white/60">
                                    {"Movie length: "}
                                    <span className="tabular-nums text-white/80">TIMECODE</span>
                                    {" • Position: "}
                                    <span className="tabular-nums text-white/80">TIMECODE</span>
                                </div>
                                <div className="h-px bg-white/10" aria-hidden="true" />
                                <div className="flex flex-wrap gap-2">
                                    <button
                                        onClick={() => { }}
                                        className="inline-flex items-center rounded-md bg-amber-400 px-3 py-1.5 text-sm font-medium text-black hover:bg-amber-300 transition"
                                    >
                                        <Copy className="mr-2 size-4" />
                                        Copy timestamp
                                    </button>
                                    <button
                                        onClick={() => handleSearch()}
                                        className="inline-flex items-center rounded-md border border-amber-400/30 px-3 py-1.5 text-sm font-medium text-amber-300 hover:bg-amber-400/10 transition"
                                    >
                                        Analyze another
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {searchResults.length > 0 && (
                        <div className="mt-6 rounded-lg border border-white/10 bg-black/40 backdrop-blur">
                            <div className="p-4 border-b border-white/10">
                                <div className="text-base font-medium">Search Results</div>
                                <div className="text-white/60 text-sm">Top matches found for your screenshot.</div>
                            </div>
                            <div className="p-4 space-y-4">
                                {/* top result */}
                                {searchResults[0] && (
                                    <div className="p-4 rounded-lg border border-amber-400/30 bg-amber-400/10">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-sm font-medium text-amber-300">1st Place</span>
                                            <span className="text-xs text-amber-400/70">Score: {((1 - searchResults[0].score) * 100).toFixed(2)}%</span>
                                        </div>
                                        <div className="text-2xl font-semibold text-amber-300 tabular-nums">
                                            {formatTimestampHMS(searchResults[0].metadata.timestamp)}
                                        </div>
                                        <div className="text-sm text-white/60 mt-1">
                                            {searchResults[0].metadata.movieTitle} • {searchResults[0].metadata.director}
                                        </div>
                                    </div>
                                )}

                                {/* compact display */}
                                {searchResults.slice(1, 3).map((result, index) => (
                                    <div key={result.id} className="flex items-center justify-between p-3 rounded-lg border border-white/10 bg-white/5">
                                        <div className="flex items-center gap-3">
                                            <span className="text-sm font-medium text-white/70">#{index + 2}</span>
                                            <div className="text-lg font-semibold text-white tabular-nums">
                                                {formatTimestampHMS(result.metadata.timestamp)}
                                            </div>
                                        </div>
                                        <span className="text-xs text-white/60">
                                            {((1 - result.score) * 100).toFixed(2)}% match
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* footer */}
                <div className="p-5 border-t border-white/10">
                    <div className="text-xs text-white/50">Tip: You can press {"'Cmd/Ctrl + V'"} to paste an image directly from your clipboard.</div>
                    <div className="mt-3 flex gap-2">
                        <button
                            onClick={handleSearch}
                            disabled={!file || isSearching}
                            className={[
                                "inline-flex items-center rounded-md bg-amber-400 px-4 py-2 text-sm font-medium text-black hover:bg-amber-300 transition",
                                "disabled:opacity-60 disabled:cursor-not-allowed",
                            ].join(" ")}
                        >
                            {isSearching ? (
                                <>
                                    <Loader2 className="mr-2 size-4 animate-spin" />
                                    Searching...
                                </>
                            ) : (
                                <>
                                    <Upload className="mr-2 size-4" />
                                    Search image
                                </>
                            )}
                        </button>
                    </div>
                </div>

                {/* notice pill */}
                {flash && (
                    <div className="pointer-events-none absolute right-3 top-3 z-10 rounded-full border border-white/10 bg-black/60 px-3 py-1 text-xs text-white/80 backdrop-blur">
                        {flash}
                    </div>
                )}
            </section></>)
}