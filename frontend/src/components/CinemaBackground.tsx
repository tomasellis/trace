export default function CinemaBackground({ children }: { children: React.ReactNode }) {
    return (
        <div
            className={[
                "relative min-h-[100dvh] w-full overflow-hidden",
                "bg-[radial-gradient(1200px_600px_at_50%_-100px,#0b0b0b_0%,#090909_40%,#050505_70%,#000_100%)]",
            ].join(" ")}
        >
            <div
                aria-hidden="true"
                className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 h-[480px] w-[840px] rounded-full blur-3xl"
                style={{
                    background:
                        "radial-gradient(closest-side, rgba(245,158,11,0.16), rgba(245,158,11,0.06) 40%, rgba(245,158,11,0) 70%)",
                }}
            />
            <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 opacity-[0.06] mix-blend-overlay"
                style={{
                    backgroundImage: "url('/images/grain.png')",
                    backgroundSize: "600px",
                    backgroundRepeat: "repeat",
                }}
            />
            <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0"
                style={{
                    background:
                        "radial-gradient(ellipse at center, rgba(0,0,0,0) 40%, rgba(0,0,0,0.2) 70%, rgba(0,0,0,0.45) 100%)",
                }}
            />
            <div className="relative">{children}</div>
        </div>
    )
}
