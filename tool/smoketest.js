"use strict";

// Smoke-test the @synefex/sila client lib against the live Mettler Toledo
// AX205 SiLA server. Run on the gateway:
//
//   node /root/.node-red/node_modules/@synefex/sila/tool/smoketest.js
//
// Calls SiLAService.Get_ServerName + MettlerToledoAX205Controller.GetStableWeight
// and prints both responses. Exits 0 on success, 1 on failure.

// Resolve the installed package on the gateway (NODE_PATH must include
// /root/.node-red/node_modules; the script itself can live anywhere).
const { createSilaClient } = require("@synefex/sila/src/lib/client");
const grpc = require("@grpc/grpc-js");

const HOST = process.argv[2] || "192.168.8.225";
const PORT = Number(process.argv[3] || 50052);

(async () => {
  const target = `${HOST}:${PORT}`;
  const c = createSilaClient({
    target,
    credentials: grpc.credentials.createInsecure(),
  });

  console.log(`>> connecting to ${target}`);

  console.log(">> listing services");
  const services = await c.listServices();
  for (const s of services) console.log("   -", s);

  console.log(">> Get_ServerName on SiLAService");
  const name = await c.callUnary("SiLAService", "Get_ServerName", {});
  console.log("   →", JSON.stringify(name));

  console.log(">> Get_ImplementedFeatures on SiLAService");
  const feats = await c.callUnary("SiLAService", "Get_ImplementedFeatures", {});
  console.log("   →", JSON.stringify(feats, null, 2));

  console.log(">> GetStableWeight on MettlerToledoAX205Controller");
  const w = await c.callUnary(
    "MettlerToledoAX205Controller",
    "GetStableWeight",
    {},
  );
  console.log("   →", JSON.stringify(w));

  c.close();
  console.log(">> ok");
})().catch((err) => {
  console.error("!! failed:", err && err.stack ? err.stack : err);
  process.exit(1);
});
