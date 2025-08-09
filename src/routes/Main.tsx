import CinemaBackground from "../components/CinemaBackground";
import ImageSearcher from "../components/ImageUpload";
import SamplesPicker from "../components/SamplesPicker";

export default function Main() {
    const handlePickSample = (src: string, label: string) => {
        // TODO: Handle sample selection - this could trigger the image analysis
        console.log(`Selected sample: ${label} (${src})`)
        // You can integrate this with the ImageSearcher component
        // For now, we'll just log the selection
    }

    return (
        <CinemaBackground>
            <main className="min-h-[100dvh] w-full flex items-center justify-center p-4">
                <div className="w-full max-w-4xl">
                    <header className="mb-6">
                        <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 backdrop-blur">
                            <div className="size-1.5 rounded-full bg-amber-400 shadow-[0_0_16px_rgba(245,158,11,0.8)]" />
                            <span className="text-[11px] uppercase tracking-[0.18em] text-amber-300/90">Trace</span>
                        </div>
                        <h1 className="mt-3 text-3xl md:text-4xl font-semibold tracking-tight">Find where a frame appears in a film</h1>
                        <p className="text-sm text-white/60 mt-1">
                            Paste, drop, or browse an image. We&apos;ll analyze it and return the timestamp in the movie.
                        </p>
                    </header>

                    <ImageSearcher />

                    <footer className="mt-6 text-[11px] text-white/40">
                        Tip: for best results, use a full screen frame.
                    </footer>
                </div>
            </main>

            <SamplesPicker onPickSample={handlePickSample} />
        </CinemaBackground>
    )
}