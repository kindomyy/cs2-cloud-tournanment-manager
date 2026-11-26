import { useEffect } from "react";

export function useVisiblePolling(refresh: () => Promise<void>, interval: number) {
  useEffect(() => {
    let stopped = false;
    let running = false;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      if (stopped || document.hidden || running) return;
      running = true;
      try {
        await refresh();
      } finally {
        running = false;
        if (!stopped && !document.hidden) timer = setTimeout(poll, interval);
      }
    }

    function onVisibilityChange() {
      clearTimeout(timer);
      if (!document.hidden) void poll();
    }

    void poll();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [refresh, interval]);
}
