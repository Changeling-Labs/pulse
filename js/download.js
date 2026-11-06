// ── Download helper ───────────────────────────────────────
// One place that turns a string into a browser download. Used by the JSON
// backup and the open exports; no network, no storage.

export function downloadText(filename, text, mime = 'text/plain') {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
