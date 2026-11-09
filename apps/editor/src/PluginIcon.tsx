import { useEffect, useState, type ReactNode } from "react";
import type { HostClient } from "./host-client.ts";
/** Fetch through the owning Host; blob: is already allowed by the app img-src. */
export function PluginIcon({ client, plugin, digest, fallback }: { client: HostClient; plugin: string; digest?: string; fallback?: ReactNode }) {
  const [image, setImage] = useState<{ key: string; url: string }>();
  const key = `${client.url("/")}:${plugin}:${digest}`;
  useEffect(() => {
    if (!digest) return;
    const controller = new AbortController(); let url: string | undefined;
    void client.request(`/api/plugins/icon?id=${encodeURIComponent(plugin)}&digest=${encodeURIComponent(digest)}`, { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error("Icon unavailable");
      const blob = await response.blob();
      if (controller.signal.aborted) return;
      url = URL.createObjectURL(blob); setImage({ key, url });
    }).catch(() => { /* Existing bundled icon remains the fallback. */ });
    return () => { controller.abort(); if (url) URL.revokeObjectURL(url); };
  }, [client, plugin, digest, key]);
  return image?.key === key ? <img className="plugin-icon" src={image.url} alt="" aria-hidden="true" onError={() => setImage(undefined)} /> : <>{fallback}</>;
}
