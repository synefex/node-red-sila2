"use strict";

const fs = require("fs");
const path = require("path");
const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");
const { unwrap } = require("./unwrap");

// Bundled protos: framework wrapper types + SiLAService (mandatory on every
// SiLA server) + a sample domain feature (Mettler Toledo AX205 balance) for
// out-of-the-box demos.
const BUNDLED_PROTOS_DIR = path.join(__dirname, "..", "..", "protos");

function listProtoFiles(dir) {
  if (!dir || !fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((n) => n.endsWith(".proto"))
    .map((n) => path.join(dir, n));
}

/**
 * Load proto files via @grpc/proto-loader, then turn them into a grpc
 * package object via grpc.loadPackageDefinition. The result is a nested
 * namespace whose leaves are either Service constructors (callable as
 * `new Cls(target, creds)`) or message-type definitions.
 *
 * `keepCase: true` keeps SiLA's PascalCase field names verbatim. Without
 * it, proto-loader lowercases the first letter — would break callers that
 * expect e.g. `WeightValue` instead of `weightValue`.
 */
function loadProtos({ extraProtoDirs = [], extraProtoFiles = [] } = {}) {
  const includeDirs = [BUNDLED_PROTOS_DIR, ...extraProtoDirs.filter(Boolean)];
  const files = [
    ...listProtoFiles(BUNDLED_PROTOS_DIR),
    ...extraProtoDirs.flatMap(listProtoFiles),
    ...extraProtoFiles.filter(Boolean),
  ];
  if (files.length === 0) {
    throw new Error("SiLA: no .proto files found (check extraProtoDirs config)");
  }
  const packageDef = protoLoader.loadSync(files, {
    includeDirs,
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
  });
  return grpc.loadPackageDefinition(packageDef);
}

/**
 * Walk the loaded grpc package recursively. Build:
 *  - byFull:  map of dotted fully-qualified service name → ServiceClass
 *  - byShort: map of lowercase short name (last segment) → [{fq, ServiceClass}]
 * Short-name collisions surface as a clear ambiguity error at lookup time.
 */
function indexServices(grpcPkg) {
  const byShort = new Map();
  const byFull = new Map();

  function visit(node, prefix) {
    if (!node || typeof node !== "object") return;
    for (const key of Object.keys(node)) {
      const child = node[key];
      const fq = prefix ? `${prefix}.${key}` : key;
      // grpc-js Service classes are functions decorated with .service +
      // .serviceName by loadPackageDefinition. Message types are plain
      // objects with codec methods — we don't index those.
      if (typeof child === "function" && child.service && child.serviceName) {
        byFull.set(fq, child);
        const shortKey = key.toLowerCase();
        const list = byShort.get(shortKey) || [];
        list.push({ fq, ServiceClass: child, shortName: key });
        byShort.set(shortKey, list);
      } else if (child && typeof child === "object") {
        visit(child, fq);
      }
    }
  }
  visit(grpcPkg, "");
  return { byShort, byFull };
}

/**
 * Build a SiLA client wrapper. Owns one grpc client instance per service
 * (lazy), reusing the underlying channel via the same address+credentials.
 */
function createSilaClient({
  target,
  credentials,
  extraProtoDirs = [],
  extraProtoFiles = [],
}) {
  const grpcPkg = loadProtos({ extraProtoDirs, extraProtoFiles });
  const { byShort, byFull } = indexServices(grpcPkg);
  const clientByService = new Map(); // fq → grpc client instance

  function resolveService(featureName) {
    if (!featureName) throw new Error("SiLA: feature name is required");
    if (featureName.includes(".") && byFull.has(featureName)) {
      return { fq: featureName, ServiceClass: byFull.get(featureName) };
    }
    const entries = byShort.get(featureName.toLowerCase()) || [];
    if (entries.length === 0) {
      const known = [...byFull.keys()].join(", ") || "(none)";
      throw new Error(
        `SiLA: feature "${featureName}" not found. Loaded services: ${known}`,
      );
    }
    if (entries.length > 1) {
      throw new Error(
        `SiLA: short name "${featureName}" is ambiguous: ` +
          entries.map((e) => e.fq).join(", "),
      );
    }
    return { fq: entries[0].fq, ServiceClass: entries[0].ServiceClass };
  }

  function getClient(fq, ServiceClass) {
    let c = clientByService.get(fq);
    if (!c) {
      c = new ServiceClass(target, credentials);
      clientByService.set(fq, c);
    }
    return c;
  }

  /**
   * Call an unobservable command (or property getter — same wire mechanism).
   *
   * @param {string} featureName  short name (case-insensitive, e.g.
   *                              "MettlerToledoAX205Controller") OR fully
   *                              qualified (e.g.
   *                              "sila2.master.thesis.weighing.mettlertoledoax205controller.v1.MettlerToledoAX205Controller")
   * @param {string} methodName   verbatim method on the service
   * @param {object} params       fields keyed by name as in the .proto
   * @param {grpc.Metadata} [metadata]
   * @returns {Promise<object>}   decoded + SiLA-unwrapped response
   */
  async function callUnary(featureName, methodName, params, metadata) {
    const { fq, ServiceClass } = resolveService(featureName);
    const client = getClient(fq, ServiceClass);
    if (typeof client[methodName] !== "function") {
      // Methods come from the .service descriptor; list them for the error.
      const methods = Object.keys(ServiceClass.service || {});
      throw new Error(
        `SiLA: method "${methodName}" not found on feature "${featureName}". ` +
          `Available: ${methods.join(", ")}`,
      );
    }

    const resp = await new Promise((resolve, reject) => {
      const cb = (err, value) => (err ? reject(err) : resolve(value));
      if (metadata) client[methodName](params || {}, metadata, cb);
      else client[methodName](params || {}, cb);
    });
    return unwrap(resp);
  }

  /**
   * List loaded services (the union of bundled protos + any extras the
   * connection was configured with). Returns fully-qualified names.
   */
  function listServices() {
    return [...byFull.keys()];
  }

  /**
   * Editor picker support: list every loaded service with its short name,
   * fully-qualified name, and methods classified as "command" vs
   * "property" by the SiLA naming convention (`Get_<X>` → property
   * getter for property `<X>`; everything else → command).
   *
   * The classification is name-only — we don't inspect request-message
   * fields. SiLA convention is strict enough that this is reliable for
   * standard features; vendor-defined commands that happen to start
   * with `Get_` and take no parameters would be misclassified, but
   * that's a SiLA naming antipattern.
   */
  function listFeaturesForPicker() {
    const features = [];
    for (const [fq, ServiceClass] of byFull) {
      const shortName = fq.split(".").pop();
      const svcDesc = ServiceClass.service || {};
      const methods = Object.keys(svcDesc)
        .map((name) => {
          if (name.startsWith("Get_")) {
            return { name, kind: "property", propertyName: name.slice(4) };
          }
          return { name, kind: "command" };
        })
        .sort((a, b) => {
          // Sort by display name (propertyName for properties, name for commands)
          const an = a.kind === "property" ? a.propertyName : a.name;
          const bn = b.kind === "property" ? b.propertyName : b.name;
          return an.localeCompare(bn);
        });
      features.push({ shortName, fqName: fq, methods });
    }
    features.sort((a, b) => a.shortName.localeCompare(b.shortName));
    return { features };
  }

  function close() {
    for (const c of clientByService.values()) {
      try { c.close(); } catch (_) { /* ignore */ }
    }
    clientByService.clear();
  }

  return { callUnary, listServices, listFeaturesForPicker, close };
}

module.exports = { createSilaClient, BUNDLED_PROTOS_DIR };
