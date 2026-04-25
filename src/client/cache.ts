/**
 * In-memory TTL cache for read-tool responses. Keys are typically
 * `${tool_name}:${stable_args_hash}`.
 *
 * Restart-volatile by design — for MVP we accept losing the cache on
 * client restart. Persistence can be added later if needed.
 */
export class LocalCache {
  private store = new Map<string, { value: unknown; expiresAt: number }>();

  constructor(private defaultTtlMs: number = 60_000) {}

  get(key: string): { hit: true; value: unknown } | { hit: false } {
    const entry = this.store.get(key);
    if (!entry) return { hit: false };
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return { hit: false };
    }
    return { hit: true, value: entry.value };
  }

  set(key: string, value: unknown, ttlMs?: number): void {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + (ttlMs ?? this.defaultTtlMs),
    });
  }

  invalidate(prefix?: string): void {
    if (!prefix) {
      this.store.clear();
      return;
    }
    for (const key of Array.from(this.store.keys())) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
  }

  size(): number {
    return this.store.size;
  }
}

/** Stable hash of args for cache keys. Insertion-order independent. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0
  );
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}
