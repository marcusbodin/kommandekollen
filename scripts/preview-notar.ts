import { lstat, realpath, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { renderNotarPreview } from "./notar-browser";
import { NotarPreviewError, parseNotarDom } from "./notar-dom";
import { CollectionError, LIMITS } from "./collector";

async function main() {
  const args = process.argv.slice(2);
  let output: string | undefined, html: string | undefined;
  for (let i = 0; i < args.length; i += 2) {
    if (args[i] === "--output" && !output && args[i + 1]) output = args[i + 1];
    else if (args[i] === "--from-html" && !html && args[i + 1]) html = args[i + 1];
    else throw new NotarPreviewError("invalid_output", "Usage: preview-notar --output /private/new-file.json [--from-html /private/captured-dom.html]");
  }
  if (!output || !isAbsolute(output)) throw new NotarPreviewError("invalid_output", "An absolute private --output path outside the repository is required");
  const repository = await realpath(fileURLToPath(new URL("../", import.meta.url)));
  const target = resolve(await realpath(dirname(output)), output.split(sep).at(-1)!);
  const within = relative(repository, target);
  if (!within || (!within.startsWith(`..${sep}`) && !isAbsolute(within)))
    throw new NotarPreviewError("invalid_output", "Real preview data must not be written inside the repository");
  try {
    await lstat(target);
    throw new NotarPreviewError("invalid_output", "Choose a new output file; existing files and symlinks are never overwritten");
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  }
  let preview;
  if (html) {
    const metadata = await stat(html);
    if (metadata.size > LIMITS.bodyBytes) throw new NotarPreviewError("limit", "Captured DOM exceeds 500 KB");
    preview = { ...parseNotarDom(await readFile(html, "utf8")), evidence: "local captured DOM; capture time not reasserted" };
  } else preview = await renderNotarPreview();
  await writeFile(target, JSON.stringify(preview, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  console.log(JSON.stringify({
    kind: preview.kind, ingestible: false, matchedItems: preview.items.length,
    renderedCards: preview.coverage.renderedCards, complete: false, totalAvailable: null,
    warning: "Private partial preview only. No ingestion, source activation or publication permission.",
  }));
}

main().catch(error => {
  // Browser errors may contain URLs or page text; never print raw runtime exceptions.
  console.error(error instanceof NotarPreviewError || error instanceof CollectionError ? `Notar preview failed: ${error.code}. ${error.message}`
    : "Notar preview failed: check arguments, local file permissions, and installed Chromium. No preview was reported as successful.");
  process.exitCode = 1;
});
