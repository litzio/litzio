import { useEffect, useRef, useState } from "react";
import type { DesktopBridge } from "../../shared/desktop-bridge.ts";

export function useTabFullscreen(desktop: DesktopBridge | undefined, onError: (error: unknown) => void) {
  const [fullscreen, setFullscreen] = useState(false);
  const [changing, setChanging] = useState(false);
  const pending = useRef(false);
  const nativeVersion = useRef(0);

  useEffect(() => {
    if (!desktop?.fullScreen || !desktop.onFullScreen) return;
    let active = true;
    const version = nativeVersion.current;
    const unsubscribe = desktop.onFullScreen(enabled => {
      nativeVersion.current++;
      setFullscreen(enabled);
    });
    void desktop.fullScreen().then(enabled => {
      if (active && version === nativeVersion.current) setFullscreen(enabled);
    }).catch(error => { if (active) onError(error); });
    return () => { active = false; unsubscribe(); };
  }, [desktop, onError]);

  function setTabFullscreen(enabled: boolean): void {
    if (pending.current || fullscreen === enabled) return;
    if (!desktop?.setFullScreen) {
      setFullscreen(enabled);
      return;
    }
    pending.current = true;
    setChanging(true);
    const version = ++nativeVersion.current;
    void desktop.setFullScreen(enabled).then(actual => {
      if (version === nativeVersion.current) setFullscreen(actual);
    }).catch(onError).finally(() => {
      pending.current = false;
      setChanging(false);
    });
  }
  return { fullscreen, changing, setTabFullscreen };
}
