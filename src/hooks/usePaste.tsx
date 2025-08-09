import { useEffect } from "react"
import useFlash from "./useFlash"

// Paste support
export default function usePaste({ handlePasted }: { handlePasted: (blob: File) => void }) {

    const [showFlash] = useFlash()

    return useEffect(() => {
        function onPaste(e: ClipboardEvent) {
            if (!e.clipboardData) return
            const items = Array.from(e.clipboardData.items)
            const imageItem = items.find((i) => i.type.startsWith("image/"))
            if (imageItem) {
                const blob = imageItem.getAsFile()
                if (blob) {
                    handlePasted(blob)
                    showFlash("Image pasted. Ready to analyze.")
                }
            }
        }
        window.addEventListener("paste", onPaste)
        return () => window.removeEventListener("paste", onPaste)
    }, [])
}