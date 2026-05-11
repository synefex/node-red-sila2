"use strict";

const fs = require("fs");
const path = require("path");
const grpc = require("@grpc/grpc-js");
const { createSilaClient } = require("../lib/client");

// Read once at module load — served by the picker.js admin route below.
const PICKER_JS = fs.readFileSync(
  path.join(__dirname, "..", "lib", "picker", "picker.js"),
  "utf8",
);

module.exports = function (RED) {
  function SilaConnectionNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;

    node.host = (config.host || "").trim();
    node.port = parseInt(config.port, 10) || 50052;
    node.insecure = config.insecure !== false; // default true (lab/dev)

    // Comma-separated list of extra proto dirs and/or .proto files. The
    // bundled protos (SiLAFramework, SiLAService, sample AX205Controller)
    // are always loaded; this lets the user point at additional features
    // extracted from their server (e.g. via sila-handoff/examples/extract_protos.sh).
    node.extraProtoDirs = parseList(config.extraProtoDirs);
    node.extraProtoFiles = parseList(config.extraProtoFiles);

    /** @type {ReturnType<typeof createSilaClient>|null} */
    let client = null;

    const statusListeners = new Set();
    let lastStatus = { state: "idle", detail: "", ts: Date.now() };

    function publishStatus(state, detail) {
      lastStatus = { state, detail: detail || "", ts: Date.now() };
      for (const fn of statusListeners) {
        try { fn(lastStatus); } catch (_) { /* ignore */ }
      }
    }

    /** Action nodes subscribe with this; returns an unsubscribe fn. */
    node.onStatus = function (fn) {
      statusListeners.add(fn);
      try { fn(lastStatus); } catch (_) { /* ignore */ }
      return () => statusListeners.delete(fn);
    };

    function buildClient() {
      if (!node.host) throw new Error("SiLA connection: host not configured");
      const target = `${node.host}:${node.port}`;
      const creds = node.insecure
        ? grpc.credentials.createInsecure()
        : grpc.credentials.createSsl(); // TLS w/o pinned roots
      const c = createSilaClient({
        target,
        credentials: creds,
        extraProtoDirs: node.extraProtoDirs,
        extraProtoFiles: node.extraProtoFiles,
      });
      publishStatus("ready", `${target} (${c.listServices().length} svc loaded)`);
      return c;
    }

    /**
     * Lazy: build the client on first call. Loading protos is synchronous
     * and fast (KB-sized files), but no socket opens until the first call.
     */
    node.getClient = function () {
      if (!client) client = buildClient();
      return client;
    };

    /**
     * Convenience wrapper for action nodes: lazy init + status broadcast.
     */
    node.callUnary = async function (featureName, methodName, params, metadata) {
      const c = node.getClient();
      try {
        const resp = await c.callUnary(featureName, methodName, params, metadata);
        publishStatus("ok", `${featureName}.${methodName}`);
        return resp;
      } catch (err) {
        publishStatus("error", err.message || String(err));
        throw err;
      }
    };

    /** For diagnostics / future picker UI. */
    node.listServices = function () {
      return node.getClient().listServices();
    };

    /** Editor picker: list loaded features with classified methods. */
    node.listFeaturesForPicker = function () {
      return node.getClient().listFeaturesForPicker();
    };

    node.on("close", function (done) {
      try { if (client) client.close(); } catch (_) { /* ignore */ }
      client = null;
      if (typeof done === "function") done();
    });
  }

  function parseList(s) {
    if (!s) return [];
    return String(s)
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
  }

  RED.nodes.registerType("sila-connection", SilaConnectionNode);

  // ---------------------------------------------------------------------------
  // Editor-side picker support: admin HTTP endpoints. Routes are scoped
  // under /sila/conn/:id/... to mirror the LADS pattern and avoid clashes.
  // ---------------------------------------------------------------------------

  function picker(handler) {
    return async (req, res) => {
      const node = RED.nodes.getNode(req.params.id);
      if (!node || typeof node.listFeaturesForPicker !== "function") {
        return res.status(404).json({ error: "sila-connection not found: " + req.params.id });
      }
      try {
        const data = await handler(node, req);
        res.json(data);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    };
  }

  RED.httpAdmin.get(
    "/sila/conn/:id/features",
    RED.auth.needsPermission("flows.read"),
    picker((node) => node.listFeaturesForPicker()),
  );

  // Serve the picker.js asset for the editor. Static JS — sensitive data
  // lives behind the /features endpoint which already requires flows.read.
  RED.httpAdmin.get("/sila/picker.js", (req, res) => {
    res.type("application/javascript").send(PICKER_JS);
  });
};
