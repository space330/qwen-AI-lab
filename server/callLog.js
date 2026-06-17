const MAX_ENTRIES = 100;
const entries = [];

export function logCall({ requestId, model, mode, durationMs, status, inputTokens = null, outputTokens = null, errorCode = null }) {
  if (entries.length >= MAX_ENTRIES) entries.shift();
  entries.push({
    requestId,
    time: new Date().toISOString(),
    model,
    mode,
    durationMs,
    status,
    inputTokens,
    outputTokens,
    errorCode: errorCode || null,
  });
}

export function getLog() {
  return [...entries].reverse();
}

export function clearLog() {
  entries.length = 0;
}
