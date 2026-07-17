"use client";

// Theme toggle — cycles through light → dark → system → light.
//
// Three states intentionally: "system" lets users defer to their OS
// preference (which is usually what people want when they care about
// dark mode at all). The init script in layout.tsx reads localStorage
// at first paint, so a stored value (light/dark) overrides the OS;
// the absence of a stored value means "system".
//
// This component is the only thing that writes to data-mode at
// runtime — the init script writes it on first paint, then this
// component owns it. Both write to the same attribute so they stay
// in sync.

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

type Mode = "light" | "dark" | "system";

const STORAGE_KEY = "mreport-theme";
const MODES: Mode[] = ["light", "dark", "system"];

/** Resolve the effective light/dark value for a given mode preference. */
function resolveSystem(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyMode(mode: Mode) {
  if (typeof document === "undefined") return;
  const effective = mode === "system" ? resolveSystem() : mode;
  document.documentElement.setAttribute("data-mode", effective);
}

function readStoredMode(): Mode {
  if (typeof localStorage === "undefined") return "system";
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return "system";
}

// External-store wiring for useSyncExternalStore. The "store" is
// localStorage; we tell React when it changes by listening for the
// browser "storage" event (multi-tab sync) plus a custom event we
// dispatch ourselves on click.
const STORAGE_EVENT = "mreport:theme-change";

function subscribe(notify: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", notify);
  window.addEventListener(STORAGE_EVENT, notify);
  return () => {
    window.removeEventListener("storage", notify);
    window.removeEventListener(STORAGE_EVENT, notify);
  };
}

// SSR snapshot is intentionally "system" — the inline init script in
// layout.tsx will already have set data-mode correctly, and the icon
// placeholder for "system" is a sensible default for the first paint.
const getServerSnapshot = (): Mode => "system";

export function ThemeToggle({ className }: { className?: string }) {
  // useSyncExternalStore reads from localStorage in a way React 19 likes:
  // no setState-in-effect, no SSR mismatch noise, and the UI re-renders
  // automatically when the value changes (other tabs included).
  const mode = useSyncExternalStore(subscribe, readStoredMode, getServerSnapshot);

  // When in "system" mode, follow OS changes live so data-mode stays
  // accurate without needing a click.
  useEffect(() => {
    if (mode !== "system") return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyMode("system");
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [mode]);

  const cycle = useCallback(() => {
    const next = MODES[(MODES.indexOf(mode) + 1) % MODES.length]!;
    try {
      if (next === "system") localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // localStorage can throw in private mode; visual state still updates.
    }
    applyMode(next);
    // Notify the external-store subscribers so the icon re-renders.
    window.dispatchEvent(new Event(STORAGE_EVENT));
  }, [mode]);

  const Icon = mode === "light" ? Sun : mode === "dark" ? Moon : Monitor;
  const label =
    mode === "light"
      ? "Light theme · click for dark"
      : mode === "dark"
        ? "Dark theme · click for system"
        : "System theme · click for light";

  return (
    <button
      type="button"
      onClick={cycle}
      title={label}
      aria-label={label}
      className={cn(
        "text-text-muted hover:bg-panel-2 hover:text-text inline-flex size-8 items-center justify-center rounded-[var(--radius-md)] transition-colors",
        className,
      )}
    >
      <Icon className="size-4" aria-hidden />
    </button>
  );
}
