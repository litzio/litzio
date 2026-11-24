// Spike pi extension: carries audio to Ollama's /v1/chat/completions `input_audio` part.
// Two entry routes, both ending in a text marker that the request hook replaces with audio bytes:
//  A. (no patch) an ACP resource_link to a .wav file: the adapter turns it into
//     `[resource_link name="x.wav" path="C:\\...\\x.wav"]` in the user text.
//  B. (adapter patch) an ACP audio block, which the patched adapter carries as an "image" with an audio mimeType.
//     The `input` hook runs before pi's image normalization (which would drop non-images), saves the bytes to a
//     file and replaces them with a `[litzio-audio path="..."]` marker, so the history keeps a path, not bytes.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

const AUDIO_EXT = { ".wav": "wav", ".mp3": "mp3" };
const MARKER = /\[(?:litzio-audio|resource_link name="[^"]*") path=("(?:[^"\\]|\\.)*")\]/g;

export default function litzioAudio(pi) {
  const dir = process.env.LITZIO_PI_AUDIO_DIR ?? path.join(process.cwd(), ".litzio-audio");
  pi.on("input", async event => {
    const audio = (event.images ?? []).filter(image => image.mimeType?.startsWith("audio/"));
    if (!audio.length) return { action: "continue" };
    mkdirSync(dir, { recursive: true });
    const markers = audio.map(image => {
      const bytes = Buffer.from(image.data, "base64");
      const file = path.join(dir, `${createHash("sha256").update(bytes).digest("hex").slice(0, 16)}${image.mimeType === "audio/mpeg" ? ".mp3" : ".wav"}`);
      writeFileSync(file, bytes);
      return `[litzio-audio path=${JSON.stringify(file)}]`;
    });
    return { action: "transform", text: [event.text, ...markers].filter(Boolean).join("\n"), images: event.images.filter(image => !audio.includes(image)) };
  });
  pi.on("before_provider_request", event => {
    const payload = event.payload;
    if (!payload || !Array.isArray(payload.messages)) return undefined;
    let changed = false;
    for (const message of payload.messages) {
      if (message.role !== "user") continue;
      const parts = typeof message.content === "string" ? [{ type: "text", text: message.content }] : message.content;
      if (!Array.isArray(parts)) continue;
      const added = [];
      for (const part of parts) {
        if (part.type !== "text") continue;
        for (const match of part.text.matchAll(MARKER)) {
          const file = JSON.parse(match[1]), format = AUDIO_EXT[path.extname(file).toLowerCase()];
          if (!format) continue;
          try { added.push({ type: "input_audio", input_audio: { data: readFileSync(file).toString("base64"), format } }); }
          catch { /* missing file: the text marker stays, the model sees no audio */ }
        }
      }
      if (added.length) { message.content = [...parts, ...added]; changed = true; }
    }
    return changed ? payload : undefined;
  });
}
