# @synefex/node-red-sila2

Node-RED nodes for talking to **SiLA 2** lab-device servers from
Node-RED. SiLA 2 is the open standard for lab automation, layering a
Feature / Command / Property contract on top of gRPC over HTTP/2.

This package gives you a connection node and two action nodes built on
`@grpc/grpc-js` and `@grpc/proto-loader`. Static proto loading (not
reflection) so it works against every SiLA 2 server, regardless of
implementation language.

[![npm version](https://img.shields.io/npm/v/@synefex/node-red-sila2.svg)](https://www.npmjs.com/package/@synefex/node-red-sila2)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)

## Install

In your Node-RED userDir (typically `~/.node-red/`):

```bash
npm install @synefex/node-red-sila2
```

Restart Node-RED. Three new nodes appear in the palette under the
`Synefex SiLA 2` section.

## Nodes

| Node | Purpose |
|---|---|
| `sila-connection` | gRPC channel + bundled proto registry. Config node. |
| `sila-call-command` | Invoke an unobservable SiLA 2 command on a feature. |
| `sila-get-property` | Read an unobservable SiLA 2 property (`Get_<Name>`). |

## Quick start

1. Drop a **SiLA 2 connection** config node and point it at your SiLA 2
   server (host + port). Leave **Insecure** ticked for a dev server
   without TLS.
2. Wire an **inject -> SiLA 2 get -> debug** flow.
3. In the SiLA 2 get node:
   - Connection: the one you just made
   - Feature: `SiLAService`
   - Property: `ServerName`
4. Deploy and click inject. `payload` becomes the server's name string,
   e.g. `"MettlerToledoAX205SiLAServer"`.

For commands, use **SiLA 2 call** instead. The bundled SiLAService feature
exposes `GetFeatureDefinition` and `SetServerName`; for domain features
(balances, liquid handlers, etc.) you bring your own `.proto` files (see
"Adding more features" below).

## Bundled features

The package always loads two `.proto` files from `protos/`:

- `SiLAFramework.proto` -- canonical wrapper types (`String`, `Real`,
  `Boolean`, ...) used by every SiLA 2 feature.
- `SiLAService.proto` -- the mandatory core feature every SiLA 2 server
  implements (`ServerName`, `ServerType`, `ServerUUID`,
  `ServerDescription`, `ServerVersion`, `ServerVendorURL`,
  `ImplementedFeatures`, plus `GetFeatureDefinition` and
  `SetServerName`). Hand-derived from the FDL in
  [sila_base](https://gitlab.com/SiLA2/sila_base).

That's enough to talk to any SiLA 2 server's identity surface out of the
box. For domain features (your actual lab devices) you provide their
`.proto` files via the connection's **Extra proto dirs** /
**Extra proto files** config.

## Adding more features

SiLA 2 features are defined in FDL XML; the `.proto` is generated from
the FDL by the SiLA 2 codegen. If your server is the `sila2` Python
reference implementation, the generated `.proto` files live inside the
running container and can be copied out with one shell command (see
the `extract_protos.sh` helper in this repo's `sila-handoff/` notes).

Once you have the `.proto` files, drop them in a directory and point
the connection node's **Extra proto dirs** at it (comma-separated list
of dirs and/or individual files). The picker dropdowns automatically
include any feature that's loaded.

## Picker

Open a SiLA 2 call or SiLA 2 get node in the editor and you'll see two
dropdowns above the manual fields:

- **Feature**: lists every loaded feature.
- **Command** / **Property**: lists the methods on the selected feature,
  classified by SiLA 2 naming convention (`Get_<X>` -> property `<X>`,
  everything else -> command).

The picker writes the chosen values into the manual text fields below;
you can also type by hand.

## Why static protos and not reflection

An earlier draft used gRPC reflection. The Python `sila2` reference
server enables reflection by default, but other SiLA 2 implementations
(Java, C#) often do not, and even some `sila2` deployments turn it off.
Static proto loading is universal -- the package works against every
SiLA 2 server we've tested.

## Limitations / roadmap

This is the v0.1.0 release. Out of scope for now:

- Observable commands (the `CommandExecutionUUID` flow with progress).
- Observable properties (server-streaming subscriptions).
- Pinned-cert TLS (insecure and default-trust TLS are available).
- Decoded `sila-error-bin` trailer (SiLA 2 framework errors currently
  surface as generic gRPC errors).

If any of these is blocking for you, open an issue.

## License

Apache License, Version 2.0. See [`LICENSE`](LICENSE) and
[`NOTICE`](NOTICE).
