/**
 * Loads a classic <script> on demand and resolves once it has executed.
 *
 * The VAD + onnxruntime bundles are ~1MB of parser-blocking JavaScript that
 * only the live interview page needs. Loading them from <head> on every page
 * delayed first paint everywhere, so they are pulled in here instead.
 *
 * Repeat calls for the same src share one in-flight promise.
 */
const cache = new Map<string, Promise<void>>();

export function loadScript(src: string): Promise<void> {
  const existing = cache.get(src);
  if (existing) return existing;

  const promise = new Promise<void>((resolve, reject) => {
    // Survives an earlier module instance or a server-rendered tag.
    const alreadyInDom = document.querySelector<HTMLScriptElement>(
      `script[data-ondemand="${CSS.escape(src)}"]`
    );
    if (alreadyInDom?.dataset.loaded === "true") {
      resolve();
      return;
    }

    const script = alreadyInDom ?? document.createElement("script");
    script.addEventListener("load", () => {
      script.dataset.loaded = "true";
      resolve();
    });
    script.addEventListener("error", () => {
      cache.delete(src);
      reject(new Error(`Failed to load script: ${src}`));
    });

    if (!alreadyInDom) {
      script.src = src;
      script.async = true;
      script.crossOrigin = "anonymous";
      script.dataset.ondemand = src;
      document.head.appendChild(script);
    }
  });

  cache.set(src, promise);
  return promise;
}
