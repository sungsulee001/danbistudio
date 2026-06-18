# FFmpeg Binary License Boundary KR

작성일: 2026-06-15  
상태: Danbi Studio의 FFmpeg/FFprobe 실행 파일 사용과 배포 경계 규칙.

이 문서는 법률 자문이 아니라 FFmpeg 바이너리를 앱에 동봉하거나 외부 실행 파일로 호출할 때 라이선스 실수를 막기 위한 프로젝트 운영 기준이다.

공식 근거:

- FFmpeg legal: https://ffmpeg.org/legal.html
- FFmpeg source: https://ffmpeg.org/download.html

## 1. 현재 결정

Danbi Studio는 현재 FFmpeg/FFprobe 바이너리를 repository나 Electron 패키지 입력으로 직접 포함하지 않는다.

현재 구현은 다음 순서로 외부 실행 파일을 찾는다.

- `FFMPEG_PATH`, `FFPROBE_PATH`
- packaged `resources/ffmpeg`, `resources/bin`
- 앱 또는 현재 작업 디렉터리의 `bin`
- 시스템 `PATH`

즉 현재 상태는 “사용자 또는 배포 환경이 제공한 외부 FFmpeg 실행 파일을 process 경계로 호출”하는 방식이다. Danbi repository에는 FFmpeg 소스나 바이너리를 복제하지 않는다.

## 2. 동봉 전 필수 조건

FFmpeg/FFprobe 실행 파일을 Danbi 설치 패키지에 동봉하려면 먼저 아래 기록을 추가해야 한다.

필수 기록 위치:

- `third_party/FFMPEG_BINARY_NOTICE.md`
- `docs/THIRD_PARTY_LICENSE_COMPLIANCE_KR.md`
- `docs/THIRD_PARTY_LICENSE_DECISION_LOG_KR.md`

필수 기록 항목:

- binary provider URL 또는 직접 빌드 source URL
- FFmpeg version
- binary file list
- checksum
- configure line
- license mode: LGPL build 또는 GPL build
- `--enable-gpl`, `--enable-nonfree` 포함 여부
- FFmpeg source 제공 위치와 source가 binary와 일치한다는 근거
- Danbi installer/About/EULA/download page에 들어갈 notice 문구

## 3. 허용 정책

허용:

- 시스템 설치 FFmpeg/FFprobe를 process로 호출.
- 사용자가 직접 지정한 `FFMPEG_PATH`, `FFPROBE_PATH`를 호출.
- Danbi 배포물에 포함하지 않는 로컬 개발용 FFmpeg.
- `--enable-nonfree`가 없는 audited LGPL 또는 GPL binary를 별도 notice/source 제공 정책과 함께 동봉.

주의:

- FFmpeg는 기본적으로 LGPL 2.1+로 사용할 수 있지만, optional GPL component를 포함하면 FFmpeg 전체에 GPL 조건이 적용될 수 있다.
- GPL build를 동봉하면 Danbi 배포 정책도 그 의무를 수용할 수 있어야 한다.
- `--enable-nonfree` build는 Danbi 배포물에 포함하지 않는다.

금지:

- license notice/source offer 없이 `resources/ffmpeg`, `resources/bin`, `bin`에 FFmpeg/FFprobe binary를 추가.
- `--enable-nonfree`가 포함된 FFmpeg binary를 Danbi installer나 Electron package에 포함.
- FFmpeg binary 이름을 고의로 숨기거나 license 추적이 불가능하게 변경.
- binary와 대응하지 않는 source archive를 제공.

## 4. 자동 검사

`npm run license:check`는 다음을 검사한다.

- 이 문서와 `third_party/FFMPEG_BINARY_NOTICE.md`가 존재하는지.
- 현재 notice가 “Bundled status: none” 또는 동봉 binary 기록을 명확히 갖는지.
- tracked project tree에 FFmpeg/FFprobe 실행 파일이 발견되면 notice가 “Bundled status: present”, version, checksum, configure line, source offer, license mode를 기록하는지.
- `--enable-nonfree`를 Danbi 배포 허용 항목으로 기록하지 않는지.

## 5. 현재 판정

2026-06-15 기준:

- Danbi repository에는 FFmpeg/FFprobe binary를 동봉하지 않는다.
- Electron packaging 입력에도 FFmpeg/FFprobe binary를 포함하지 않는다.
- FFmpeg는 외부 process 실행 경계로만 호출한다.
- 실제 동봉 전에는 `third_party/FFMPEG_BINARY_NOTICE.md`를 “Bundled status: present”로 바꾸고, source 제공/notice 의무를 먼저 채운 뒤 `npm run license:check`를 통과시킨다.
