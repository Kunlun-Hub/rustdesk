# DeskLink Client AI Handoff

Last verified: 2026-09-03 UTC.

This repository is the DeskLink-branded RustDesk client. Read `AGENTS.md` before
editing. The product remote is `preview` (`Kunlun-Hub/rustdesk`); `origin` is the
upstream RustDesk repository and must not receive DeskLink product changes.

## Current Release

- Latest release tag: `zto64`
- Release: `https://github.com/Kunlun-Hub/rustdesk/releases/tag/zto64`
- Windows workflow run `38385293963` (`only-windows`, commit `f6b481ff8`);
  the non-Windows packages come from run `38391634131` (`skip-windows`, commit
  `8fefcd4f4`), which reuses the same tag.
- Product commit: `f6b481ff8`; `libs/hbb_common` commit: `ef932e9`
- Deployed on the DeskLink `/install/` page (10.202.22.91) as the combined
  DeskLink + Agent package:
  - `desklink-zto64-x86_64-install.exe` 28,876,288 B,
    `aebc7ad068e1b0f7bf2856df9abd82b6b65a4855ae7ef136980f261351e0d0dc`
  - `desklink-zto64-x86_64.deb` 26,775,028 B,
    `9db40bc58b7c822282236533146a7d3e6f8516dda6190711566aef910ee65159`
- All installable assets use the `desklink-zto64-*` prefix. `desklink.sbom.json`
  is metadata and is the only intentional naming exception.
- The retired `phase1-*` tags are superseded. They are only kept as intermediate
  builds; do not hand them out as the DeskLink package.

Treat this section as a snapshot. Verify GitHub and Git state before claiming it
is still current.

## Product Defaults

The branded defaults live in `libs/hbb_common/src/config.rs`:

- API: `https://10.202.22.91`
- ID server: `10.202.22.91:21116`
- Relay: `10.202.22.91:21117`
- Public key: `8LygoZ54ARtfKmpX+wd5FfOrNPEl4CGueVFQUTjl57k=`

The retired `10.202.10.250` / `10.202.22.90` hosts must never come back as
defaults; see "Installer: retiring the old client and its servers" for the
upgrade path that removes them from machines that already saved them.
- View style: `adaptive` (Fit window)
- Image mode: `custom`
- Image quality: `85`
- Default FPS: `60`; a user may manually select up to `120`

Existing per-peer or user-default configuration takes precedence. Do not claim
an upgrade overwrites settings already saved by a user.

FPS negotiation is split across these files:

- `src/common.rs`: `using_public_server()` must inspect the actual rendezvous
  server. Checking only whether the user typed a custom server incorrectly
  classifies the embedded server as public and caps relayed sessions at 30 FPS.
- `src/client.rs`: builds and sends `custom_fps` in the session option message.
- `src/client/io_loop.rs`: reduces FPS when the decoder queue cannot keep up.
- `src/server/video_qos.rs`: clamps negotiated FPS to `1..=120` and takes the
  lowest active client limit. Default 60 therefore falls back to a slower
  decoder, while an explicit 120 setting can raise the ceiling.

Actual FPS also depends on source refresh rate, capture backend, encoder,
decoder, screen activity, RTT, and relay throughput. Do not remove decoder queue
protection merely to make the monitor display a larger number.

## Important DeskLink Features

- Current UI is Flutter; legacy Sciter remains for compatibility packages.
- The Windows portable-install prompt is in
  `flutter/lib/desktop/pages/desktop_tab_page.dart`. It must remain visible in
  the left navigation when installation is supported and the client is not
  installed. It calls the existing `mainGotoInstall()` flow.
- Recording upload/policy handling is under `src/hbbs_http/`, with the session
  integration in the client/server modules. Keep iOS conditional compilation in
  mind: iOS does not expose the desktop `Connection` type.
- Recording cursor playback samples the controlled host cursor at up to 10 Hz in
  `src/server/video_service.rs`, sends normalized per-display coordinates through
  `libs/scrap/src/common/record.rs`, and uploads them from
  `src/hbbs_http/record_upload.rs`. The API overlays the standard cursor during
  admin playback; old recordings made before this protocol have no cursor track.
  Keep cursor position access desktop-only: Android and iOS do not export
  `crate::get_cursor_pos()` and must return no cursor sample.
- Online state queries use the rendezvous online endpoint. API heartbeat state
  is separate: `src/hbbs_http/sync.rs` posts to `/api/heartbeat` periodically.

## DeskLink × desk-agent Integration

The agreed plan moves RustDesk API capability into the desk-agent platform and
ships both products from one installer. Decisions, the installer/uninstaller
contract, the login-free client build with a local address book, and the endpoint
list desk-agent must implement are recorded in
`/root/desk-agent/docs/desklink-integration.md`.
Read it before touching the installer, the bundled agent, or any of the client
`/api/*` reporting paths below.

Current implementation is on branch `feature/desklink-integration-phase1` in
both repositories. Client-side behavior:

- Login is disabled at the FFI boundary: `is_disable_account()` in
  `src/flutter_ffi.rs` returns `true`. Do not re-enable the account entry point
  for DeskLink builds; the product is login-free by design.
- The cloud address book stays hidden because no user can log in. The local
  address book is preserved by reusing the Favorites tab as "Address book"
  (`flutter/lib/models/peer_tab_model.dart`) and adding a local ID / alias /
  password entry dialog in `peer_tab_page.dart`.
- Local password persistence goes through `set_peer_option` in
  `src/ui_interface.rs`; `password` must be written to `PeerConfig.password`,
  not to the generic options map.
- The URL scheme is `desklink://` on Android, iOS, macOS and Linux
  (`res/rustdesk-link.desktop`). Keep all four registrations in sync.
- DeskLink HTTP clients embed `res/desklink/ca.crt`; this is required for the
  self-signed `https://10.202.10.250:18443` platform API. Do not replace it with
  a global "accept invalid certificate" default.
- `/api/heartbeat` and `/api/agent/credentials` failures are logged without
  secrets. A Windows client built before the bundled-CA change cannot report to
  the self-signed 10.250 API and must be rebuilt.
- RustDesk stores only a salted hash for an existing permanent password, so an
  upgrade cannot recover or upload that old value. The operator must set the
  permanent password once after installing a client that contains the managed
  password copy support.

Installer integration:

- Linux `.deb`: `res/DEBIAN/postinst` calls the bundled
  `/usr/share/rustdesk/agent/install.sh` when present. The agent installer
  preserves an existing HostAgent service/binary and registers its own
  boot-start service; uninstalling DeskLink must not stop or remove it.
- Windows combined installers: the build downloads the matching desk-agent
  setup from `DESKLINK_AGENT_SETUP_URL` (supports `{arch}` / `{msi_arch}`).
  The self-extracted DeskLink `-install.exe` carries it as
  `desklink-agent-setup.exe` and runs it from the elevated install script after
  DeskLink service registration. The setup file is unpacked beside the
  *extracted* client (`%LOCALAPPDATA%\rustdesk`), never into the install
  directory, so the script has to copy it across before running it
  (`get_desklink_agent_stage`); without that copy the `if exist` guard matches
  nothing and the combined package silently installs DeskLink alone - the zto64
  Windows EXE shipped exactly that bug. The MSI embeds the same setup in
  `res/msi/preprocess.py` and runs it on every install/upgrade. The Agent
  installer decides whether to install or upgrade; a stale HostAgent uninstall
  registry entry must not make DeskLink skip it.
- The same desk-agent setup remains independently downloadable at `/install/`;
  installing or removing DeskLink does not install or remove Agent.
- ARM64 Windows builds need an ARM64 agent package; do not reuse the x64 one.
- Real-machine verification is still pending for Windows x64/ARM64 EXE and MSI
  builds, the Agent uninstall registry key `{8F2C5D66-1E3B-4E9A-9B1D-7A2C4F0E5B31}_is1`,
  Linux `.deb` nested install/uninstall/reboot behavior, and browser
  `desklink://` launch behavior.

## Latest Release

`phase1-fixes5` was built from rustdesk commit `6b72202c8` with desk-agent
`1.0.1-desklink.1` (commit `7bf2696`). GitHub Actions run `38253251513`
completed successfully for Windows x64 and ARM64. The EXE and MSI payloads were
verified to contain the exact independently published Agent installers:

- Agent x64: `0890d3944abec63145e797307c25735ed49abd99e6e91366e152197fed7af3e9`
- Agent ARM64: `936c93d0c4608a6946737e08fac0c2bce62139736d200876ae4e06d8ba02445e`
- Installer x64: `717d1fb46682ffdb59052fe5826fdf96b2409694a148a6bc65442b286d57be4c`
- Installer ARM64: `f1c3262901e623b43899e0331c5bc63551ba0b43b91bb1339bba7606b567142c`

The `/install/` page now serves the same `1.0.1-desklink.1` Agent for Windows
and Linux. This release also makes the Windows EXE uninstaller delete
`%APPDATA%\DeskLink`; upgrades keep the configuration. Because older RustDesk
builds retained only a salted permanent password hash, an upgraded machine must
set the permanent password once before it can report that value.

## Installer: retiring the old client and its servers

An upgrade keeps saved settings by design, which is what broke the first phase-1
rollout: clients installed from the intermediate build kept `10.202.10.250` as
their ID/relay server (and the matching rendezvous key) even though the API
server had already moved to `10.202.22.91`. The symptom is a remote session
that reports "ID does not exist" while the device is listed on the platform,
because the client registers on the retired server.

Install now clears that state, on every install and upgrade:

- `install_me` in `src/platform/windows.rs` calls `clear_legacy_server_options`
  (drops `custom-rendezvous-server` / `relay-server` / `api-server` /
  `rendezvous-servers` options that name a retired host, drops any `key` that is
  not `RS_PUB_KEY`, and clears the cached `rendezvous_server` through the new
  `Config::clear_rendezvous_server` in `hbb_common`) and prepends
  `get_legacy_rustdesk_cleanup` to the install script, which stops and deletes a
  leftover standalone client service and its per-user, service-account and
  machine-wide config folders.
- The MSI does the same in the `CleanLegacyRustDesk` custom action
  (`res/msi/CustomActions/CustomActions.cpp`), scheduled before `InstallFiles`.
  Its legacy name is assembled from characters because `preprocess.py` rewrites
  the literal product word in that file.
- `res/DEBIAN/postinst` strips the same retired settings from the client config
  of `root` and every home directory.

The cached `rendezvous_server` matters most: `get_rendezvous_server` prefers it
over the built-in defaults, so a client whose options were already correct still
dialled `10.250` until the cache was dropped.

A user-configured server survives: it lives in the `custom-rendezvous-server`
option, which is only dropped when it names a retired host.

## Rebuilding only the non-Windows packages

`flutter-tag.yml` (workflow_dispatch) forwards `skip-windows` to
`flutter-build.yml`. Dispatching with `upload-tag=<tag>` and
`skip-windows=true` rebuilds the Linux/Android/Apple packages under an existing
tag without re-uploading the Windows installer, which is how the `.deb` is
refreshed after a Windows-only release. `only-windows=true` is the mirror case.

## Submodule Workflow

`libs/hbb_common` is a Git submodule, not ordinary vendored source.

1. Make and test the change inside `libs/hbb_common`.
2. Commit and push that repository first to `Kunlun-Hub/hbb_common`.
3. Return here, stage the new submodule pointer, and commit it with related main
   repository changes.
4. Verify `git ls-tree HEAD libs/hbb_common` points to a remotely available
   commit before tagging. CI checks out submodules recursively.

Never leave a release tag pointing at an unpushed submodule commit.

## Local Verification

Use Rust 1.98 for the branded local checks unless a workflow-specific toolchain
is being reproduced:

```bash
cargo +1.98.0 check --locked --lib
cargo +1.98.0 test -p hbb_common desklink_server_defaults_match_zto56_release --lib
cargo +1.98.0 test -p hbb_common desklink_default_remote_display_options --lib
cargo +1.98.0 test --locked --lib server::video_qos::tests
cargo +1.98.0 test --locked --lib common::tests::test_is_public_matches_rustdesk_root_domain
cd flutter
flutter analyze lib/desktop/pages/desktop_tab_page.dart
```

The server-default test name predates `zto57`; it still validates the current
embedded endpoints. Repository-wide `cargo fmt --check` currently reports
unrelated pre-existing formatting differences and a missing optional
`src/ui/inline.rs`. Format/check only touched Rust files unless undertaking a
separate formatting cleanup.

## Publishing a Client Tag

Only publish after local tests pass and both repositories are pushed:

```bash
git status --short
git -C libs/hbb_common status --short
git ls-tree HEAD libs/hbb_common
git tag -a ztoNN -m "DeskLink ztoNN" <commit>
git push preview refs/tags/ztoNN
```

`.github/workflows/flutter-tag.yml` accepts `zto*` tags and passes the tag as
`artifact-version` to `.github/workflows/flutter-build.yml`. This is what makes
package names start with `desklink-ztoNN-` while the internal app version remains
`1.4.9` where packaging tools require it.

Monitor the exact run to completion. Do not create a second tag or move the tag
because a long native build is merely slow. If a job fails, inspect its job log,
fix the owning workflow/code, push the fix, then deliberately move the same tag
only when replacing the failed release is intended.

Final checks:

```bash
gh run list --repo Kunlun-Hub/rustdesk --workflow flutter-tag.yml --limit 5
gh release view ztoNN --repo Kunlun-Hub/rustdesk --json assets,url
```

Require every installable asset to be non-empty and named
`desklink-ztoNN-*`; permit only `desklink.sbom.json` as the exception. Test at
least one Windows release URL with a one-byte Range request and expect `206`.

## Safety and Repository Boundaries

- Do not commit secrets, signing material, access tokens, or server passwords.
- Do not rewrite or push to upstream `origin` for DeskLink work.
- Do not modify unrelated legacy workspaces such as `/root/cloink`.
- The API and server have separate repositories and images. A client tag does
  not deploy either service.
- Preserve unrelated dirty changes. Inspect ownership before staging.
