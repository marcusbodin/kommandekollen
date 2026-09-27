import { renderNotarPreview } from "./notar-browser";
import { NotarPreviewError, parseNotarDom } from "./notar-dom";
import { CollectionError } from "./collector";
import { boundedLocalText, privateOutputPath, SourcePreviewError, writePrivateJson } from "./preview-common";

async function main() {
  const args = process.argv.slice(2);
  let output: string | undefined, html: string | undefined;
  for (let i = 0; i < args.length; i += 2) {
    if (args[i] === "--output" && !output && args[i + 1]) output = args[i + 1];
    else if (args[i] === "--from-html" && !html && args[i + 1]) html = args[i + 1];
    else throw new NotarPreviewError("invalid_output", "Usage: preview-notar --output /private/new-file.json [--from-html /private/captured-dom.html]");
  }
  if (!output) throw new NotarPreviewError("invalid_output", "An absolute private --output path outside the repository is required");
  const target = await privateOutputPath(output);
  let preview;
  if (html) {
    preview = { ...parseNotarDom(await boundedLocalText(html)), observationId: null, observedAt: null, evidence: "local captured DOM; capture time not reasserted" };
  } else preview = await renderNotarPreview();
  await writePrivateJson(target, preview);
  console.log(JSON.stringify({
    kind: preview.kind, ingestible: false, matchedItems: preview.items.length,
    renderedCards: preview.coverage.renderedCards, complete: false, totalAvailable: null,
    warning: "Private partial preview only. No ingestion, source activation or publication permission.",
  }));
}

main().catch(error => {
  // Browser errors may contain URLs or page text; never print raw runtime exceptions.
  console.error(error instanceof NotarPreviewError || error instanceof SourcePreviewError || error instanceof CollectionError ? `Notar preview failed: ${error.code}. ${error.message}`
    : "Notar preview failed: check arguments, local file permissions, and installed Chromium. No preview was reported as successful.");
  process.exitCode = 1;
});
