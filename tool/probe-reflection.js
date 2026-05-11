"use strict";
// Probe both reflection paths on a SiLA server. The Python sila2 server
// originally only exposed grpc.reflection.v1alpha; newer @grpc/* libs
// emit grpc.reflection.v1. Tells us which path the server understands.
//
// Run from /root/.node-red/ so @grpc/grpc-js resolves.
const grpc = require("@grpc/grpc-js");

const TARGET = process.argv[2] || "192.168.8.225:50052";
const PATHS = [
  "/grpc.reflection.v1.ServerReflection/ServerReflectionInfo",
  "/grpc.reflection.v1alpha.ServerReflection/ServerReflectionInfo",
];

// Minimal serialised ServerReflectionRequest{ list_services: "" }: tag for
// field 3 (string) is 0x1a, length 0 → bytes [0x1a, 0x00].
const REQ_BYTES = Buffer.from([0x1a, 0x00]);

(async () => {
  for (const path of PATHS) {
    await new Promise((resolve) => {
      const c = new grpc.Client(TARGET, grpc.credentials.createInsecure());
      const md = new grpc.Metadata();
      const stream = c.makeBidiStreamRequest(path, (x) => x, (x) => x, md, {});
      let saw = false;
      stream.on("data", () => { saw = true; });
      stream.on("error", (e) => {
        console.log(`${path}\n  ERR ${e.code} ${e.details || e.message}`);
        c.close();
        resolve();
      });
      stream.on("end", () => {
        console.log(`${path}\n  END (data received: ${saw})`);
        c.close();
        resolve();
      });
      stream.write(REQ_BYTES);
      stream.end();
    });
  }
})();
