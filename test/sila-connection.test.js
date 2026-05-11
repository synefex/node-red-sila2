"use strict";

// Load test for the sila-connection config node.
//
// Verifies that the node module:
//  - registers the type
//  - reads its config fields with sensible defaults
//  - exposes the action-node-facing API (onStatus, getClient, callUnary,
//    listFeaturesForPicker, listServices)
//
// Does NOT exercise gRPC: client construction is lazy and only fires on
// the first callUnary. We just want to know the node loads cleanly.

const helper = require("node-red-node-test-helper");
const connectionNode = require("../src/connection/sila-connection");

helper.init(require.resolve("node-red"));

describe("sila-connection node", function () {

  beforeEach(function (done) { helper.startServer(done); });
  afterEach(function (done) {
    helper.unload().then(function () { helper.stopServer(done); });
  });

  it("loads with the configured host/port and exposes the API", function (done) {
    const flow = [
      {
        id: "c1",
        type: "sila-connection",
        name: "test-conn",
        host: "127.0.0.1",
        port: 12345,
        insecure: true,
      },
    ];
    helper.load(connectionNode, flow, function () {
      try {
        const c = helper.getNode("c1");
        require("assert").ok(c, "connection node should be loaded");
        require("assert").strictEqual(c.host, "127.0.0.1");
        require("assert").strictEqual(c.port, 12345);
        require("assert").strictEqual(c.insecure, true);
        require("assert").strictEqual(typeof c.onStatus, "function");
        require("assert").strictEqual(typeof c.getClient, "function");
        require("assert").strictEqual(typeof c.callUnary, "function");
        require("assert").strictEqual(typeof c.listServices, "function");
        require("assert").strictEqual(typeof c.listFeaturesForPicker, "function");
        done();
      } catch (e) { done(e); }
    });
  });

  it("publishes an initial 'idle' status to subscribers", function (done) {
    const flow = [
      { id: "c1", type: "sila-connection", host: "127.0.0.1", port: 50052 },
    ];
    helper.load(connectionNode, flow, function () {
      const c = helper.getNode("c1");
      const seen = [];
      c.onStatus(function (s) { seen.push(s); });
      try {
        require("assert").ok(seen.length >= 1, "should fire once on subscribe");
        require("assert").strictEqual(seen[0].state, "idle");
        done();
      } catch (e) { done(e); }
    });
  });

  it("defaults insecure to true when not specified", function (done) {
    const flow = [
      { id: "c1", type: "sila-connection", host: "h", port: 1 },
    ];
    helper.load(connectionNode, flow, function () {
      const c = helper.getNode("c1");
      try {
        require("assert").strictEqual(c.insecure, true);
        done();
      } catch (e) { done(e); }
    });
  });

  it("loads bundled protos and exposes SiLAService via the picker", function (done) {
    // This exercises the lazy client build by calling listFeaturesForPicker,
    // which forces proto load. It does NOT open a socket -- proto loading
    // is purely local file I/O.
    const flow = [
      { id: "c1", type: "sila-connection", host: "127.0.0.1", port: 50052 },
    ];
    helper.load(connectionNode, flow, function () {
      const c = helper.getNode("c1");
      try {
        const picker = c.listFeaturesForPicker();
        require("assert").ok(Array.isArray(picker.features));
        const silaService = picker.features.find(function (f) {
          return f.shortName === "SiLAService";
        });
        require("assert").ok(silaService, "SiLAService should be loaded from bundled protos");
        // Should have at least Get_ServerName classified as a property
        const getServerName = silaService.methods.find(function (m) {
          return m.name === "Get_ServerName";
        });
        require("assert").ok(getServerName);
        require("assert").strictEqual(getServerName.kind, "property");
        require("assert").strictEqual(getServerName.propertyName, "ServerName");
        done();
      } catch (e) { done(e); }
    });
  });
});
