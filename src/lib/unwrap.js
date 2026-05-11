"use strict";

/**
 * Unwrap SiLA basic-type wrappers from a decoded gRPC response object.
 *
 * Every SiLA basic type (String, Real, Integer, Boolean, ...) is encoded
 * as a single-field protobuf message named `value`. Recursively peel
 * those wrappers off so callers see native values:
 *
 *     { Status: { value: "S S" }, WeightValue: { value: 82.68 } }
 *  →  { Status: "S S",            WeightValue: 82.68 }
 *
 * Lists pass through with element-wise unwrap. Structures (multi-field
 * messages) are recursed into. Buffers are passed through verbatim
 * (SiLA's Binary type may be raw bytes or a transfer UUID — handled at
 * the call site, not here).
 */
function unwrap(obj) {
  if (obj == null || typeof obj !== "object") return obj;
  if (Buffer.isBuffer(obj) || obj instanceof Uint8Array) return obj;
  if (Array.isArray(obj)) return obj.map(unwrap);

  const keys = Object.keys(obj);
  // Single-field wrapper named "value" → SiLA basic type. Unwrap.
  if (keys.length === 1 && keys[0] === "value") {
    return unwrap(obj.value);
  }

  // Otherwise it's a Structure (or _Responses message): recurse field-wise.
  const out = {};
  for (const k of keys) out[k] = unwrap(obj[k]);
  return out;
}

module.exports = { unwrap };
