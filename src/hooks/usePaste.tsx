import { useEffect } from "react"

// Paste support
export default function usePaste({ handlePasted, showFlash }: { handlePasted: (blob: File) => void, showFlash: () => void }) {
    return useEffect(() => {
        function onPaste(e: ClipboardEvent) {
            if (!e.clipboardData) return
            const items = Array.from(e.clipboardData.items)
            const imageItem = items.find((i) => i.type.startsWith("image/"))
            if (imageItem) {
                const blob = imageItem.getAsFile()
                if (blob) {
                    handlePasted(blob)
                    showFlash()
                }
            }
        }
        window.addEventListener("paste", onPaste)
        return () => window.removeEventListener("paste", onPaste)
    }, [])
}