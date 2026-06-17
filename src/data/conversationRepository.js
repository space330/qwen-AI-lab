import { buildLocalTitle, createConversation } from "../utils/conversation.js";

const DB_NAME = "qwen-agent-lab-v12";
const DB_VERSION = 1;
const LEGACY_STATE_KEY = "qwen-agent-lab-ui-state-v6";
const LEGACY_MIGRATION_KEY = "legacy-v6-migrated";

export function createConversationRepository({
  indexedDB = globalThis.indexedDB,
  localStorage = globalThis.localStorage,
} = {}) {
  let backend = null;

  return {
    async init() {
      if (backend) return backend.kind;
      backend = indexedDB ? await createIndexedDbBackend(indexedDB).catch(() => createMemoryBackend()) : createMemoryBackend();
      return backend.kind;
    },
    get storageKind() {
      return backend?.kind || "uninitialized";
    },
    async getProfile() {
      return clone(await (await ready()).get("profiles", "local-user"));
    },
    async putProfile(profile) {
      return (await ready()).put("profiles", profile);
    },
    async getConversation(id) {
      return clone(await (await ready()).get("conversations", id));
    },
    async putConversation(conversation) {
      return (await ready()).put("conversations", conversation);
    },
    async listConversations({ mode = "", search = "" } = {}) {
      const query = String(search || "").trim().toLowerCase();
      const conversations = (await (await ready()).getAll("conversations"))
        .filter((conversation) => !mode || conversation.mode === mode)
        .filter((conversation) => !query || String(conversation.title || "").toLowerCase().includes(query))
        .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
      return clone(conversations);
    },
    async deleteConversation(id) {
      const store = await ready();
      const messages = await store.getAllByIndex("messages", "conversationId", id);
      await Promise.all(messages.map((message) => store.delete("messages", message.id)));
      await store.delete("attachments", id);
      await store.delete("conversations", id);
    },
    async getMessages(conversationId) {
      const messages = await (await ready()).getAllByIndex("messages", "conversationId", conversationId);
      return clone(messages.sort(compareMessages));
    },
    async putMessage(message) {
      return (await ready()).put("messages", message);
    },
    async putMessages(messages) {
      const store = await ready();
      await Promise.all(messages.map((message) => store.put("messages", message)));
    },
    async clearMessages(conversationId) {
      const store = await ready();
      const messages = await store.getAllByIndex("messages", "conversationId", conversationId);
      await Promise.all(messages.map((message) => store.delete("messages", message.id)));
    },
    async getAttachment(conversationId) {
      return clone(await (await ready()).get("attachments", conversationId));
    },
    async putAttachment(attachment) {
      return (await ready()).put("attachments", attachment);
    },
    async deleteAttachment(conversationId) {
      return (await ready()).delete("attachments", conversationId);
    },
    async exportAll() {
      const store = await ready();
      return {
        version: "2.2.0",
        exportedAt: new Date().toISOString(),
        profile: clone(await store.get("profiles", "local-user")),
        conversations: clone(await store.getAll("conversations")),
        messages: clone(await store.getAll("messages")),
        attachments: clone(await store.getAll("attachments")),
      };
    },
    async clearAll() {
      const backendStore = await ready();
      await Promise.all(["profiles", "conversations", "messages", "attachments", "metadata"].map((store) => backendStore.clear(store)));
    },
    async migrateLegacyState() {
      const store = await ready();
      const marker = await store.get("metadata", LEGACY_MIGRATION_KEY);
      if (marker) return { migrated: false, reason: "already_migrated" };

      const raw = localStorage?.getItem?.(LEGACY_STATE_KEY);
      if (!raw) {
        await store.put("metadata", { key: LEGACY_MIGRATION_KEY, completedAt: new Date().toISOString(), empty: true });
        return { migrated: false, reason: "no_legacy_state" };
      }

      let legacy;
      try {
        legacy = JSON.parse(raw);
      } catch {
        return { migrated: false, reason: "invalid_legacy_state" };
      }

      const now = new Date().toISOString();
      const id = createId("conv");
      const firstUserInput = legacy.messages?.find((message) => message.role === "user")?.content || "";
      const conversation = createConversation({
        id,
        title: buildLocalTitle(firstUserInput, legacy.uploadedFile?.name),
        mode: legacy.mode || "chat",
        model: legacy.currentModel || "qwen3.7-max",
        now,
      });
      await store.put("conversations", conversation);

      const messages = (Array.isArray(legacy.messages) ? legacy.messages : []).map((message, index) => ({
        id: message.id || createId("msg"),
        conversationId: id,
        role: message.role,
        type: message.action === "preview-file" ? "file-notice" : "message",
        title: String(message.title || ""),
        content: String(message.content || ""),
        plainText: stripHtml(message.content || ""),
        chartSpec: message.chartSpec || null,
        status: "completed",
        includeInContext: ["user", "assistant"].includes(message.role) && message.action !== "preview-file",
        action: message.action || null,
        time: String(message.time || ""),
        createdAt: new Date(Date.now() + index).toISOString(),
      }));
      await Promise.all(messages.map((message) => store.put("messages", message)));

      if (legacy.uploadedFile) {
        await store.put("attachments", { ...legacy.uploadedFile, conversationId: id });
      }
      await store.put("metadata", { key: LEGACY_MIGRATION_KEY, completedAt: now, conversationId: id });
      return { migrated: true, conversationId: id };
    },
  };

  async function ready() {
    if (!backend) await this?.init?.();
    if (!backend) backend = indexedDB ? await createIndexedDbBackend(indexedDB).catch(() => createMemoryBackend()) : createMemoryBackend();
    return backend;
  }
}

function createMemoryBackend() {
  const stores = new Map(
    ["profiles", "conversations", "messages", "attachments", "metadata"].map((name) => [name, new Map()]),
  );
  const keyFor = (store, value) => (store === "attachments" ? value.conversationId : store === "metadata" ? value.key : value.id);
  return {
    kind: "memory",
    async get(store, key) {
      return stores.get(store).get(key) || null;
    },
    async getAll(store) {
      return [...stores.get(store).values()];
    },
    async getAllByIndex(store, index, value) {
      return [...stores.get(store).values()].filter((item) => item[index] === value);
    },
    async put(store, value) {
      stores.get(store).set(keyFor(store, value), clone(value));
      return value;
    },
    async delete(store, key) {
      stores.get(store).delete(key);
    },
    async clear(store) {
      stores.get(store).clear();
    },
  };
}

async function createIndexedDbBackend(indexedDB) {
  const db = await openDatabase(indexedDB);
  return {
    kind: "indexeddb",
    get: (store, key) => requestResult(db.transaction(store).objectStore(store).get(key)),
    getAll: (store) => requestResult(db.transaction(store).objectStore(store).getAll()),
    getAllByIndex: (store, index, value) =>
      requestResult(db.transaction(store).objectStore(store).index(index).getAll(value)),
    put: (store, value) => transactionResult(db, store, "readwrite", (objectStore) => objectStore.put(value)),
    delete: (store, key) => transactionResult(db, store, "readwrite", (objectStore) => objectStore.delete(key)),
    clear: (store) => transactionResult(db, store, "readwrite", (objectStore) => objectStore.clear()),
  };
}

function openDatabase(indexedDB) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      createStore(db, "profiles", { keyPath: "id" });
      createStore(db, "conversations", { keyPath: "id" }, [
        ["mode", "mode"],
        ["updatedAt", "updatedAt"],
      ]);
      createStore(db, "messages", { keyPath: "id" }, [["conversationId", "conversationId"]]);
      createStore(db, "attachments", { keyPath: "conversationId" });
      createStore(db, "metadata", { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function createStore(db, name, options, indexes = []) {
  if (db.objectStoreNames.contains(name)) return;
  const store = db.createObjectStore(name, options);
  indexes.forEach(([indexName, keyPath]) => store.createIndex(indexName, keyPath, { unique: false }));
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  });
}

function transactionResult(db, storeName, mode, action) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    action(transaction.objectStore(storeName));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

function stripHtml(value) {
  return String(value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function compareMessages(a, b) {
  const byTime = String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
  if (byTime) return byTime;
  const roleOrder = { user: 0, assistant: 1 };
  const byRole = (roleOrder[a.role] ?? 2) - (roleOrder[b.role] ?? 2);
  if (byRole) return byRole;
  return String(a.id || "").localeCompare(String(b.id || ""));
}

function clone(value) {
  if (value === null || value === undefined) return value ?? null;
  return globalThis.structuredClone ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function createId(prefix) {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
