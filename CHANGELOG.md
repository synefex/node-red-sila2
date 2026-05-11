# Changelog -- @synefex/node-red-sila2

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-05-12

First public release.

### Added
- `sila-connection` config node: long-lived gRPC channel + bundled proto
  registry, with optional extra proto dirs/files for additional features.
- `sila-call-command` action node: invoke an unobservable SiLA 2 command
  on any loaded feature; auto-unwraps the SiLA 2 basic-type response
  wrappers.
- `sila-get-property` action node: read an unobservable SiLA 2 property
  (`Get_<Name>`) with optional single-field unwrap.
- Bundled protos: `SiLAFramework.proto` (canonical) and `SiLAService.proto`
  (hand-derived from the FDL) so the mandatory core feature works
  zero-config.
- Editor picker: cascading Feature -> Command/Property dropdowns backed
  by `GET /sila/conn/:id/features`, classifying methods by SiLA 2 naming
  convention (`Get_*` -> property, otherwise command).
- Apache-2.0 licensing.
- Unit tests for the SiLA 2 basic-type unwrap helper and per-node load
  tests via `node-red-node-test-helper`.

### Notes
- This release uses static proto loading via `@grpc/proto-loader`, not
  gRPC reflection. SiLA 2 servers vary in reflection support; static
  loading works against all of them.
- Observable commands and observable property subscriptions are not yet
  supported. Roadmap items.
- Pinned-cert TLS is not yet supported. Insecure (no TLS) and default-
  trust TLS are available; production users should provide explicit
  root certs.
