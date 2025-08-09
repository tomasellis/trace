import { useRef, useState } from "react"

type Sample = { src: string; label: string }

const SAMPLES: Sample[] = [
    { src: "/samples/frame1.jpg", label: "Atlantis: The Lost Empire" },
    { src: "/samples/frame2.jpg", label: "Tarzan" },
    { src: "/samples/frame3.jpg", label: "Emperor's New Groove" },
    { src: "/samples/frame4.jpg", label: "The Lion King" },
    { src: "/samples/frame5.jpg", label: "Treasure Planet" },
]

interface SamplesPickerProps {
    onPickSample: (src: string, label: string) => void
}

export default function SamplesPicker({ onPickSample }: SamplesPickerProps) {
    const [samplesOpen, setSamplesOpen] = useState(false)
    const samplesBtnRef = useRef<HTMLButtonElement>(null)
    const samplesPopRef = useRef<HTMLDivElement>(null)

    const handlePickSample = (src: string, label: string) => {
        setSamplesOpen(false)
        onPickSample(src, label)
    }

    return (
        <>
            {samplesOpen && (
                <div
                    ref={samplesPopRef}
                    id="samples-popover"
                    role="dialog"
                    aria-modal="false"
                    className={[
                        "fixed z-40",
                        "inset-x-3 bottom-4 top-auto translate-y-0",
                        "md:inset-auto md:right-16 md:top-1/2 md:-translate-y-1/2 md:bottom-auto md:translate-x-0",
                        // full width minus margins on mobile; constrained on md+
                        "w-[calc(100vw-1.5rem)] max-w-[420px] md:w-[min(92vw,360px)]",
                        // taller scrollable on mobile; compact on md+
                        "max-h-[70vh] md:max-h-[360px] overflow-y-auto",
                        // looks good
                        "rounded-lg border border-white/10 bg-black/60 backdrop-blur p-3 shadow-xl",
                    ].join(" ")}
                >
                    <div className="mb-2 flex items-center justify-between px-1">
                        <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
                            <span className="text-[11px] tracking-[0.12em] text-white/70">Samples</span>
                        </div>
                        <button
                            type="button"
                            aria-label="Close samples"
                            onClick={() => setSamplesOpen(false)}
                            className="ml-2 inline-flex items-center justify-center rounded-md border border-white/10 bg-white/5 px-2 py-1 text-white/70 hover:text-white hover:bg-white/10 hover:border-white/20 transition"
                        >
                            Close
                        </button>
                    </div>
                    {/* 2 columns on mobile, 3 on small screens and up */}
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                        {SAMPLES.map((s) => (
                            <button
                                key={s.src}
                                onClick={() => handlePickSample(s.src, s.label)}
                                className="group relative overflow-hidden rounded-md border border-white/10 bg-black/50 text-left"
                                aria-label={`Use sample: ${s.label}`}
                            >
                                <img
                                    src={s.src}
                                    alt={`Sample frame: ${s.label}`}
                                    className="aspect-[16/9] w-full object-cover transition group-hover:scale-[1.02] group-hover:opacity-95"
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-black/0" aria-hidden="true" />
                                <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between p-2">
                                    <span className="text-xs text-white/80">{s.label}</span>
                                    {/* <span className="text-[10px] text-amber-300">Insert</span> */}
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            <button
                ref={samplesBtnRef}
                type="button"
                onClick={() => setSamplesOpen((v: boolean) => !v)}
                aria-expanded={samplesOpen}
                aria-controls="samples-popover"
                aria-haspopup="dialog"
                className={[
                    "group fixed right-4 top-1/2 -translate-y-1/2 z-50",
                    "h-28 w-12",
                    "rounded-md border border-white/10 bg-white/5 backdrop-blur",
                    "text-white/80 hover:text-white hover:bg-white/10 hover:border-white/20",
                    "transition shadow-sm overflow-visible"
                ].join(" ")}
                title="Show samples"
            >
                <span
                    className="absolute inset-0 flex items-center justify-center text-[10px] tracking-[0.20em]"
                    style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
                >
                    Samples
                </span>
                {/* Blinking light */}
                <span className="absolute top-1.5 left-1/2 -translate-x-1/2">
                    <span className="block h-2 w-2 rounded-full bg-amber-400/80 shadow-[0_0_12px_rgba(245,158,11,0.6)]" />
                    <span className="absolute inset-0 rounded-full bg-amber-400 animate-ping opacity-50" />
                </span>
                {/* Edge glow on hover */}
                <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-y-0 left-0 w-[2px] bg-gradient-to-b from-transparent via-amber-400/40 to-transparent opacity-0 transition-opacity group-hover:opacity-100"
                />
            </button>
        </>
    )
}

