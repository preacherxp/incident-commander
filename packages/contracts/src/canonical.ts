const MAX_DEPTH = 64;

type JsonPrimitive = string | number | boolean | null;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function canonicalize(value: unknown, depth: number, seen: WeakSet<object>): string | undefined {
  if (depth > MAX_DEPTH) throw new TypeError("canonicalJson: maximum depth exceeded");
  if (value === null) return "null";
  switch (typeof value) {
    case "string":
      return JSON.stringify(value);
    case "boolean":
      return value ? "true" : "false";
    case "number": {
      if (!Number.isFinite(value)) throw new TypeError("canonicalJson: nonfinite number");
      if (!Number.isSafeInteger(value) && Number.isInteger(value)) {
        throw new TypeError("canonicalJson: unsafe integer");
      }
      return JSON.stringify(value);
    }
    case "undefined":
      throw new TypeError("canonicalJson: undefined is not supported");
    case "function":
    case "symbol":
    case "bigint":
      throw new TypeError(`canonicalJson: unsupported value type ${typeof value}`);
    case "object": {
      if (Array.isArray(value)) {
        if (seen.has(value)) throw new TypeError("canonicalJson: cycle detected");
        seen.add(value);
        const parts: string[] = [];
        for (const item of value) {
          const encoded = canonicalize(item, depth + 1, seen);
          if (encoded === undefined) throw new TypeError("canonicalJson: undefined array entry");
          parts.push(encoded);
        }
        seen.delete(value);
        return `[${parts.join(",")}]`;
      }
      if (!isPlainObject(value)) {
        throw new TypeError("canonicalJson: only plain objects are supported");
      }
      if (seen.has(value)) throw new TypeError("canonicalJson: cycle detected");
      seen.add(value);
      const keys = Object.keys(value).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
      const parts: string[] = [];
      for (const key of keys) {
        const entry = (value as Record<string, unknown>)[key];
        if (entry === undefined) {
          throw new TypeError(`canonicalJson: undefined value at key ${key}`);
        }
        const encoded = canonicalize(entry, depth + 1, seen);
        if (encoded === undefined) throw new TypeError(`canonicalJson: undefined value at key ${key}`);
        parts.push(`${JSON.stringify(key)}:${encoded}`);
      }
      seen.delete(value);
      return `{${parts.join(",")}}`;
    }
    default:
      throw new TypeError("canonicalJson: unsupported value");
  }
}

export function canonicalJsonStringify(value: unknown): string {
  const encoded = canonicalize(value, 0, new WeakSet());
  if (encoded === undefined) throw new TypeError("canonicalJson: top-level undefined");
  return encoded;
}

export function canonicalJsonBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(canonicalJsonStringify(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stringify(value: JsonPrimitive): string {
  return JSON.stringify(value);
}

export function formatCanonicalValue(value: unknown): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "string":
    case "number":
    case "boolean":
      return stringify(value);
    case "object": {
      if (Array.isArray(value)) {
        return `[${value.map((item) => formatCanonicalValue(item)).join(",")}]`;
      }
      if (isRecord(value)) {
        const keys = Object.keys(value).sort();
        return `{${keys.map((key) => `${JSON.stringify(key)}:${formatCanonicalValue(value[key])}`).join(",")}}`;
      }
      return stringify(String(value));
    }
    default:
      return stringify(String(value));
  }
}
