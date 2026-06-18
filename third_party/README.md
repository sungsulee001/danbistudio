# Third Party Sources

This directory is for external source mirrors and license-bound reuse records.

- `source-mirrors/` is intentionally ignored by Git. It can contain local clones of OpenCut, OpenCut Classic, Shotcut, or other upstream repositories for audit and clean-room reference.
- `source-mirrors.lock.json` is the tracked machine-readable license lock for those local mirrors. It records the origin URL, audit commit, license file, allowed use mode, and Danbi distribution boundary.
- `source-mirrors/` must stay a local audit mirror, not a Git submodule, package script input, Electron bundle input, TypeScript input, Vitest input, static `public/` runtime asset, or runtime import path.
- Do not copy files from `source-mirrors/` into `src/` or `public/` without first updating `docs/THIRD_PARTY_SOURCE_REGISTER_KR.md`.
- OpenCut and OpenCut Classic are MIT candidates for direct/adapted reuse.
- Shotcut is GPLv3. Keep it as a separate source mirror unless the project explicitly accepts GPL-compatible distribution or a separate GPL process boundary. See `docs/SHOTCUT_GPL_BOUNDARY_KR.md`.
- Danbi Studio's own distribution license is not chosen yet. The root package is intentionally `private: true` and `license: "UNLICENSED"` until that decision is made; imported MIT notices must still be preserved.
- Run `npm run license:check` after every third-party source import.
- FFmpeg/FFprobe binaries are not currently bundled. If they are ever added to the Electron package or repository, update `third_party/FFMPEG_BINARY_NOTICE.md` and `docs/FFMPEG_BINARY_LICENSE_BOUNDARY_KR.md` before packaging.

Current local mirrors:

- `source-mirrors/opencut`: `https://github.com/opencut-app/opencut.git`, audit commit `a5888e2087c125767a394dc7fe5b919ba503ae57`, MIT.
- `source-mirrors/opencut-classic`: `https://github.com/opencut-app/opencut-classic.git`, audit commit `cf5e79e919144200294fb9fed22a222592a0aeea`, MIT.
- `source-mirrors/shotcut`: `https://github.com/mltframework/shotcut.git`, audit commit `9516f143e5c1e432d2088e91d2657c75bf6710e7`, GPLv3 reference-only.

`npm run license:check` verifies `source-mirrors.lock.json`, the mirror ignore boundary, origin URL, pinned commit, license file markers, NOTICE/register coverage, required MIT adapted-source headers, GPL boundary rules, Electron packaging inputs, lint/test/compiler excludes, and blocked Shotcut/GPL markers in Danbi runtime source roots including `src/` and `public/`.

See:

- `docs/SOURCE_REUSE_AUDIT_KR.md`
- `docs/THIRD_PARTY_LICENSE_DECISION_LOG_KR.md`
- `docs/THIRD_PARTY_LICENSE_SOURCES_KR.md`
- `docs/THIRD_PARTY_SOURCE_REGISTER_KR.md`
- `docs/THIRD_PARTY_LICENSE_COMPLIANCE_KR.md`
- `docs/LICENSE_GUARDRAILS_KR.md`
- `docs/FFMPEG_BINARY_LICENSE_BOUNDARY_KR.md`
- `docs/SHOTCUT_GPL_BOUNDARY_KR.md`
- `third_party/FFMPEG_BINARY_NOTICE.md`
- `third_party/NOTICE.md`
