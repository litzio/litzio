import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import type { HostClient } from "./host-client.ts";

/** Whether the picture has transparent pixels: a fully opaque one has no shape to tint. */
async function hasTransparency(url: string): Promise<boolean> {
  const image = new Image();
  image.src = url;
  await image.decode();
  const size = 32;
  const canvas = document.createElement("canvas");
  canvas.width = size; canvas.height = size;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return false;
  context.drawImage(image, 0, 0, size, size);
  const { data } = context.getImageData(0, 0, size, size);
  for (let index = 3; index < data.length; index += 4) if (data[index]! < 250) return true;
  return false;
}

/**
 * Fetch through the owning Host; blob: is already allowed by the app img-src.
 * `mono` draws the picture's shape in the current text color (Activity bar). A fully opaque
 * picture has no shape to tint, so it keeps the fallback icon there.
 */
export function PluginIcon({ client, plugin, digest, fallback, mono = false }: { client: HostClient; plugin: string; digest?: string; fallback?: ReactNode; mono?: boolean }) {
  const [image, setImage] = useState<{ key: string; url: string }>();
  const key = `${client.url("/")}:${plugin}:${digest}:${mono}`;
  useEffect(() => {
    if (!digest) return;
    const controller = new AbortController(); let url: string | undefined;
    void client.request(`/api/plugins/icon?id=${encodeURIComponent(plugin)}&digest=${encodeURIComponent(digest)}`, { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error("Icon unavailable");
      const blob = await response.blob();
      if (controller.signal.aborted) return;
      url = URL.createObjectURL(blob);
      if (mono && !await hasTransparency(url)) return;
      if (!controller.signal.aborted) setImage({ key, url });
    }).catch(() => { /* Existing bundled icon remains the fallback. */ });
    return () => { controller.abort(); if (url) URL.revokeObjectURL(url); };
  }, [client, plugin, digest, key, mono]);
  if (image?.key !== key) return <>{fallback}</>;
  return mono ? <span className="plugin-icon plugin-icon--mono" style={{ "--plugin-icon-image": `url("${image.url}")` } as CSSProperties} aria-hidden="true" />
    : <img className="plugin-icon" src={image.url} alt="" aria-hidden="true" onError={() => setImage(undefined)} />;
}
