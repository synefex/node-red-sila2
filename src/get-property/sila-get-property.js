"use strict";

module.exports = function (RED) {
  function SilaGetPropertyNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;

    node.connection = RED.nodes.getNode(config.connection);
    node.feature = config.feature || "";
    node.featureType = config.featureType || "str";
    node.property = config.property || "";
    node.propertyType = config.propertyType || "str";
    node.outputProperty = config.outputProperty || "payload";
    node.outputPropertyType = config.outputPropertyType || "msg";
    node.unwrapSingle = config.unwrapSingle !== false; // default true

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
      let feature, property;
      try {
        feature = RED.util.evaluateNodeProperty(node.feature, node.featureType, node, msg);
        property = RED.util.evaluateNodeProperty(node.property, node.propertyType, node, msg);
      } catch (err) {
        if (done) done(err); else node.error(err, msg);
        return;
      }

      if (typeof feature !== "string" || !feature) {
        const err = new Error("SiLA get: feature name is missing");
        if (done) done(err); else node.error(err, msg);
        return;
      }
      if (typeof property !== "string" || !property) {
        const err = new Error("SiLA get: property name is missing");
        if (done) done(err); else node.error(err, msg);
        return;
      }

      // SiLA convention: property getter is `Get_<PropertyName>`. If the
      // user already prefixed Get_, use it verbatim.
      const methodName = property.startsWith("Get_") ? property : `Get_${property}`;

      let resp;
      try {
        resp = await node.connection.callUnary(feature, methodName, {});
      } catch (err) {
        node.status({ fill: "red", shape: "ring", text: "get failed" });
        if (done) done(err); else node.error(err, msg);
        return;
      }

      // Typical case: _Responses has a single field holding the property
      // value. After SiLA-unwrap that single field IS the value. Surface
      // it directly so `payload` is the value, not a wrapper. Keep the
      // wrapper for multi-field responses (rare, but FDL allows it).
      let payload = resp;
      if (
        node.unwrapSingle &&
        resp &&
        typeof resp === "object" &&
        !Array.isArray(resp)
      ) {
        const keys = Object.keys(resp);
        if (keys.length === 1) payload = resp[keys[0]];
      }

      try {
        if (node.outputPropertyType === "msg") {
          RED.util.setMessageProperty(msg, node.outputProperty, payload, true);
        } else if (
          node.outputPropertyType === "flow" ||
          node.outputPropertyType === "global"
        ) {
          node.context()[node.outputPropertyType].set(node.outputProperty, payload);
        } else {
          RED.util.setMessageProperty(msg, node.outputProperty, payload, true);
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

  RED.nodes.registerType("sila-get-property", SilaGetPropertyNode);
};
