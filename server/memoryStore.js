import fs from "node:fs";
import path from "node:path";
import { projectRoot } from "./config.js";

// ============================================================================
// Durable agent memory (V2.2) — a small server-side JSON store backing the
// memory_search / memory_write tools.
//
// Deliberately simple: one JSON file, explicit writes only (memory_write is
// gated behind user confirmation), substring/token scoring for search. Every
// entry keeps provenance (source + createdAt) so memories can be audited and
// pruned. The store is capped; oldest entries fall off first.
// ============================================================================

const DEFAULT_FILE = path.join(projectRoot, "server", "data", "agent-memory.json");
const MAX_ENTRIES = 500;
const SCOPES = ["profile", "project"];
const KINDS = ["preference", "fact", "decision", "task_note"];

let storeFile = DEFAULT_FILE;

// Test hook: point the store at a temp file (returns the previous path).
export function configureMemoryStore(filePath) {
  const previous = storeFile;
  storeFile = filePath || DEFAULT_FILE;
  return previous;
}

export function memoryScopes() {
  return [...SCOPES];
}

export function memoryKinds() {
  return [...KINDS];
}

function load() {
  try {
    const raw = fs.readFileSync(storeFile, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.entries) ? parsed.entries : [];
  } catch {
    return [];
  }
}

function save(entries) {
  fs.mkdirSync(path.dirname(storeFile), { recursive: true });
  fs.writeFileSync(storeFile, JSON.stringify({ version: 1, entries }, null, 2), "utf8");
}

export function writeMemory({ scope, kind, content, source = "user_explicit" }) {
  const cleanScope = SCOPES.includes(scope) ? scope : "project";
  const cleanKind = KINDS.includes(kind) ? kind : "fact";
  const text = String(content || "").trim().slice(0, 500);
  if (!text) throw new Error("memory_write 需要非空的 content。");

  const entries = load();
  // Idempotency: identical scope+content updates the existing entry instead of
  // piling up duplicates.
  const existing = entries.find((item) => item.scope === cleanScope && item.content === text);
  if (existing) {
    existing.kind = cleanKind;
    existing.updatedAt = new Date().toISOString();
    save(entries);
    return { id: existing.id, scope: cleanScope, kind: cleanKind, content: text, updated: true };
  }

  const entry = {
    id: `mem_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    scope: cleanScope,
    kind: cleanKind,
    content: text,
    source: String(source || "user_explicit"),
    createdAt: new Date().toISOString(),
  };
  entries.push(entry);
  while (entries.length > MAX_ENTRIES) entries.shift();
  save(entries);
  return { id: entry.id, scope: entry.scope, kind: entry.kind, content: entry.content, updated: false };
}

export function searchMemory({ query = "", scope = "all", limit = 5 } = {}) {
  const entries = load();
  const cap = Math.min(20, Math.max(1, Number(limit) || 5));
  const scoped = scope === "all" || !SCOPES.includes(scope)
    ? entries
    : entries.filter((item) => item.scope === scope);

  const terms = String(query || "")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  // No query → most recent first (lets the agent "recall what we know").
  if (!terms.length) {
    return scoped.slice(-cap).reverse().map(asMatch(1));
  }

  const scored = scoped
    .map((item) => {
      const haystack = `${item.content} ${item.kind}`.toLowerCase();
      const hits = terms.filter((term) => haystack.includes(term)).length;
      return { item, score: hits / terms.length };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || String(b.item.createdAt).localeCompare(String(a.item.createdAt)));

  return scored.slice(0, cap).map(({ item, score }) => asMatch(score)(item));
}

function asMatch(score) {
  return (item) => ({
    id: item.id,
    scope: item.scope,
    kind: item.kind,
    content: item.content,
    createdAt: item.createdAt,
    score: Math.round(score * 100) / 100,
  });
}

export function clearMemory() {
  save([]);
}
