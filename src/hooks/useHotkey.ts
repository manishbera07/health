import { useEffect } from "react";

type Handler = (e: KeyboardEvent) => void;

export const useHotkey = (combo: string, handler: Handler, enabled = true) => {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      const parts = combo.toLowerCase().split("+");
      const key = parts.pop()!;
      const needCtrl = parts.includes("ctrl") || parts.includes("cmd");
      const needShift = parts.includes("shift");
      if (e.key.toLowerCase() !== key) return;
      if (needCtrl && !(e.ctrlKey || e.metaKey)) return;
      if (needShift && !e.shiftKey) return;
      handler(e);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [combo, handler, enabled]);
};
