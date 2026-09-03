# DeskLink Client AI Handoff

Last verified: 2026-09-03 UTC.

This repository is the DeskLink-branded RustDesk client. Read `AGENTS.md` before
editing. The product remote is `preview` (`Kunlun-Hub/rustdesk`); `origin` is the
upstream RustDesk repository and must not receive DeskLink product changes.

## Current Release

- Latest release tag before cursor-track work: `zto57`
- Release: `https://github.com/Kunlun-Hub/rustdesk/releases/tag/zto57`
- Successful workflow run: `33646246438`
- Release commit: `41ccb154bbd6f41b63203760be3d0cfad65556ee`
- `libs/hbb_common` commit in that release:
  `99ff3f1b04bc398de5bd554733f41948e7fd066b`
- The release has 26 successful jobs, one expected skipped job, and no failures.
- All installable assets use the `desklink-zto57-*` prefix. `desklink.sbom.json`
  is metadata and is the only intentional naming exception.

Treat this section as a snapshot. Verify GitHub and Git state before claiming it
is still current.

## Product Defaults

The branded defaults live in `libs/hbb_common/src/config.rs`:

- API: `http://10.202.22.90:21114`
- ID server: `10.202.22.90:21116`
- Relay: `10.202.22.90:21117`
- Public key: `I17NeGkLtixLRMrtxXvY5jQ3gDiL8yqtktCrMVwb69I=`
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
