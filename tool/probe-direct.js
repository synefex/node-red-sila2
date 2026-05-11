"use strict";
// Probe SiLA server WITHOUT relying on reflection. Try the well-known
// SiLAService.Get_ServerName endpoint directly. If this works but
// reflection doesn't, the server has reflection disabled — we'll need
// a non-reflection codepath in the package (static codegen or manual
// proto loading).

const grpc = require("@grpc/grpc-js");

const TARGET = process.argv[2] || "192.168.8.225:50052";

// Empty Get_ServerName_Parameters message → 0 bytes on the wire.
const REQ = Buffer.alloc(0);

const path =
  "/sila2.org.silastandard.core.silaservice.v1.SiLAService/Get_ServerName";

const c = new grpc.Client(TARGET, grpc.credentials.createInsecure());

c.makeUnaryRequest(
  path,
  (x) => x,
  (x) => x,
  REQ,
  new grpc.Metadata(),
  {},
  (err, value) => {
    if (err) {
      console.log(`ERR ${err.code} ${err.details || err.message}`);
    } else {
      console.log("OK", value.length, "bytes:", value.toString("hex"));
      // Get_ServerName_Responses { ServerName: String { value: string } }
      // Field 1 of Responses is ServerName, which is a String wrapper.
      // Quick crude decode: look for a string blob in the bytes.
      // Just print the printable substring.
      const s = value.toString("utf8").replace(/[^\x20-\x7e]/g, ".");
      console.log("    text →", s);
    }
    c.close();
    process.exit(err ? 1 : 0);
  },
);
