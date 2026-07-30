/**
 * guards/pair-integrity.mjs — 가드 ② 페어(입력) 정합 검사
 *
 * 대응 사고(전부 ep1→ep2 사이에 실제로 겪은 것):
 *  - `CUT-16: A2V 컷이지만 바인딩된 TTS 세그먼트를 찾지 못했습니다` — 컷↔세그먼트 바인딩 붕괴
 *  - §A2V 채택 표의 **열 위치가 프로덕션마다 달라** 이미지 열을 클립으로 오독
 *  - ep1 편집 플래그가 **컷 번호만으로 색인**돼 ep2의 같은 번호 컷에 오적용
 *
 * 개별 파서마다 흩어져 있던 방어를 한 곳으로 모아, 「컷 ↔ 오디오 세그먼트 ↔ 클립 파일」의
 * 번호·바인딩을 한 번에 대조하고 근거 수치를 남긴다. 파서가 이미 던지는 조건도 **사후 조건**으로
 * 중복 확인한다 — 파서가 바뀌어도 계약은 여기서 지켜진다.
 */

import { createGuardReport } from './report.mjs';

const CUT_NUMBER_RE = /CUT-(\d+)/i;
const SEGMENT_KEY_RE = /^N(\d{2})-(\d{2})$/;
const VIDEO_EXT_RE = /\.(mp4|mov|mkv|webm)$/i;
const AUDIO_EXT_RE = /\.(wav|mp3|flac|m4a|aac)$/i;

const cutNumberOf = (text) => {
  const match = String(text ?? '').match(CUT_NUMBER_RE);
  return match ? Number(match[1]) : undefined;
};

const basenameOf = (filePath) => String(filePath ?? '').split(/[\\/]/).pop() ?? '';

/**
 * @param {object} input
 * @param {string} input.productionId
 * @param {Array}  input.cuts            해석 완료된 컷(imageAsset/clipAsset/isA2V/a2vSegmentKey 포함)
 * @param {Array}  input.ttsSegments     03-assets §세그먼트 실측표 기반 세그먼트
 * @param {Map}    [input.a2vTable]      cutId → { file, audioFile, docDuration }
 * @param {Array}  [input.sfxAssets]     해석된 SFX({cutId,file,gainDb})
 * @param {object} [input.cutAdjustments] 컷 보정 표(편집 이관 플래그)
 * @param {object} [input.sfxAdjustments] SFX 보정 표
 * @param {string} [input.adjustmentsSource] 'production-table' | 'external-json'
 */
export function checkPairIntegrity({
  productionId, cuts, ttsSegments, a2vTable, sfxAssets = [],
  cutAdjustments = {}, sfxAdjustments = {}, adjustmentsSource = 'production-table',
}) {
  const report = createGuardReport('pair-integrity', '페어(컷↔오디오↔클립) 정합');
  const cutIds = new Set(cuts.map((cut) => cut.id));
  const cutById = new Map(cuts.map((cut) => [cut.id, cut]));
  const segmentByKey = new Map(ttsSegments.map((seg) => [seg.segmentKey, seg]));

  // ---- 1. 세그먼트 대장 자체의 정합 ------------------------------------
  const seenKeys = new Set();
  for (const seg of ttsSegments) {
    if (seenKeys.has(seg.segmentKey)) {
      report.error('segment-duplicate', seg.segmentKey, '세그먼트 키가 중복됩니다 — 배치 순서가 비결정적이 됩니다', {
        assetId: seg.assetId,
      });
    }
    seenKeys.add(seg.segmentKey);
    if (!SEGMENT_KEY_RE.test(seg.segmentKey ?? '')) {
      report.error('segment-key-format', seg.assetId ?? '', '세그먼트 키 형식이 N##-## 이 아닙니다', {
        segmentKey: seg.segmentKey,
      });
      continue;
    }
    if (seg.file && !String(seg.file).startsWith(seg.segmentKey)) {
      report.error('segment-file-mismatch', seg.segmentKey,
        '세그먼트 키와 오디오 파일명의 번호가 어긋납니다 — 다른 대사의 음성이 배치됩니다', {
          file: seg.file, expectedPrefix: seg.segmentKey,
        });
    }
    if (seg.file && !AUDIO_EXT_RE.test(seg.file)) {
      report.error('segment-not-audio', seg.segmentKey, '세그먼트 파일이 오디오 확장자가 아닙니다(열 오독 의심)', {
        file: seg.file,
      });
    }
  }

  // 장면 내 순번 연속성 — 빠진 번호는 세그먼트 누락(대사 통째 실종)의 신호다.
  const byScene = new Map();
  for (const seg of ttsSegments) {
    if (!byScene.has(seg.scene)) byScene.set(seg.scene, []);
    byScene.get(seg.scene).push(seg);
  }
  for (const [scene, segs] of byScene) {
    const orders = segs.map((seg) => seg.order).sort((a, b) => a - b);
    for (let i = 0; i < orders.length; i += 1) {
      if (orders[i] !== i + 1) {
        report.warn('segment-order-gap', `N${String(scene).padStart(2, '0')}`,
          '장면 내 세그먼트 순번이 연속이 아닙니다 — 세그먼트 누락 여부 확인', { orders });
        break;
      }
    }
  }

  // ---- 2. 장면 커버리지: 컷과 오디오가 서로를 가리키는가 ----------------
  const cutScenes = new Set(cuts.map((cut) => cut.scene));
  for (const scene of byScene.keys()) {
    if (!cutScenes.has(scene)) {
      report.error('orphan-audio-scene', `N${String(scene).padStart(2, '0')}`,
        '이 장면의 오디오 세그먼트가 있으나 대응하는 컷이 없습니다', {
          segments: byScene.get(scene).map((seg) => seg.assetId),
        });
    }
  }
  for (const scene of cutScenes) {
    if (scene !== undefined && !byScene.has(scene)) {
      report.warn('silent-scene', `N${String(scene).padStart(2, '0')}`,
        '이 장면에 컷은 있으나 오디오 세그먼트가 없습니다 — 무음 장면 의도 여부 확인', {
          cuts: cuts.filter((cut) => cut.scene === scene).map((cut) => cut.id),
        });
    }
  }

  // ---- 3. A2V 바인딩 (ep2 CUT-16 사고) ---------------------------------
  const boundBySegment = new Map();
  for (const cut of cuts) {
    if (!cut.isA2V) continue;
    const key = cut.a2vSegmentKey;
    if (!key) {
      report.error('a2v-unbound', cut.id,
        'A2V 컷이지만 바인딩된 TTS 세그먼트가 없습니다 — 립싱크 대상 음성을 특정할 수 없습니다', {
          sceneRef: cut.a2vSceneRef, a2vRow: a2vTable?.get(cut.id)?.audioFile,
        });
      continue;
    }
    const segment = segmentByKey.get(key);
    if (!segment) {
      report.error('a2v-segment-missing', cut.id, '바인딩된 세그먼트가 §세그먼트 실측표에 없습니다', {
        segmentKey: key,
      });
      continue;
    }
    if (Number.isFinite(cut.scene) && segment.scene !== cut.scene) {
      report.error('a2v-scene-mismatch', cut.id, 'A2V 바인딩 세그먼트의 장면이 컷 장면과 다릅니다', {
        cutScene: cut.scene, segmentScene: segment.scene, segmentKey: key,
      });
    }
    const already = boundBySegment.get(key);
    if (already) {
      report.error('a2v-duplicate-binding', cut.id, '한 세그먼트가 둘 이상의 A2V 컷에 바인딩됐습니다', {
        segmentKey: key, otherCut: already,
      });
    } else {
      boundBySegment.set(key, cut.id);
    }

    // 채택 표 열 위치 오독 방어 — 클립 열은 영상, 오디오 열은 음성이어야 한다.
    const row = a2vTable?.get(cut.id);
    if (row) {
      if (!row.file) {
        report.error('a2v-clip-unresolved', cut.id, '§A2V 표에서 채택 클립을 해석하지 못했습니다(열 위치 확인)', {
          audioFile: row.audioFile,
        });
      } else if (!VIDEO_EXT_RE.test(row.file)) {
        report.error('a2v-clip-not-video', cut.id, '채택 클립 열의 값이 영상 파일이 아닙니다 — 열을 잘못 집었습니다', {
          file: row.file,
        });
      }
      if (row.audioFile && !AUDIO_EXT_RE.test(row.audioFile)) {
        report.error('a2v-audio-not-audio', cut.id, '오디오 열의 값이 음성 파일이 아닙니다 — 열을 잘못 집었습니다', {
          audioFile: row.audioFile,
        });
      }
      if (row.audioFile && !String(row.audioFile).startsWith(key)) {
        report.error('a2v-audio-key-mismatch', cut.id, '오디오 열 파일명이 바인딩 세그먼트 키와 어긋납니다', {
          audioFile: row.audioFile, segmentKey: key,
        });
      }
    }
  }
  // 표에는 있는데 컷은 A2V가 아닌 경우(콘티↔대장 불일치)
  for (const cutId of a2vTable?.keys() ?? []) {
    if (!cutIds.has(cutId)) {
      report.error('a2v-unknown-cut', cutId, '§A2V 표가 이 프로덕션에 없는 컷을 가리킵니다', {
        productionId,
      });
      continue;
    }
    const cut = cutById.get(cutId);
    if (cut && !cut.isA2V && !cut.a2vPending) {
      report.warn('a2v-table-orphan', cutId, '§A2V 표에 있으나 컷이 A2V로 표시되지 않았습니다', {});
    }
  }

  // ---- 4. 클립 파일 번호 ↔ 컷 번호 ------------------------------------
  for (const cut of cuts) {
    if (!cut.clipAsset) continue;
    const file = basenameOf(cut.clipAsset.file ?? cut.clipAsset.path);
    const fileNumber = cutNumberOf(file);
    const cutNumber = cutNumberOf(cut.id);
    if (fileNumber === undefined || cutNumber === undefined) continue;
    if (fileNumber !== cutNumber) {
      report.error('clip-number-mismatch', cut.id,
        '클립 파일명의 컷 번호가 컷과 다릅니다 — 다른 컷의 영상이 배치됩니다', {
          file, fileCutNumber: fileNumber, cutNumber,
        });
    }
  }
  // 이미지는 **컷 간 재사용이 설계된 자원**이다(콘티 재사용 매핑 표) — 번호 불일치가 곧 결함은
  // 아니므로 경고로만 드러낸다. 클립·오디오와 달리 여기서 실패시키면 정상 산출을 막는다.
  for (const cut of cuts) {
    if (!cut.imageAsset) continue;
    const file = basenameOf(cut.imageAsset.file ?? cut.imageAsset.path);
    const fileNumber = cutNumberOf(file);
    const cutNumber = cutNumberOf(cut.id);
    if (fileNumber === undefined || cutNumber === undefined) continue;
    if (fileNumber !== cutNumber) {
      report.warn('image-reuse', cut.id, '다른 컷 번호의 이미지를 씁니다 — 재사용 매핑 표의 의도인지 확인', {
        file, fileCutNumber: fileNumber, cutNumber,
      });
    }
  }

  // ---- 5. SFX 1:1 -----------------------------------------------------
  const sfxSeen = new Set();
  for (const entry of sfxAssets) {
    if (!cutIds.has(entry.cutId)) {
      report.error('sfx-unknown-cut', entry.cutId, 'SFX가 이 프로덕션에 없는 컷을 가리킵니다', {
        file: entry.file, productionId,
      });
      continue;
    }
    if (sfxSeen.has(entry.cutId)) {
      report.error('sfx-duplicate', entry.cutId, '한 컷에 SFX가 둘 이상 배치됐습니다(컷 1:1 계약 위반)', {
        file: entry.file,
      });
    }
    sfxSeen.add(entry.cutId);
  }

  // ---- 6. 보정 표 색인 범위 (ep1 플래그가 ep2에 오적용된 사고) ----------
  for (const [label, table] of [['cut', cutAdjustments], ['sfx', sfxAdjustments]]) {
    for (const cutId of Object.keys(table ?? {})) {
      if (cutIds.has(cutId)) continue;
      report.error(`${label}-adjustment-unknown-cut`, cutId,
        `${label === 'cut' ? '편집 이관 플래그' : 'SFX 보정'}가 이 프로덕션에 없는 컷을 가리킵니다 — `
        + '다른 에피소드의 표가 섞였는지 확인하십시오(컷 번호만으로 색인 금지)', {
          productionId, source: adjustmentsSource,
        });
    }
  }
  report.info('adjustment-scope', productionId, '보정 표 색인 범위 확인', {
    cutAdjustments: Object.keys(cutAdjustments ?? {}).length,
    sfxAdjustments: Object.keys(sfxAdjustments ?? {}).length,
    source: adjustmentsSource,
  });

  report.info('checked', productionId, '페어 정합 검사 완료', {
    cuts: cuts.length, segments: ttsSegments.length,
    a2vCuts: cuts.filter((cut) => cut.isA2V).length, sfx: sfxAssets.length,
  });
  return report;
}
