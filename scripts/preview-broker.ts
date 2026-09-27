import { CollectionError } from "./collector";
import { parseBrokerCapture, parseBrokerHtml, renderBrokerPreview } from "./broker-browser";
import { boundedLocalText, privateOutputPath, SourcePreviewError, writePrivateJson } from "./preview-common";

async function main() {
  const args = process.argv.slice(2), values = new Map<string, string>();
  for (let i = 0; i < args.length; i += 2) {
    if (!["--source", "--output", "--from-html", "--from-capture", "--capture-output"].includes(args[i])
      || values.has(args[i]) || !args[i + 1]) throw new SourcePreviewError("invalid_output", "Invalid preview arguments");
    values.set(args[i], args[i + 1]);
  }
  const source = values.get("--source"), output = values.get("--output"), html = values.get("--from-html");
  const saved = values.get("--from-capture"), captureOutput = values.get("--capture-output");
  if (!output || (source !== "husmanhagberg" && source !== "mohv") || (html && saved) || (captureOutput && (html || saved)))
    throw new SourcePreviewError("invalid_output", "Use --source husmanhagberg|mohv --output /private/new.json with optional --from-html, --from-capture, or live --capture-output");
  const target = await privateOutputPath(output), captureTarget = captureOutput ? await privateOutputPath(captureOutput) : null;
  if (captureTarget === target) throw new SourcePreviewError("invalid_output", "Preview and capture need different new files");
  let preview;
  if (saved) {
    let value: unknown;
    try { value = JSON.parse(await boundedLocalText(saved, 1_100_000)); }
    catch (error) {
      if (error instanceof SyntaxError) throw new SourcePreviewError("invalid_dom", "Invalid local capture JSON");
      throw error;
    }
    preview = parseBrokerCapture(value);
    if (preview.sourceId !== source) throw new SourcePreviewError("invalid_dom", "Capture belongs to another source");
  } else if (html) {
    preview = { ...parseBrokerHtml(source, await boundedLocalText(html)), evidence: "local DOM only; capture identity, time and full rendered count unknown" };
  } else {
    const result = await renderBrokerPreview(source);
    if (captureTarget) await writePrivateJson(captureTarget, result.capture);
    preview = { ...result.preview, traffic: result.traffic };
  }
  await writePrivateJson(target, preview);
  console.log(JSON.stringify({
    kind: preview.kind, ingestible: false, matchedItems: preview.items.length,
    renderedCards: preview.coverage.renderedCards, sampledCards: preview.coverage.sampledCards,
    windowLimit: preview.coverage.windowLimit, truncated: preview.coverage.truncated,
    complete: false, totalAvailable: null,
    warning: "Private partial preview only. No ingestion, source activation or publication permission.",
  }));
}

main().catch(error => {
  console.error(error instanceof SourcePreviewError || error instanceof CollectionError
    ? `Broker preview failed: ${error.code}. ${error.message}`
    : "Broker preview failed: check arguments, local file permissions, and installed Chromium. No preview was reported as successful.");
  process.exitCode = 1;
});
