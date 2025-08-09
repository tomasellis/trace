import { useState, useEffect } from "react";

function useFlash() {
    const [flash, setFlash] = useState<string | null>(null);

    useEffect(() => {
        if (!flash) return;

        const id = window.setTimeout(() => {
            setFlash(null);
        }, 3000);

        return () => window.clearTimeout(id);
    }, [flash]);

    const showFlash = (message: string) => {
        setFlash(message);
    };


    return [
        showFlash,
    ]
}

export default useFlash;