import { basename } from "node:path";
import { isMainThread, Worker } from "node:worker_threads";

// The fixture accepts the user's text on the candidate path, then injects an
// empty paragraph into the same request on the full path, as in the HTTP test.
if (isMainThread) {
  const post = Worker.prototype.postMessage;
  const retry = new Set();
  const reject = request => ({ ...request, paragraphs: request.paragraphs.map(edit => ({ ...edit, content: [] })) });
  Worker.prototype.postMessage = function (message, ...args) {
    if (message.kind === "verify-local-write") {
      const { save } = message;
      const file = basename(save.path);
      if (file === "local-write-closed.md" || file === "local-write-rejected.md") {
        if (file === "local-write-rejected.md") retry.add(save.path);
        message = { ...message, save: { ...save, request: reject(save.request) } };
      }
    } else if (message.kind === "save" && retry.delete(message.path)) {
      message = { ...message, request: reject(message.request) };
    }
    return post.call(this, message, ...args);
  };
}
