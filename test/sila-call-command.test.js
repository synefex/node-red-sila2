"use strict";

// Load test for the sila-call-command action node. Verifies it registers
// and reads its config without errors. Does not exercise an actual gRPC
// call (that would need a live SiLA server -- see tool/smoketest.js).

const helper = require("node-red-node-test-helper");
const callNode = require("../src/call-command/sila-call-command");
const connectionNode = require("../src/connection/sila-connection");

helper.init(require.resolve("node-red"));

describe("sila-call-command node", function () {

  beforeEach(function (done) { helper.startServer(done); });
  afterEach(function (done) {
    helper.unload().then(function () { helper.stopServer(done); });
  });

  it("loads with a connection and reads its config", function (done) {
    const flow = [
      { id: "c1", type: "sila-connection", host: "127.0.0.1", port: 50052 },
      {
        id: "n1",
        type: "sila-call-command",
        name: "test-call",
        connection: "c1",
        feature: "MettlerToledoAX205Controller",
        featureType: "str",
        command: "GetStableWeight",
        commandType: "str",
        params: "{}",
        paramsType: "json",
        outputProperty: "payload",
        outputPropertyType: "msg",
        wires: [["out1"]],
      },
      { id: "out1", type: "helper" },
    ];
    helper.load([connectionNode, callNode], flow, function () {
      try {
        const n = helper.getNode("n1");
        require("assert").ok(n, "node should be loaded");
        require("assert").strictEqual(n.feature, "MettlerToledoAX205Controller");
        require("assert").strictEqual(n.command, "GetStableWeight");
        require("assert").strictEqual(n.outputProperty, "payload");
        done();
      } catch (e) { done(e); }
    });
  });

  it("errors gracefully on input when feature is missing", function (done) {
    const flow = [
      { id: "c1", type: "sila-connection", host: "127.0.0.1", port: 50052 },
      {
        id: "n1",
        type: "sila-call-command",
        connection: "c1",
        feature: "",
        featureType: "str",
        command: "X",
        commandType: "str",
        params: "{}",
        paramsType: "json",
        wires: [["out1"]],
      },
      { id: "out1", type: "helper" },
    ];
    helper.load([connectionNode, callNode], flow, function () {
      const n = helper.getNode("n1");
      // Listen for error events; capture and verify.
      let sawError = false;
      n.on("call:error", function () { sawError = true; });
      // Intercept node.error
      const origError = n.error.bind(n);
      n.error = function (err, msg) {
        sawError = true;
        try {
          require("assert").ok(/feature/i.test(String(err.message || err)));
          done();
        } catch (e) { done(e); }
      };
      n.receive({ payload: "trigger" });
      // Safety: if no error fired in 500ms, fail the test.
      setTimeout(function () {
        if (!sawError) done(new Error("expected node.error to fire for missing feature"));
      }, 500);
    });
  });
});
