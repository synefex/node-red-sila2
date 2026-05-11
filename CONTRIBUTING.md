# Contributing to @synefex/node-red-sila2

Thanks for considering a contribution. This package provides Node-RED
nodes for SiLA 2 lab-device servers.

## Development setup

Requirements:
- Node.js 18 or newer
- For live testing: a reachable SiLA 2 server (the `sila2` Python server
  in `insecure=True` mode is the easiest)

```bash
git clone https://github.com/synefex/node-red-sila2.git
cd node-red-sila2
npm install
npm test
```

## Layout

```
.
├── package.json
├── README.md
├── LICENSE                Apache-2.0
├── NOTICE                 third-party attribution
├── CHANGELOG.md
├── protos/                bundled .proto files
│   ├── SiLAFramework.proto
│   └── SiLAService.proto
├── src/
│   ├── lib/
│   │   ├── client.js      proto loader + service registry + callUnary
│   │   ├── unwrap.js      SiLA 2 basic-type unwrapping
│   │   └── picker/        browser-side picker widget
│   ├── connection/        sila-connection config node
│   ├── call-command/      sila-call-command action node
│   └── get-property/      sila-get-property action node
└── test/                  mocha + node-red-node-test-helper
```

## Testing

```bash
npm test
```

Tests use `node-red-node-test-helper` against a mocked Node-RED runtime.
No live SiLA 2 server is required for the unit + load tests. Coverage:

- `test/unwrap.test.js` -- the SiLA 2 basic-type unwrap helper
- `test/sila-connection.test.js` -- config node loads, status events,
  bundled-proto introspection
- `test/sila-call-command.test.js` -- command-call action node loads,
  handles missing-feature gracefully
- `test/sila-get-property.test.js` -- property-get action node loads,
  default unwrapSingle behavior

For end-to-end testing against a real SiLA 2 server, see
[`tool/smoketest.js`](tool/smoketest.js). It uses the package's own
client lib to call `Get_ServerName`, `Get_ImplementedFeatures`, and
(if the AX205Controller.proto is loaded) `GetStableWeight`.

```bash
NODE_PATH=/path/to/node_modules node tool/smoketest.js HOST PORT
```

## Pull requests

- Branch from `main`.
- Keep changes focused -- one feature or fix per PR.
- Add tests for new behavior.
- Update `CHANGELOG.md` under `[Unreleased]`.
- Run `npm test`.
- Sign off your commits: `Signed-off-by: Your Name <you@example.com>`.

## Code style

- Plain JavaScript, no TypeScript build step.
- Two-space indent, LF line endings, UTF-8 (see `.editorconfig`).
- One subdirectory per node under `src/<node-name>/`.
- Shared helpers in `src/lib/`.
- Comments explain *why*, not *what*.

## License

By contributing, you agree that your contributions will be licensed under
the Apache License, Version 2.0. See [`LICENSE`](LICENSE).
