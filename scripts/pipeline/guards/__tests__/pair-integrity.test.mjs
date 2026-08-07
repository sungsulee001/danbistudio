/**
 * 가드 ② 페어(입력) 정합 — 탐지 실증
 *
 * 재현 사고:
 *  - `CUT-16: A2V 컷이지만 바인딩된 TTS 세그먼트를 찾지 못했습니다`
 *  - §A2V 채택 표의 열 위치 상이로 이미지 열을 클립으로 오독
 *  - ep1 편집 플래그가 컷 번호만으로 색인돼 ep2 동일 번호 컷에 오적용
 */

import { describe, it, expect } from 'vitest';
import { checkPairIntegrity } from '../pair-integrity.mjs';

const codesOf = (report, severity) => report.findings
  .filter((finding) => finding.severity === severity)
  .map((finding) => finding.code);

const segment = (key, extra = {}) => {
  const [, scene, order] = key.match(/^N(\d{2})-(\d{2})$/);
  return {
    assetId: `${key}-narrator`, segmentKey: key, scene: Number(scene), order: Number(order),
    speaker: 'narrator', file: `${key}-narrator.wav`, duration: 3, ...extra,
  };
};

const cut = (id, scene, extra = {}) => ({
  id, scene, isA2V: false,
  imageAsset: { assetId: `${id}-img`, file: `${id}.png`, path: `C:/x/${id}.png` },
  clipAsset: { assetId: `${id}-i2v`, file: `${id}.mp4`, path: `C:/x/${id}.mp4`, duration: 5 },
  ...extra,
});

const healthy = () => ({
  productionId: '2026-07-29-jagyeongnu-night',
  cuts: [cut('CUT-01', 1), cut('CUT-02', 1), cut('CUT-03', 2)],
  ttsSegments: [segment('N01-01'), segment('N01-02'), segment('N02-01')],
  a2vTable: new Map(),
  sfxAssets: [],
  cutAdjustments: {},
  sfxAdjustments: {},
});

describe('checkPairIntegrity', () => {
  it('정상 입력에서는 error가 없다 (오탐 없음)', () => {
    const report = checkPairIntegrity(healthy());
    expect(codesOf(report, 'error')).toEqual([]);
  });

  it('A2V 컷의 세그먼트 바인딩이 없으면 ERROR (ep2 CUT-16 재현)', () => {
    const input = healthy();
    input.cuts.push(cut('CUT-16', 2, { isA2V: true, a2vSegmentKey: undefined, a2vSceneRef: 'N02' }));
    const report = checkPairIntegrity(input);
    const finding = report.findings.find((item) => item.code === 'a2v-unbound');
    expect(finding).toBeDefined();
    expect(finding.subject).toBe('CUT-16');
    expect(finding.severity).toBe('error');
  });

  it('바인딩된 세그먼트가 대장에 없으면 ERROR', () => {
    const input = healthy();
    input.cuts.push(cut('CUT-04', 2, { isA2V: true, a2vSegmentKey: 'N02-09' }));
    const report = checkPairIntegrity(input);
    expect(codesOf(report, 'error')).toContain('a2v-segment-missing');
  });

  it('A2V 바인딩 세그먼트의 장면이 컷과 다르면 ERROR', () => {
    const input = healthy();
    input.cuts.push(cut('CUT-04', 2, { isA2V: true, a2vSegmentKey: 'N01-01' }));
    const report = checkPairIntegrity(input);
    expect(codesOf(report, 'error')).toContain('a2v-scene-mismatch');
  });

  it('한 세그먼트를 두 A2V 컷이 나눠 가지면 ERROR', () => {
    const input = healthy();
    input.cuts.push(cut('CUT-04', 2, { isA2V: true, a2vSegmentKey: 'N02-01' }));
    input.cuts.push(cut('CUT-05', 2, { isA2V: true, a2vSegmentKey: 'N02-01' }));
    const report = checkPairIntegrity(input);
    expect(codesOf(report, 'error')).toContain('a2v-duplicate-binding');
  });

  it('채택 표 열을 잘못 집어 클립 칸에 이미지가 들어오면 ERROR (열 위치 오독 재현)', () => {
    const input = healthy();
    input.cuts.push(cut('CUT-04', 2, { isA2V: true, a2vSegmentKey: 'N02-01' }));
    input.a2vTable = new Map([
      // ep2 형상: 2열이 채택 클립이 아니라 **입력 이미지**여서 png가 잡혔다.
      ['CUT-04', { file: 'CUT-04-p2.png', audioFile: 'N02-01-narrator.wav' }],
    ]);
    const report = checkPairIntegrity(input);
    expect(codesOf(report, 'error')).toContain('a2v-clip-not-video');
  });

  it('오디오 열의 파일명이 바인딩 키와 어긋나면 ERROR', () => {
    const input = healthy();
    input.cuts.push(cut('CUT-04', 2, { isA2V: true, a2vSegmentKey: 'N02-01' }));
    input.a2vTable = new Map([
      ['CUT-04', { file: 'CUT-04.mp4', audioFile: 'N01-02-narrator.wav' }],
    ]);
    const report = checkPairIntegrity(input);
    expect(codesOf(report, 'error')).toContain('a2v-audio-key-mismatch');
  });

  it('ep1 편집 플래그를 ep2 컷 목록에 적용하면 ERROR (컷 번호 색인 오적용 재현)', () => {
    const input = healthy();
    // ep1의 보정 표(CUT-07/CUT-11/CUT-32 …)를 그대로 물려받았다고 가정.
    input.cutAdjustments = {
      'CUT-01': { crop: { bottom: 0.18 } },   // 이 프로덕션에 존재 — 통과
      'CUT-32': { crop: { bottom: 0.18 } },   // ep1에만 있는 컷 — 잡혀야 한다
      'CUT-35': { crop: { top: 0.1 } },
    };
    const report = checkPairIntegrity(input);
    const findings = report.findings.filter((item) => item.code === 'cut-adjustment-unknown-cut');
    expect(findings.map((item) => item.subject).sort()).toEqual(['CUT-32', 'CUT-35']);
    expect(findings[0].severity).toBe('error');
    expect(findings[0].evidence.productionId).toBe('2026-07-29-jagyeongnu-night');
  });

  it('SFX 보정 표도 같은 색인 범위 검사를 받는다', () => {
    const input = healthy();
    input.sfxAdjustments = { 'CUT-99': { gainDb: -3 } };
    const report = checkPairIntegrity(input);
    expect(codesOf(report, 'error')).toContain('sfx-adjustment-unknown-cut');
  });

  it('클립 파일명의 컷 번호가 다르면 ERROR (다른 컷 영상 배치 방지)', () => {
    const input = healthy();
    input.cuts[1].clipAsset = { assetId: 'x', file: 'CUT-07.mp4', path: 'C:/x/CUT-07.mp4', duration: 5 };
    const report = checkPairIntegrity(input);
    const finding = report.findings.find((item) => item.code === 'clip-number-mismatch');
    expect(finding.evidence).toMatchObject({ fileCutNumber: 7, cutNumber: 2 });
  });

  it('재테이크 접미(-r2)는 오탐하지 않는다', () => {
    const input = healthy();
    input.cuts[1].clipAsset = { assetId: 'x', file: 'CUT-02-r2.mp4', path: 'C:/x/CUT-02-r2.mp4', duration: 5 };
    const report = checkPairIntegrity(input);
    expect(codesOf(report, 'error')).toEqual([]);
  });

  it('세그먼트 키와 오디오 파일명이 어긋나면 ERROR', () => {
    const input = healthy();
    input.ttsSegments[1] = segment('N01-02', { file: 'N01-03-narrator.wav' });
    const report = checkPairIntegrity(input);
    expect(codesOf(report, 'error')).toContain('segment-file-mismatch');
  });

  it('세그먼트 키 중복은 ERROR', () => {
    const input = healthy();
    input.ttsSegments.push(segment('N01-01'));
    const report = checkPairIntegrity(input);
    expect(codesOf(report, 'error')).toContain('segment-duplicate');
  });

  it('장면 내 순번이 끊기면 WARN', () => {
    const input = healthy();
    input.ttsSegments = [segment('N01-01'), segment('N01-03'), segment('N02-01')];
    const report = checkPairIntegrity(input);
    expect(codesOf(report, 'warn')).toContain('segment-order-gap');
  });

  it('컷 없는 장면의 오디오는 ERROR', () => {
    const input = healthy();
    input.ttsSegments.push(segment('N09-01'));
    const report = checkPairIntegrity(input);
    expect(codesOf(report, 'error')).toContain('orphan-audio-scene');
  });

  // 계약 개정(2026-08-07 인간 결정): SFX는 「컷 1:1」이 아니라 「배치 단위」다.
  // ep3~는 오디오-라이브러리 원본을 직접 참조하며 한 컷에 서로 다른 소스를 겹쳐 깐다
  // (예: 말발굽 + 군중 웅성). 결함으로 봐야 하는 것은 **같은 소스의 중복 배치**뿐이다.
  it('한 컷에 같은 소스의 SFX가 둘이면 ERROR', () => {
    const input = healthy();
    input.sfxAssets = [
      { cutId: 'CUT-01', file: 'a.wav' },
      { cutId: 'CUT-01', file: 'a.wav' },
    ];
    const report = checkPairIntegrity(input);
    expect(codesOf(report, 'error')).toContain('sfx-duplicate');
  });

  it('한 컷에 서로 다른 소스의 SFX가 둘이면 ERROR가 아니라 info', () => {
    const input = healthy();
    input.sfxAssets = [
      { cutId: 'CUT-01', file: 'a.wav' },
      { cutId: 'CUT-01', file: 'b.wav' },
    ];
    const report = checkPairIntegrity(input);
    expect(codesOf(report, 'error')).not.toContain('sfx-duplicate');
    expect(codesOf(report, 'info')).toContain('sfx-multi-placement');
  });

  it('A2V 컷에 세그먼트가 둘이면 둘 다 바인딩 검사한다(이중 재생 방지)', () => {
    const input = healthy();
    const target = input.cuts[0];
    target.isA2V = true;
    target.a2vSegmentKey = 'N01-01';
    target.a2vSegmentKeys = ['N01-01', 'N99-01'];
    input.a2vTable = new Map([['CUT-01', {
      file: 'CUT-01.mp4',
      audioFiles: ['N01-01-narrator.wav', 'N99-01-narrator.wav'],
    }]]);
    const report = checkPairIntegrity(input);
    expect(codesOf(report, 'error')).toContain('a2v-segment-missing');
    expect(codesOf(report, 'info')).toContain('a2v-multi-segment');
  });
});
