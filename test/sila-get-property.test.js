"use strict";

// Load test for the sila-get-property action node.

const helper = require("node-red-node-test-helper");
const getNode = require("../src/get-property/sila-get-property");
const connectionNode = require("../src/connection/sila-connection");

helper.init(require.resolve("node-red"));

describe("sila-get-property node", function () {

  beforeEach(function (done) { helper.startServer(done); });
  afterEach(function (done) {
    helper.unload().then(function () { helper.stopServer(done); });
  });

  it("loads with a connection and reads its config", function (done) {
    const flow = [
      { id: "c1", type: "sila-connection", host: "127.0.0.1", port: 50052 },
      {
        id: "n1",
        type: "sila-get-property",
        name: "test-get",
        connection: "c1",
        feature: "SiLAService",
        featureType: "str",
        property: "ServerName",
        propertyType: "str",
        outputProperty: "payload",
        outputPropertyType: "msg",
        unwrapSingle: true,
        wires: [["out1"]],
      },
      { id: "out1", type: "helper" },
    ];
    helper.load([connectionNode, getNode], flow, function () {
      try {
        const n = helper.getNode("n1");
        require("assert").ok(n);
        require("assert").strictEqual(n.feature, "SiLAService");
        require("assert").strictEqual(n.property, "ServerName");
        require("assert").strictEqual(n.unwrapSingle, true);
        done();
      } catch (e) { done(e); }
    });
  });

  it("defaults unwrapSingle to true when not specified", function (done) {
    const flow = [
      { id: "c1", type: "sila-connection", host: "127.0.0.1", port: 50052 },
      {
        id: "n1",
        type: "sila-get-property",
        connection: "c1",
        feature: "SiLAService",
        property: "ServerName",
      },
    ];
    helper.load([connectionNode, getNode], flow, function () {
      const n = helper.getNode("n1");
      try {
        require("assert").strictEqual(n.unwrapSingle, true);
        done();
      } catch (e) { done(e); }
    });
  });
});
