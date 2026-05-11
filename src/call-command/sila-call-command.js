"use strict";

module.exports = function (RED) {
  function SilaCallCommandNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;

    node.connection = RED.nodes.getNode(config.connection);
    node.feature = config.feature || "";
    node.featureType = config.featureType || "str";
    node.command = config.command || "";
    node.commandType = config.commandType || "str";
    node.params = config.params || "{}";
    node.paramsType = config.paramsType || "json";
    node.outputProperty = config.outputProperty || "payload";
    node.outputPropertyType = config.outputPropertyType || "msg";

    if (!node.connection) {
      node.status({ fill: "red", shape: "ring", text: "no connection" });
      return;
    }

    function applyConnStatus(status) {
      switch (status.state) {
        case "ok":
          node.status({ fill: "green", shape: "dot", text: status.detail || "ok" });
          break;
        case "ready":
          node.status({ fill: "grey", shape: "ring", text: "ready" });
          break;
        case "error":
          node.status({ fill: "red", shape: "ring", text: status.detail || "error" });
          break;
        default:
          node.status({ fill: "grey", shape: "ring", text: status.state || "" });
      }
    }
    const unsub = node.connection.onStatus(applyConnStatus);

    node.on("input", async (msg, send, done) => {
      let feature, command, params;
      try {
        feature = RED.util.evaluateNodeProperty(node.feature, node.featureType, node, msg);
        command = RED.util.evaluateNodeProperty(node.command, node.commandType, node, msg);
        params = RED.util.evaluateNodeProperty(node.params, node.paramsType, node, msg);
      } catch (err) {
        if (done) done(err); else node.error(err, msg);
        return;
      }

      if (typeof feature !== "string" || !feature) {
        const err = new Error("SiLA call: feature name is missing");
        if (done) done(err); else node.error(err, msg);
        return;
      }
      if (typeof command !== "string" || !command) {
        const err = new Error("SiLA call: command name is missing");
        if (done) done(err); else node.error(err, msg);
        return;
      }

      // typed-input "json" already parses; msg/flow/global may pass through a
      // string by accident — be tolerant. null → empty params.
      if (params == null) params = {};
      if (typeof params === "string") {
        try {
          params = JSON.parse(params);
        } catch (e) {
          const err = new Error(`SiLA call: params is not valid JSON: ${e.message}`);
          if (done) done(err); else node.error(err, msg);
          return;
        }
      }

      let resp;
      try {
        resp = await node.connection.callUnary(feature, command, params);
      } catch (err) {
        node.status({ fill: "red", shape: "ring", text: "call failed" });
        if (done) done(err); else node.error(err, msg);
        return;
      }

      try {
        if (node.outputPropertyType === "msg") {
          RED.util.setMessageProperty(msg, node.outputProperty, resp, true);
        } else if (
          node.outputPropertyType === "flow" ||
          node.outputPropertyType === "global"
        ) {
          node.context()[node.outputPropertyType].set(node.outputProperty, resp);
        } else {
          RED.util.setMessageProperty(msg, node.outputProperty, resp, true);
        }
      } catch (err) {
        if (done) done(err); else node.error(err, msg);
        return;
      }

      send(msg);
      if (done) done();
    });

    node.on("close", () => {
      try { unsub(); } catch (_) { /* ignore */ }
    });
  }

  RED.nodes.registerType("sila-call-command", SilaCallCommandNode);
};
