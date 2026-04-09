// Pure function: deep object flattening to dot-notation paths

export function flatten(obj, prefix = "") {
  const result = {};

  if (obj === null || obj === undefined) {
    if (prefix) result[prefix] = obj;
    return result;
  }

  if (Array.isArray(obj)) {
    if (obj.length === 0) {
      if (prefix) result[prefix] = obj;
      return result;
    }
    if (typeof obj[0] === "object" && obj[0] !== null && !Array.isArray(obj[0])) {
      for (let i = 0; i < obj.length; i++) {
        const item = obj[i];
        const itemKey = typeof item.name === "string" ? item.name
          : typeof item.id === "string" ? item.id
          : typeof item.$ref === "string" ? item.$ref
          : Object.keys(item).length > 0 ? `[${Object.keys(item)[0]}:${String(Object.values(item)[0]).slice(0, 30)}]`
          : String(i);
        const path = prefix ? `${prefix}.${itemKey}` : itemKey;
        Object.assign(result, flatten(item, path));
      }
      return result;
    }
    if (prefix) result[prefix] = obj;
    return result;
  }

  if (typeof obj !== "object") {
    if (prefix) result[prefix] = obj;
    return result;
  }

  const keys = Object.keys(obj);

  if (keys.length === 0) {
    if (prefix) result[prefix] = obj;
    return result;
  }

  for (const key of keys) {
    const path = prefix ? `${prefix}.${key}` : key;
    const value = obj[key];

    if (
      value !== null &&
      value !== undefined &&
      typeof value === "object" &&
      Object.keys(value).length > 0
    ) {
      Object.assign(result, flatten(value, path));
    } else {
      result[path] = value;
    }
  }

  return result;
}

export function leafName(path) {
  const parts = path.split(".");
  return parts[parts.length - 1] ?? path;
}

export function describeType(value) {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (Array.isArray(value)) return `array[${value.length}]`;
  return typeof value;
}