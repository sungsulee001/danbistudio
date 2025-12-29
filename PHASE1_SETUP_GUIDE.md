# Phase 1: StabilityMatrix 설정 가이드

## 경로 정보
- **StabilityMatrix**: `E:\ai_tool\StabilityMatrix`
- **ComfyUI Package**: `E:\ai_tool\StabilityMatrix\Data\Packages\DanbiStudio-ComfyUI`

---

## 1. StabilityMatrix에서 ComfyUI 패키지 생성

### 1.1 StabilityMatrix 실행
```
E:\ai_tool\StabilityMatrix\StabilityMatrix.exe
```

### 1.2 ComfyUI 패키지 추가
1. **Packages** 탭 클릭
2. **Add Package** 버튼
3. 선택:
   - Package Type: **ComfyUI**
   - Version: **Stable** (권장)
   - Package Name: `DanbiStudio-ComfyUI`
4. **Install** 클릭

### 1.3 Launch Arguments 설정
패키지 생성 후:
1. 패키지 우클릭 → **Settings**
2. **Launch Options** 탭
3. **Extra Launch Arguments**에 입력:
   ```
   --listen 127.0.0.1 --port 8188
   ```
4. **Save**

---

## 2. Custom Nodes 설치

### 2.1 ComfyUI-Manager (필수)
1. 패키지 실행 (Launch 버튼)
2. ComfyUI 웹 UI 열림: http://localhost:8188
3. **Manager** 버튼 클릭
4. **Install Custom Nodes**
5. 검색: `ComfyUI-Manager`
6. **Install**

### 2.2 WanVideoWrapper (WAN 모델용)
1. Manager → Install Custom Nodes
2. 검색: `ComfyUI-WanVideoWrapper`
3. **Install**
4. 재시작 필요 시 재시작

### 2.3 VideoHelperSuite (비디오 처리)
1. Manager → Install Custom Nodes
2. 검색: `ComfyUI-VideoHelperSuite`
3. **Install**

**설치 완료 후 ComfyUI 재시작**

---

## 3. WAN 모델 다운로드

### 3.1 StabilityMatrix Model Browser 사용
1. StabilityMatrix → **Model Browser** 탭
2. 검색: `WAN 2.1`
3. 찾기: `wan2.1-i2v-14b-480p-fp8-scaled.safetensors`
4. **Download** 클릭
5. 저장 위치 선택:
   ```
   E:\ai_tool\StabilityMatrix\Data\Packages\DanbiStudio-ComfyUI\models\diffusion_models
   ```
6. 다운로드 대기 (~14GB, 시간 소요)

### 3.2 수동 다운로드 (대안)
HuggingFace에서 다운로드 후 위 경로에 복사

---

## 4. 테스트 워크플로우 다운로드

### 4.1 WAN 공식 워크플로우
다운로드:
```
https://github.com/Wan-AI/wan2.1-comfyui/blob/main/examples/image2video.json
```

저장 위치:
```
E:\ai_tool\StabilityMatrix\Data\Packages\DanbiStudio-ComfyUI\workflows\wan_i2v_test.json
```

### 4.2 ComfyUI에서 테스트
1. ComfyUI 웹 UI 열기: http://localhost:8188
2. **Load** 버튼 → Import
3. `wan_i2v_test.json` 선택
4. 워크플로우 로드 확인
5. **Queue Prompt** 버튼 (테스트, 모델 없으면 에러 - 정상)

---

## 5. 경로 확인

### 5.1 디렉토리 구조 확인
```
E:\ai_tool\StabilityMatrix\
├── StabilityMatrix.exe
└── Data\
    └── Packages\
        └── DanbiStudio-ComfyUI\
            ├── main.py
            ├── custom_nodes\
            │   ├── ComfyUI-Manager\
            │   ├── ComfyUI-WanVideoWrapper\
            │   └── ComfyUI-VideoHelperSuite\
            ├── models\
            │   ├── checkpoints\
            │   ├── diffusion_models\
            │   │   └── wan2.1-i2v-14b-480p-fp8-scaled.safetensors
            │   ├── upscale_models\
            │   └── controlnet\
            ├── output\
            └── workflows\
                └── wan_i2v_test.json
```

### 5.2 Windows 탐색기로 확인
```
Win + R
E:\ai_tool\StabilityMatrix\Data\Packages\DanbiStudio-ComfyUI
```

폴더 열고 구조 확인

---

## 6. ComfyUI API 테스트

### 6.1 PowerShell 테스트
```powershell
# ComfyUI가 실행 중인지 확인
Invoke-WebRequest http://localhost:8188/system_stats

# 성공 시: GPU 정보 JSON 반환
# 실패 시: 연결 오류 (ComfyUI 시작 필요)
```

### 6.2 브라우저 테스트
```
http://localhost:8188/system_stats
```

JSON 출력 확인:
```json
{
  "system": {
    "os": "Windows",
    "devices": [
      {
        "name": "NVIDIA GeForce RTX 3090",
        "type": "cuda",
        "vram_total": 25769803776,
        "vram_free": 23456789012
      }
    ]
  }
}
```

---

## 7. Phase 1 완료 체크리스트

- [ ] StabilityMatrix 설치 확인: `E:\ai_tool\StabilityMatrix`
- [ ] ComfyUI 패키지 생성: `DanbiStudio-ComfyUI`
- [ ] Launch Arguments 설정: `--listen 127.0.0.1 --port 8188`
- [ ] Custom Nodes 설치:
  - [ ] ComfyUI-Manager
  - [ ] WanVideoWrapper
  - [ ] VideoHelperSuite
- [ ] WAN 모델 다운로드: `wan2.1-i2v-14b-480p-fp8-scaled.safetensors`
- [ ] 테스트 워크플로우 다운로드: `wan_i2v_test.json`
- [ ] ComfyUI 실행 확인: http://localhost:8188
- [ ] API 응답 확인: `/system_stats` 정상
- [ ] 워크플로우 로드 테스트 통과

---

## 트러블슈팅

### ComfyUI 실행 안됨
```
StabilityMatrix → Packages → DanbiStudio-ComfyUI → Console
에러 로그 확인
```

### 모델 인식 안됨
```
경로 확인:
E:\ai_tool\StabilityMatrix\Data\Packages\DanbiStudio-ComfyUI\models\diffusion_models\

파일 있는지 확인:
wan2.1-i2v-14b-480p-fp8-scaled.safetensors (약 14GB)
```

### Custom Node 오류
```
ComfyUI → Manager → Update All
재시작
```

### 포트 충돌 (8188 사용 중)
```
Launch Arguments 변경:
--listen 127.0.0.1 --port 8189
```

---

## 다음 단계

Phase 1 완료 후:
```
1. .env 파일 복사 (프로젝트 루트에)
2. Claude Code에게 전달:
   "Phase 1 완료. Phase 2 시작하자"
```
