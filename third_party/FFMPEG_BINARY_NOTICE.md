# FFmpeg Binary Notice

Bundled status: none

Danbi Studio currently does not include FFmpeg or FFprobe binaries in the repository or Electron package inputs. The app discovers and calls an external FFmpeg/FFprobe executable through `FFMPEG_PATH`, `FFPROBE_PATH`, packaged-resource candidates, app/cwd `bin` candidates, or system `PATH`.

Before FFmpeg/FFprobe binaries are bundled with Danbi Studio, this file must be changed to `Bundled status: present` and record:

- FFmpeg version
- provider or source URL
- binary file list
- checksum for each binary
- configure line
- license mode: LGPL build or GPL build
- `--enable-gpl` and `--enable-nonfree` status
- corresponding source archive or source offer URL
- installer/About/EULA/download-page notice text

Policy:

- Do not bundle `--enable-nonfree` FFmpeg builds.
- Do not bundle FFmpeg/FFprobe without the notice and corresponding source records required by `docs/FFMPEG_BINARY_LICENSE_BOUNDARY_KR.md`.
