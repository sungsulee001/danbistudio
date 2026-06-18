import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

interface PreviewWorkerMp4Sample {
  index: number;
  keyframe: boolean;
  pts: number;
  dts: number;
  duration: number;
  data: Uint8Array;
}

interface PreviewWorkerMp4Edit {
  movieStart: number;
  movieEnd: number;
  mediaStart: number;
  rate: number;
}

interface PreviewWorkerBox {
  type?: string;
  id?: number;
  start: number;
  dataStart: number;
  end: number;
}

interface PreviewWorkerInternals {
  applyMp4EditListToSamples(samples: PreviewWorkerMp4Sample[], edits: PreviewWorkerMp4Edit[]): PreviewWorkerMp4Sample[];
  buildVideoFrameDrawPlan(targetWidth: number, targetHeight: number, orientation?: { rotation?: number }): {
    rotation: number;
    rotationRadians: number;
    translateX: number;
    translateY: number;
    drawWidth: number;
    drawHeight: number;
  };
  demuxWebmVideoFrameSamples(bytes: Uint8Array, targetSeconds: number): {
    codec: string;
    description?: Uint8Array;
    samples: PreviewWorkerMp4Sample[];
    targetSeconds: number;
    reason: string;
  };
  readVideoContainerFromSource(source: string): 'mp4' | 'webm' | 'unknown';
  parseMp4Boxes(bytes: Uint8Array, start: number, end: number): PreviewWorkerBox[];
  parseEbmlElements(bytes: Uint8Array, start: number, end: number): PreviewWorkerBox[];
  readMp4EditList(
    bytes: Uint8Array,
    trakChildren: PreviewWorkerBox[],
    movieTimescale: number,
    mediaTimescale: number,
  ): PreviewWorkerMp4Edit[];
  readMp4SampleSizes(
    bytes: Uint8Array,
    stszOrStz2: PreviewWorkerBox,
  ): number[];
  readMp4SampleDurations(
    bytes: Uint8Array,
    stts: PreviewWorkerBox,
    sampleCount: number,
  ): number[];
  readMp4CompositionOffsets(
    bytes: Uint8Array,
    ctts: PreviewWorkerBox,
    sampleCount: number,
  ): number[];
  readMp4Keyframes(
    bytes: Uint8Array,
    stss: PreviewWorkerBox,
    sampleCount: number,
  ): Set<number>;
  readMp4MediaTimescale(
    bytes: Uint8Array,
    mdhd: PreviewWorkerBox,
  ): number;
  readMp4MovieTimescale(
    bytes: Uint8Array,
    moov: PreviewWorkerBox,
  ): number;
  readMp4SampleDescription(
    bytes: Uint8Array,
    stsd: PreviewWorkerBox,
  ): { codecFamily: string; codec: string; description?: Uint8Array } | null;
  readMp4ChunkOffsets(
    bytes: Uint8Array,
    stcoOrCo64: PreviewWorkerBox,
  ): number[];
  readMp4SampleToChunk(
    bytes: Uint8Array,
    stsc: PreviewWorkerBox,
  ): Array<{ firstChunk: number; samplesPerChunk: number }>;
  readMp4TrackFragmentHeader(
    bytes: Uint8Array,
    tfhd: PreviewWorkerBox,
    moof: PreviewWorkerBox,
  ): {
    trackId: number;
    baseDataOffset?: number;
    defaultSampleDuration?: number;
    defaultSampleSize?: number;
    defaultSampleFlags?: number;
    defaultBaseIsMoof: boolean;
  } | null;
  readMp4TrackFragmentDecodeTime(
    bytes: Uint8Array,
    tfdt: PreviewWorkerBox,
  ): number;
  readMp4TrackRun(
    bytes: Uint8Array,
    trun: PreviewWorkerBox,
  ): {
    dataOffset?: number;
    firstSampleFlags?: number;
    samples: Array<{
      duration?: number;
      size?: number;
      flags?: number;
      compositionTimeOffset?: number;
    }>;
  };
  buildMp4SampleOffsets(
    sampleSizes: number[],
    chunkOffsets: number[],
    sampleToChunk: Array<{ firstChunk: number; samplesPerChunk: number }>,
  ): number[];
  readMp4TrackDisplayOrientation(
    bytes: Uint8Array,
    trakChildren: PreviewWorkerBox[],
  ): { rotation: number };
  readWebmVideoTrack(
    bytes: Uint8Array,
    tracks: PreviewWorkerBox,
  ): { trackNumber: number; codec: string; codecLabel?: string; description?: Uint8Array; defaultDurationSeconds: number } | null;
  readWebmBlockFrameSlices(
    bytes: Uint8Array,
    offset: number,
    end: number,
    lacing: number,
  ): Array<{ start: number; end: number }>;
  readWebmBlockSamples(
    bytes: Uint8Array,
    block: PreviewWorkerBox,
    clusterTimecode: number,
    timecodeScale: number,
    expectedTrackNumber: number,
    defaultDurationSeconds: number,
    keyframeOverride?: boolean,
    durationSeconds?: number,
  ): PreviewWorkerMp4Sample[] | null;
  resolveMp4FragmentRunDataCursor(options: {
    trun: { dataOffset?: number };
    baseDataOffset: number;
    fallbackMdatStart?: number;
    nextTrafDataCursor?: number;
  }): number;
  resolveMp4DisplayOrientation(matrix: number[]): { rotation: number };
  selectVideoDecodeSamples(samples: PreviewWorkerMp4Sample[], targetSeconds: number, label: string): PreviewWorkerMp4Sample[];
}

describe('preview worker MP4 internals', () => {
  it('routes QuickTime-compatible file extensions to the MP4 demux path', () => {
    const internals = loadPreviewWorkerInternals();

    expect(internals.readVideoContainerFromSource('/imports/camera.mp4?cache=1')).toBe('mp4');
    expect(internals.readVideoContainerFromSource('/imports/camera.M4V')).toBe('mp4');
    expect(internals.readVideoContainerFromSource('/imports/camera.mov#t=1')).toBe('mp4');
    expect(internals.readVideoContainerFromSource('/imports/camera.qt')).toBe('mp4');
    expect(internals.readVideoContainerFromSource('/imports/camera.webm')).toBe('webm');
    expect(internals.readVideoContainerFromSource('/imports/camera.mkv')).toBe('webm');
    expect(internals.readVideoContainerFromSource('/imports/camera.avi')).toBe('unknown');
  });

  it('parses MP4 edit lists and maps media PTS into movie timeline time', () => {
    const internals = loadPreviewWorkerInternals();
    const edts = buildMp4Box('edts', buildMp4Box('elst', Buffer.concat([
      Buffer.from([0, 0, 0, 0]),
      uint32(2),
      uint32(500),
      int32(-1),
      int16(1),
      uint16(0),
      uint32(1000),
      int32(1024),
      int16(1),
      uint16(0),
    ])));
    const bytes = Uint8Array.from(edts);
    const trakChildren = internals.parseMp4Boxes(bytes, 0, bytes.length);

    const edits = internals.readMp4EditList(bytes, trakChildren, 1000, 48000);
    expect(edits).toHaveLength(1);
    expect(edits[0]).toMatchObject({
      movieStart: 0.5,
      movieEnd: 1.5,
      rate: 1,
    });
    expect(edits[0].mediaStart).toBeCloseTo(1024 / 48000, 6);
  });

  it('keeps MP4 preroll samples and shifts edit-list media timestamps before decode', () => {
    const internals = loadPreviewWorkerInternals();
    const edits = [{ movieStart: 0.5, movieEnd: 2.5, mediaStart: 0.1, rate: 1 }];
    const samples: PreviewWorkerMp4Sample[] = [
      buildMp4Sample(0, true, 0.04, 0),
      buildMp4Sample(1, false, 0.1, 0.04),
      buildMp4Sample(2, false, 0.14, 0.08),
    ];

    const adjusted = internals.applyMp4EditListToSamples(samples, edits);
    expect(adjusted).toHaveLength(3);
    expect(adjusted[0]).toMatchObject({ index: 0, keyframe: true });
    expect(adjusted[0].pts).toBeCloseTo(0.44, 6);
    expect(adjusted[1].pts).toBeCloseTo(0.5, 6);
    expect(adjusted[1].dts).toBeCloseTo(0.44, 6);
    expect(adjusted[2].pts).toBeCloseTo(0.54, 6);

    const selected = internals.selectVideoDecodeSamples(adjusted, 0.52, 'MP4');
    expect(selected.map((sample) => sample.index)).toEqual([0, 1, 2]);
  });

  it('expands MP4 compact stz2 sample-size tables', () => {
    const internals = loadPreviewWorkerInternals();

    const fourBitBox = buildStz2Box(4, Buffer.from([0x12, 0xf0, 0x70]), 5);
    const fourBitBytes = Uint8Array.from(fourBitBox);
    const fourBit = internals.parseMp4Boxes(fourBitBytes, 0, fourBitBytes.length)[0];
    expect(internals.readMp4SampleSizes(fourBitBytes, fourBit)).toEqual([1, 2, 15, 0, 7]);

    const eightBitBox = buildStz2Box(8, Buffer.from([12, 34, 56]), 3);
    const eightBitBytes = Uint8Array.from(eightBitBox);
    const eightBit = internals.parseMp4Boxes(eightBitBytes, 0, eightBitBytes.length)[0];
    expect(internals.readMp4SampleSizes(eightBitBytes, eightBit)).toEqual([12, 34, 56]);

    const sixteenBitBox = buildStz2Box(16, Buffer.concat([uint16(300), uint16(1024)]), 2);
    const sixteenBitBytes = Uint8Array.from(sixteenBitBox);
    const sixteenBit = internals.parseMp4Boxes(sixteenBitBytes, 0, sixteenBitBytes.length)[0];
    expect(internals.readMp4SampleSizes(sixteenBitBytes, sixteenBit)).toEqual([300, 1024]);
  });

  it('reads MP4 metadata tables and rejects truncated mdhd/mvhd/stsd boxes', () => {
    const internals = loadPreviewWorkerInternals();

    const mdhdV0Bytes = Uint8Array.from(buildFullMp4Box('mdhd', Buffer.concat([
      uint32(0),
      uint32(0),
      uint32(48_000),
      uint32(0),
    ])));
    const mdhdV0 = internals.parseMp4Boxes(mdhdV0Bytes, 0, mdhdV0Bytes.length)[0];
    expect(internals.readMp4MediaTimescale(mdhdV0Bytes, mdhdV0)).toBe(48_000);

    const mdhdV1Bytes = Uint8Array.from(buildFullMp4Box('mdhd', Buffer.concat([
      uint64(0n),
      uint64(0n),
      uint32(90_000),
    ]), 0, 1));
    const mdhdV1 = internals.parseMp4Boxes(mdhdV1Bytes, 0, mdhdV1Bytes.length)[0];
    expect(internals.readMp4MediaTimescale(mdhdV1Bytes, mdhdV1)).toBe(90_000);

    const truncatedMdhdBytes = Uint8Array.from(buildFullMp4Box('mdhd', uint32(0)));
    const truncatedMdhd = internals.parseMp4Boxes(truncatedMdhdBytes, 0, truncatedMdhdBytes.length)[0];
    expect(() => internals.readMp4MediaTimescale(truncatedMdhdBytes, truncatedMdhd)).toThrow('media header is truncated');

    const moovBytes = Uint8Array.from(buildMp4Box('moov', buildFullMp4Box('mvhd', Buffer.concat([
      uint32(0),
      uint32(0),
      uint32(1000),
      uint32(0),
    ]))));
    const moov = internals.parseMp4Boxes(moovBytes, 0, moovBytes.length)[0];
    expect(internals.readMp4MovieTimescale(moovBytes, moov)).toBe(1000);

    const truncatedMoovBytes = Uint8Array.from(buildMp4Box('moov', buildFullMp4Box('mvhd', uint32(0))));
    const truncatedMoov = internals.parseMp4Boxes(truncatedMoovBytes, 0, truncatedMoovBytes.length)[0];
    expect(() => internals.readMp4MovieTimescale(truncatedMoovBytes, truncatedMoov)).toThrow('movie header is truncated');

    const avcDecoderConfig = Buffer.from([1, 0x42, 0xc0, 0x1e]);
    const stsdBytes = Uint8Array.from(buildFullMp4Box('stsd', Buffer.concat([
      uint32(1),
      buildMp4Box('avc1', Buffer.concat([
        Buffer.alloc(78),
        buildMp4Box('avcC', avcDecoderConfig),
      ])),
    ])));
    const stsd = internals.parseMp4Boxes(stsdBytes, 0, stsdBytes.length)[0];
    expect(internals.readMp4SampleDescription(stsdBytes, stsd)).toMatchObject({
      codecFamily: 'avc',
      codec: 'avc1.42C01E',
      description: Uint8Array.from(avcDecoderConfig),
    });

    const avc3DecoderConfig = Buffer.from([1, 0x64, 0x00, 0x2a]);
    const avc3StsdBytes = Uint8Array.from(buildFullMp4Box('stsd', Buffer.concat([
      uint32(1),
      buildMp4Box('avc3', Buffer.concat([
        Buffer.alloc(78),
        buildMp4Box('avcC', avc3DecoderConfig),
      ])),
    ])));
    const avc3Stsd = internals.parseMp4Boxes(avc3StsdBytes, 0, avc3StsdBytes.length)[0];
    expect(internals.readMp4SampleDescription(avc3StsdBytes, avc3Stsd)).toMatchObject({
      codecFamily: 'avc',
      codec: 'avc3.64002A',
      description: Uint8Array.from(avc3DecoderConfig),
    });

    const av1DecoderConfig = Buffer.from([0x81, 0x04, 0x00, 0x00]);
    const av1StsdBytes = Uint8Array.from(buildFullMp4Box('stsd', Buffer.concat([
      uint32(1),
      buildMp4Box('av01', Buffer.concat([
        Buffer.alloc(78),
        buildMp4Box('av1C', av1DecoderConfig),
      ])),
    ])));
    const av1Stsd = internals.parseMp4Boxes(av1StsdBytes, 0, av1StsdBytes.length)[0];
    expect(internals.readMp4SampleDescription(av1StsdBytes, av1Stsd)).toMatchObject({
      codecFamily: 'av1',
      codec: 'av01.0.04M.08',
    });

    const vp9DecoderConfig = Buffer.from([1, 0, 0, 0, 0, 10, 0x80]);
    const vp9StsdBytes = Uint8Array.from(buildFullMp4Box('stsd', Buffer.concat([
      uint32(1),
      buildMp4Box('vp09', Buffer.concat([
        Buffer.alloc(78),
        buildMp4Box('vpcC', vp9DecoderConfig),
      ])),
    ])));
    const vp9Stsd = internals.parseMp4Boxes(vp9StsdBytes, 0, vp9StsdBytes.length)[0];
    expect(internals.readMp4SampleDescription(vp9StsdBytes, vp9Stsd)).toMatchObject({
      codecFamily: 'vp9',
      codec: 'vp09.00.10.08',
    });

    const vp8DecoderConfig = Buffer.from([1, 0, 0, 0, 0, 10, 0x80]);
    const vp8StsdBytes = Uint8Array.from(buildFullMp4Box('stsd', Buffer.concat([
      uint32(1),
      buildMp4Box('vp08', Buffer.concat([
        Buffer.alloc(78),
        buildMp4Box('vpcC', vp8DecoderConfig),
      ])),
    ])));
    const vp8Stsd = internals.parseMp4Boxes(vp8StsdBytes, 0, vp8StsdBytes.length)[0];
    expect(internals.readMp4SampleDescription(vp8StsdBytes, vp8Stsd)).toMatchObject({
      codecFamily: 'vp8',
      codec: 'vp8',
    });

    const missingAv1ConfigBytes = Uint8Array.from(buildFullMp4Box('stsd', Buffer.concat([
      uint32(1),
      buildMp4Box('av01', Buffer.alloc(78)),
    ])));
    const missingAv1Config = internals.parseMp4Boxes(missingAv1ConfigBytes, 0, missingAv1ConfigBytes.length)[0];
    expect(() => internals.readMp4SampleDescription(missingAv1ConfigBytes, missingAv1Config)).toThrow('missing av1C');

    const shortAv1ConfigBytes = Uint8Array.from(buildFullMp4Box('stsd', Buffer.concat([
      uint32(1),
      buildMp4Box('av01', Buffer.concat([
        Buffer.alloc(78),
        buildMp4Box('av1C', Buffer.from([0x81, 0x04, 0x00])),
      ])),
    ])));
    const shortAv1Config = internals.parseMp4Boxes(shortAv1ConfigBytes, 0, shortAv1ConfigBytes.length)[0];
    expect(() => internals.readMp4SampleDescription(shortAv1ConfigBytes, shortAv1Config)).toThrow('av1C decoder configuration is too small');

    const missingVpConfigBytes = Uint8Array.from(buildFullMp4Box('stsd', Buffer.concat([
      uint32(1),
      buildMp4Box('vp09', Buffer.alloc(78)),
    ])));
    const missingVpConfig = internals.parseMp4Boxes(missingVpConfigBytes, 0, missingVpConfigBytes.length)[0];
    expect(() => internals.readMp4SampleDescription(missingVpConfigBytes, missingVpConfig)).toThrow('missing vpcC');

    const shortVpConfigBytes = Uint8Array.from(buildFullMp4Box('stsd', Buffer.concat([
      uint32(1),
      buildMp4Box('vp08', Buffer.concat([
        Buffer.alloc(78),
        buildMp4Box('vpcC', Buffer.alloc(6)),
      ])),
    ])));
    const shortVpConfig = internals.parseMp4Boxes(shortVpConfigBytes, 0, shortVpConfigBytes.length)[0];
    expect(() => internals.readMp4SampleDescription(shortVpConfigBytes, shortVpConfig)).toThrow('vpcC decoder configuration is too small');

    const truncatedStsdHeaderBytes = Uint8Array.from(buildFullMp4Box('stsd', Buffer.alloc(0)));
    const truncatedStsdHeader = internals.parseMp4Boxes(truncatedStsdHeaderBytes, 0, truncatedStsdHeaderBytes.length)[0];
    expect(() => internals.readMp4SampleDescription(truncatedStsdHeaderBytes, truncatedStsdHeader)).toThrow('sample description table is truncated');

    const missingEntryBytes = Uint8Array.from(buildFullMp4Box('stsd', uint32(1)));
    const missingEntry = internals.parseMp4Boxes(missingEntryBytes, 0, missingEntryBytes.length)[0];
    expect(() => internals.readMp4SampleDescription(missingEntryBytes, missingEntry)).toThrow('sample description table is truncated');

    const overrunEntryBytes = Uint8Array.from(buildFullMp4Box('stsd', Buffer.concat([
      uint32(1),
      uint32(16),
      Buffer.from('avc1', 'ascii'),
    ])));
    const overrunEntry = internals.parseMp4Boxes(overrunEntryBytes, 0, overrunEntryBytes.length)[0];
    expect(() => internals.readMp4SampleDescription(overrunEntryBytes, overrunEntry)).toThrow('sample description table is truncated');

    const shortVisualEntryBytes = Uint8Array.from(buildFullMp4Box('stsd', Buffer.concat([
      uint32(1),
      buildMp4Box('avc1', Buffer.alloc(8)),
    ])));
    const shortVisualEntry = internals.parseMp4Boxes(shortVisualEntryBytes, 0, shortVisualEntryBytes.length)[0];
    expect(() => internals.readMp4SampleDescription(shortVisualEntryBytes, shortVisualEntry)).toThrow('sample description table is truncated');
  });

  it('rejects truncated MP4 sample size and timing tables', () => {
    const internals = loadPreviewWorkerInternals();

    const truncatedStszBox = buildFullMp4Box('stsz', Buffer.concat([
      uint32(0),
      uint32(2),
      uint32(100),
    ]));
    const truncatedStszBytes = Uint8Array.from(truncatedStszBox);
    const truncatedStsz = internals.parseMp4Boxes(truncatedStszBytes, 0, truncatedStszBytes.length)[0];
    expect(() => internals.readMp4SampleSizes(truncatedStszBytes, truncatedStsz)).toThrow('sample size table is truncated');

    const truncatedStz2Box = buildStz2Box(8, Buffer.from([12]), 2);
    const truncatedStz2Bytes = Uint8Array.from(truncatedStz2Box);
    const truncatedStz2 = internals.parseMp4Boxes(truncatedStz2Bytes, 0, truncatedStz2Bytes.length)[0];
    expect(() => internals.readMp4SampleSizes(truncatedStz2Bytes, truncatedStz2)).toThrow('compact sample size table is truncated');

    const truncatedSttsBox = buildFullMp4Box('stts', Buffer.concat([
      uint32(2),
      uint32(1),
      uint32(40),
    ]));
    const truncatedSttsBytes = Uint8Array.from(truncatedSttsBox);
    const truncatedStts = internals.parseMp4Boxes(truncatedSttsBytes, 0, truncatedSttsBytes.length)[0];
    expect(() => internals.readMp4SampleDurations(truncatedSttsBytes, truncatedStts, 2)).toThrow('decoding time table is truncated');

    const shortSttsBox = buildFullMp4Box('stts', Buffer.concat([
      uint32(1),
      uint32(1),
      uint32(40),
    ]));
    const shortSttsBytes = Uint8Array.from(shortSttsBox);
    const shortStts = internals.parseMp4Boxes(shortSttsBytes, 0, shortSttsBytes.length)[0];
    expect(() => internals.readMp4SampleDurations(shortSttsBytes, shortStts, 2)).toThrow('does not cover all samples');

    const truncatedCttsBox = buildFullMp4Box('ctts', Buffer.concat([
      uint32(2),
      uint32(1),
      uint32(4),
    ]));
    const truncatedCttsBytes = Uint8Array.from(truncatedCttsBox);
    const truncatedCtts = internals.parseMp4Boxes(truncatedCttsBytes, 0, truncatedCttsBytes.length)[0];
    expect(() => internals.readMp4CompositionOffsets(truncatedCttsBytes, truncatedCtts, 2)).toThrow('composition offset table is truncated');

    const shortCttsBox = buildFullMp4Box('ctts', Buffer.concat([
      uint32(1),
      uint32(1),
      uint32(4),
    ]));
    const shortCttsBytes = Uint8Array.from(shortCttsBox);
    const shortCtts = internals.parseMp4Boxes(shortCttsBytes, 0, shortCttsBytes.length)[0];
    expect(() => internals.readMp4CompositionOffsets(shortCttsBytes, shortCtts, 2)).toThrow('does not cover all samples');
  });

  it('rejects truncated or invalid MP4 sync and sample-to-chunk tables', () => {
    const internals = loadPreviewWorkerInternals();

    const truncatedStssBox = buildFullMp4Box('stss', Buffer.concat([
      uint32(2),
      uint32(1),
    ]));
    const truncatedStssBytes = Uint8Array.from(truncatedStssBox);
    const truncatedStss = internals.parseMp4Boxes(truncatedStssBytes, 0, truncatedStssBytes.length)[0];
    expect(() => internals.readMp4Keyframes(truncatedStssBytes, truncatedStss, 3)).toThrow('sync sample table is truncated');

    const invalidStssBox = buildFullMp4Box('stss', Buffer.concat([
      uint32(1),
      uint32(4),
    ]));
    const invalidStssBytes = Uint8Array.from(invalidStssBox);
    const invalidStss = internals.parseMp4Boxes(invalidStssBytes, 0, invalidStssBytes.length)[0];
    expect(() => internals.readMp4Keyframes(invalidStssBytes, invalidStss, 3)).toThrow('outside the sample range');

    const truncatedStscBox = buildFullMp4Box('stsc', Buffer.concat([
      uint32(1),
      uint32(1),
      uint32(2),
    ]));
    const truncatedStscBytes = Uint8Array.from(truncatedStscBox);
    const truncatedStsc = internals.parseMp4Boxes(truncatedStscBytes, 0, truncatedStscBytes.length)[0];
    expect(() => internals.readMp4SampleToChunk(truncatedStscBytes, truncatedStsc)).toThrow('sample-to-chunk table is truncated');

    const zeroStscBox = buildFullMp4Box('stsc', uint32(0));
    const zeroStscBytes = Uint8Array.from(zeroStscBox);
    const zeroStsc = internals.parseMp4Boxes(zeroStscBytes, 0, zeroStscBytes.length)[0];
    expect(() => internals.readMp4SampleToChunk(zeroStscBytes, zeroStsc)).toThrow('has no entries');

    const invalidStscBox = buildFullMp4Box('stsc', Buffer.concat([
      uint32(1),
      uint32(1),
      uint32(0),
      uint32(1),
    ]));
    const invalidStscBytes = Uint8Array.from(invalidStscBox);
    const invalidStsc = internals.parseMp4Boxes(invalidStscBytes, 0, invalidStscBytes.length)[0];
    expect(() => internals.readMp4SampleToChunk(invalidStscBytes, invalidStsc)).toThrow('invalid samples-per-chunk');

    expect(() => internals.buildMp4SampleOffsets([10, 20, 30], [100], [
      { firstChunk: 1, samplesPerChunk: 1 },
    ])).toThrow('does not map all samples');
  });

  it('reads MP4 64-bit chunk offsets and maps sample offsets across chunks', () => {
    const internals = loadPreviewWorkerInternals();
    const co64Box = buildCo64Box([
      0x0000000100000000n,
      0x0000000100000028n,
    ]);
    const bytes = Uint8Array.from(co64Box);
    const co64 = internals.parseMp4Boxes(bytes, 0, bytes.length)[0];

    const chunkOffsets = internals.readMp4ChunkOffsets(bytes, co64);
    expect(chunkOffsets).toEqual([4294967296, 4294967336]);
    expect(internals.buildMp4SampleOffsets([10, 20, 30], chunkOffsets, [
      { firstChunk: 1, samplesPerChunk: 2 },
      { firstChunk: 2, samplesPerChunk: 1 },
    ])).toEqual([4294967296, 4294967306, 4294967336]);
  });

  it('rejects truncated or unsafe MP4 64-bit chunk offset tables', () => {
    const internals = loadPreviewWorkerInternals();
    const unsafeCo64Box = buildCo64Box([0x0020000000000000n]);
    const unsafeBytes = Uint8Array.from(unsafeCo64Box);
    const unsafeCo64 = internals.parseMp4Boxes(unsafeBytes, 0, unsafeBytes.length)[0];
    expect(() => internals.readMp4ChunkOffsets(unsafeBytes, unsafeCo64)).toThrow('safe integer range');

    const truncatedCo64Box = buildMp4Box('co64', Buffer.concat([
      Buffer.from([0, 0, 0, 0]),
      uint32(2),
      uint64(0x0000000100000000n),
    ]));
    const truncatedBytes = Uint8Array.from(truncatedCo64Box);
    const truncatedCo64 = internals.parseMp4Boxes(truncatedBytes, 0, truncatedBytes.length)[0];
    expect(() => internals.readMp4ChunkOffsets(truncatedBytes, truncatedCo64)).toThrow('truncated');
  });

  it('continues fragmented MP4 trun sample data when later runs omit dataOffset', () => {
    const internals = loadPreviewWorkerInternals();

    expect(internals.resolveMp4FragmentRunDataCursor({
      trun: { dataOffset: 64 },
      baseDataOffset: 1000,
      fallbackMdatStart: 2048,
    })).toBe(1064);
    expect(internals.resolveMp4FragmentRunDataCursor({
      trun: {},
      baseDataOffset: 1000,
      fallbackMdatStart: 2048,
      nextTrafDataCursor: 1208,
    })).toBe(1208);
    expect(internals.resolveMp4FragmentRunDataCursor({
      trun: {},
      baseDataOffset: 1000,
      fallbackMdatStart: 2048,
    })).toBe(2048);
  });

  it('rejects truncated or unsafe fragmented MP4 tfhd/tfdt/trun boxes', () => {
    const internals = loadPreviewWorkerInternals();
    const moofBox = buildMp4Box('moof', Buffer.alloc(0));
    const moofBytes = Uint8Array.from(moofBox);
    const moof = internals.parseMp4Boxes(moofBytes, 0, moofBytes.length)[0];

    const unsafeTfhdBox = buildFullMp4Box('tfhd', Buffer.concat([
      uint32(7),
      uint64(0x0020000000000000n),
    ]), 0x000001);
    const unsafeTfhdBytes = Uint8Array.from(unsafeTfhdBox);
    const unsafeTfhd = internals.parseMp4Boxes(unsafeTfhdBytes, 0, unsafeTfhdBytes.length)[0];
    expect(() => internals.readMp4TrackFragmentHeader(unsafeTfhdBytes, unsafeTfhd, moof)).toThrow('safe integer range');

    const truncatedTfhdBox = buildFullMp4Box('tfhd', Buffer.concat([
      uint32(7),
      uint32(100),
    ]), 0x000001);
    const truncatedTfhdBytes = Uint8Array.from(truncatedTfhdBox);
    const truncatedTfhd = internals.parseMp4Boxes(truncatedTfhdBytes, 0, truncatedTfhdBytes.length)[0];
    expect(() => internals.readMp4TrackFragmentHeader(truncatedTfhdBytes, truncatedTfhd, moof)).toThrow('track fragment header is truncated');

    const unsafeTfdtBox = buildFullMp4Box('tfdt', uint64(0x0020000000000000n), 0, 1);
    const unsafeTfdtBytes = Uint8Array.from(unsafeTfdtBox);
    const unsafeTfdt = internals.parseMp4Boxes(unsafeTfdtBytes, 0, unsafeTfdtBytes.length)[0];
    expect(() => internals.readMp4TrackFragmentDecodeTime(unsafeTfdtBytes, unsafeTfdt)).toThrow('safe integer range');

    const truncatedTfdtBox = buildFullMp4Box('tfdt', uint32(12), 0, 1);
    const truncatedTfdtBytes = Uint8Array.from(truncatedTfdtBox);
    const truncatedTfdt = internals.parseMp4Boxes(truncatedTfdtBytes, 0, truncatedTfdtBytes.length)[0];
    expect(() => internals.readMp4TrackFragmentDecodeTime(truncatedTfdtBytes, truncatedTfdt)).toThrow('track fragment decode time is truncated');

    const validTrunBox = buildFullMp4Box('trun', Buffer.concat([
      uint32(2),
      int32(64),
      uint32(0x02000000),
      uint32(40),
      uint32(1000),
      uint32(0x01010000),
      int32(-5),
      uint32(40),
      uint32(900),
      uint32(0x01010000),
      int32(3),
    ]), 0x000f05, 1);
    const validTrunBytes = Uint8Array.from(validTrunBox);
    const validTrun = internals.parseMp4Boxes(validTrunBytes, 0, validTrunBytes.length)[0];
    expect(internals.readMp4TrackRun(validTrunBytes, validTrun)).toMatchObject({
      dataOffset: 64,
      firstSampleFlags: 0x02000000,
      samples: [
        { duration: 40, size: 1000, flags: 0x01010000, compositionTimeOffset: -5 },
        { duration: 40, size: 900, flags: 0x01010000, compositionTimeOffset: 3 },
      ],
    });

    const truncatedTrunBox = buildFullMp4Box('trun', Buffer.concat([
      uint32(2),
      uint32(40),
      uint32(1000),
    ]), 0x000300);
    const truncatedTrunBytes = Uint8Array.from(truncatedTrunBox);
    const truncatedTrun = internals.parseMp4Boxes(truncatedTrunBytes, 0, truncatedTrunBytes.length)[0];
    expect(() => internals.readMp4TrackRun(truncatedTrunBytes, truncatedTrun)).toThrow('track run is truncated');
  });

  it('reads MP4 tkhd display matrix rotation and builds oriented draw plans', () => {
    const internals = loadPreviewWorkerInternals();

    expect(internals.resolveMp4DisplayOrientation([65536, 0, 0, 0, 65536, 0, 0, 0, 1073741824])).toEqual({ rotation: 0 });
    expect(internals.resolveMp4DisplayOrientation([0, -65536, 0, 65536, 0, 0, 0, 0, 1073741824])).toEqual({ rotation: 90 });
    expect(internals.resolveMp4DisplayOrientation([-65536, 0, 0, 0, -65536, 0, 0, 0, 1073741824])).toEqual({ rotation: 180 });
    expect(internals.resolveMp4DisplayOrientation([0, 65536, 0, -65536, 0, 0, 0, 0, 1073741824])).toEqual({ rotation: 270 });

    const tkhd = buildTkhdBox([0, -65536, 0, 65536, 0, 0, 0, 0, 1073741824]);
    const bytes = Uint8Array.from(tkhd);
    const trakChildren = internals.parseMp4Boxes(bytes, 0, bytes.length);
    expect(internals.readMp4TrackDisplayOrientation(bytes, trakChildren)).toEqual({ rotation: 90 });

    expect(internals.buildVideoFrameDrawPlan(640, 360, { rotation: 90 })).toMatchObject({
      rotation: 90,
      translateX: 0,
      translateY: 360,
      drawWidth: 360,
      drawHeight: 640,
    });
    expect(internals.buildVideoFrameDrawPlan(640, 360, { rotation: 270 })).toMatchObject({
      rotation: 270,
      translateX: 640,
      translateY: 0,
      drawWidth: 360,
      drawHeight: 640,
    });
  });
});

describe('preview worker WebM/Matroska internals', () => {
  it('parses unknown-size EBML Segment and Cluster elements within the parent range', () => {
    const internals = loadPreviewWorkerInternals();
    const tracks = buildEbmlElement([0x16, 0x54, 0xae, 0x6b], buildEbmlElement([0xae], Buffer.concat([
      buildEbmlElement([0xd7], Buffer.from([1])),
      buildEbmlElement([0x83], Buffer.from([1])),
      buildEbmlElement([0x86], Buffer.from('V_VP8', 'ascii')),
    ])));
    const firstCluster = buildEbmlUnknownSizeElement([0x1f, 0x43, 0xb6, 0x75], buildEbmlElement([0xe7], Buffer.from([0])));
    const secondCluster = buildEbmlUnknownSizeElement([0x1f, 0x43, 0xb6, 0x75], buildEbmlElement([0xe7], Buffer.from([40])));
    const segment = buildEbmlUnknownSizeElement([0x18, 0x53, 0x80, 0x67], Buffer.concat([
      tracks,
      firstCluster,
      secondCluster,
    ]));
    const bytes = Uint8Array.from(segment);

    const topLevel = internals.parseEbmlElements(bytes, 0, bytes.length);
    expect(topLevel).toHaveLength(1);
    expect(topLevel[0]).toMatchObject({
      id: 0x18538067,
      end: bytes.length,
    });

    const segmentChildren = internals.parseEbmlElements(bytes, topLevel[0].dataStart, topLevel[0].end);
    expect(segmentChildren.map((element) => element.id)).toEqual([0x1654AE6B, 0x1F43B675, 0x1F43B675]);
    expect(segmentChildren[1].end).toBe(segmentChildren[2].start);
    expect(segmentChildren[2].end).toBe(bytes.length);
  });

  it('demuxes samples from consecutive unknown-size WebM clusters', () => {
    const internals = loadPreviewWorkerInternals();
    const tracks = buildEbmlElement([0x16, 0x54, 0xae, 0x6b], buildEbmlElement([0xae], Buffer.concat([
      buildEbmlElement([0xd7], Buffer.from([1])),
      buildEbmlElement([0x83], Buffer.from([1])),
      buildEbmlElement([0x86], Buffer.from('V_VP8', 'ascii')),
    ])));
    const firstCluster = buildEbmlUnknownSizeElement([0x1f, 0x43, 0xb6, 0x75], Buffer.concat([
      buildEbmlElement([0xe7], Buffer.from([0])),
      buildEbmlElement([0xa3], Buffer.from([0x81, 0x00, 0x00, 0x80, 0xaa])),
    ]));
    const secondCluster = buildEbmlUnknownSizeElement([0x1f, 0x43, 0xb6, 0x75], Buffer.concat([
      buildEbmlElement([0xe7], Buffer.from([40])),
      buildEbmlElement([0xa3], Buffer.from([0x81, 0x00, 0x00, 0x80, 0xbb])),
    ]));
    const segment = buildEbmlUnknownSizeElement([0x18, 0x53, 0x80, 0x67], Buffer.concat([
      tracks,
      firstCluster,
      secondCluster,
    ]));

    const demuxed = internals.demuxWebmVideoFrameSamples(Uint8Array.from(segment), 0);

    expect(demuxed.codec).toBe('vp8');
    expect(demuxed.samples.map((sample) => ({
      pts: sample.pts,
      duration: sample.duration,
      data: Array.from(sample.data),
    }))).toEqual([
      { pts: 0, duration: 0.04, data: [0xaa] },
      { pts: 0.04, duration: 1 / 30, data: [0xbb] },
    ]);
  });

  it('reads WebM VP8, VP9, and AV1 video tracks for WebCodecs', () => {
    const internals = loadPreviewWorkerInternals();
    const tracks = buildEbmlElement([0x16, 0x54, 0xae, 0x6b], Buffer.concat([
      buildEbmlElement([0xae], Buffer.concat([
        buildEbmlElement([0xd7], Buffer.from([1])),
        buildEbmlElement([0x83], Buffer.from([1])),
        buildEbmlElement([0x86], Buffer.from('V_VP8', 'ascii')),
      ])),
      buildEbmlElement([0xae], Buffer.concat([
        buildEbmlElement([0xd7], Buffer.from([2])),
        buildEbmlElement([0x83], Buffer.from([1])),
        buildEbmlElement([0x86], Buffer.from('V_VP9', 'ascii')),
      ])),
      buildEbmlElement([0xae], Buffer.concat([
        buildEbmlElement([0xd7], Buffer.from([3])),
        buildEbmlElement([0x83], Buffer.from([1])),
        buildEbmlElement([0x86], Buffer.from('V_AV1', 'ascii')),
      ])),
    ]));
    const bytes = Uint8Array.from(tracks);
    const element = internals.parseEbmlElements(bytes, 0, bytes.length)[0];

    expect(internals.readWebmVideoTrack(bytes, element)).toMatchObject({
      trackNumber: 1,
      codec: 'vp8',
    });

    const vp9Tracks = buildEbmlElement([0x16, 0x54, 0xae, 0x6b], Buffer.concat([
      buildEbmlElement([0xae], Buffer.concat([
        buildEbmlElement([0xd7], Buffer.from([2])),
        buildEbmlElement([0x83], Buffer.from([1])),
        buildEbmlElement([0x86], Buffer.from('V_VP9', 'ascii')),
      ])),
    ]));
    const vp9Bytes = Uint8Array.from(vp9Tracks);
    const vp9Element = internals.parseEbmlElements(vp9Bytes, 0, vp9Bytes.length)[0];
    expect(internals.readWebmVideoTrack(vp9Bytes, vp9Element)).toMatchObject({
      trackNumber: 2,
      codec: 'vp09.00.10.08',
    });

    const vp9HighBitDepthConfig = Buffer.from([1, 0, 0, 0, 2, 10, 0xa0]);
    const vp9PrivateTracks = buildEbmlElement([0x16, 0x54, 0xae, 0x6b], Buffer.concat([
      buildEbmlElement([0xae], Buffer.concat([
        buildEbmlElement([0xd7], Buffer.from([5])),
        buildEbmlElement([0x83], Buffer.from([1])),
        buildEbmlElement([0x86], Buffer.from('V_VP9', 'ascii')),
        buildEbmlElement([0x63, 0xa2], vp9HighBitDepthConfig),
      ])),
    ]));
    const vp9PrivateBytes = Uint8Array.from(vp9PrivateTracks);
    const vp9PrivateElement = internals.parseEbmlElements(vp9PrivateBytes, 0, vp9PrivateBytes.length)[0];
    expect(internals.readWebmVideoTrack(vp9PrivateBytes, vp9PrivateElement)).toMatchObject({
      trackNumber: 5,
      codec: 'vp09.02.10.10',
      description: Uint8Array.from(vp9HighBitDepthConfig),
    });

    const av1Tracks = buildEbmlElement([0x16, 0x54, 0xae, 0x6b], Buffer.concat([
      buildEbmlElement([0xae], Buffer.concat([
        buildEbmlElement([0xd7], Buffer.from([3])),
        buildEbmlElement([0x83], Buffer.from([1])),
        buildEbmlElement([0x86], Buffer.from('V_AV1', 'ascii')),
      ])),
    ]));
    const av1Bytes = Uint8Array.from(av1Tracks);
    const av1Element = internals.parseEbmlElements(av1Bytes, 0, av1Bytes.length)[0];
    expect(internals.readWebmVideoTrack(av1Bytes, av1Element)).toMatchObject({
      trackNumber: 3,
      codec: 'av01.0.04M.08',
    });

    const av1HighBitDepthConfig = Buffer.from([0x81, 0x05, 0x40, 0x00]);
    const av1PrivateTracks = buildEbmlElement([0x16, 0x54, 0xae, 0x6b], Buffer.concat([
      buildEbmlElement([0xae], Buffer.concat([
        buildEbmlElement([0xd7], Buffer.from([4])),
        buildEbmlElement([0x83], Buffer.from([1])),
        buildEbmlElement([0x86], Buffer.from('V_AV1', 'ascii')),
        buildEbmlElement([0x63, 0xa2], av1HighBitDepthConfig),
      ])),
    ]));
    const av1PrivateBytes = Uint8Array.from(av1PrivateTracks);
    const av1PrivateElement = internals.parseEbmlElements(av1PrivateBytes, 0, av1PrivateBytes.length)[0];
    expect(internals.readWebmVideoTrack(av1PrivateBytes, av1PrivateElement)).toMatchObject({
      trackNumber: 4,
      codec: 'av01.0.05M.10',
      description: Uint8Array.from(av1HighBitDepthConfig),
    });
  });

  it('reads Matroska H.264 track codec private data for WebCodecs', () => {
    const internals = loadPreviewWorkerInternals();
    const avcDecoderConfig = Buffer.from([1, 0x42, 0xc0, 0x1e, 0xff, 0xe1, 0x00]);
    const tracks = buildEbmlElement([0x16, 0x54, 0xae, 0x6b], buildEbmlElement([0xae], Buffer.concat([
      buildEbmlElement([0xd7], Buffer.from([1])),
      buildEbmlElement([0x83], Buffer.from([1])),
      buildEbmlElement([0x86], Buffer.from('V_MPEG4/ISO/AVC', 'ascii')),
      buildEbmlElement([0x63, 0xa2], avcDecoderConfig),
      buildEbmlElement([0x23, 0xe3, 0x83], uint32(41_666_667)),
    ])));
    const bytes = Uint8Array.from(tracks);
    const element = internals.parseEbmlElements(bytes, 0, bytes.length)[0];

    expect(internals.readWebmVideoTrack(bytes, element)).toMatchObject({
      trackNumber: 1,
      codec: 'avc1.42C01E',
      codecLabel: 'Matroska H.264',
      defaultDurationSeconds: 0.041666667,
      description: Uint8Array.from(avcDecoderConfig),
    });
  });

  it('reads Matroska H.265 track codec private data for WebCodecs', () => {
    const internals = loadPreviewWorkerInternals();
    const hevcDecoderConfig = Buffer.alloc(23);
    hevcDecoderConfig[1] = 0x01;
    hevcDecoderConfig.writeUInt32BE(0x00000006, 2);
    hevcDecoderConfig[6] = 0xb0;
    hevcDecoderConfig[12] = 93;
    const tracks = buildEbmlElement([0x16, 0x54, 0xae, 0x6b], buildEbmlElement([0xae], Buffer.concat([
      buildEbmlElement([0xd7], Buffer.from([2])),
      buildEbmlElement([0x83], Buffer.from([1])),
      buildEbmlElement([0x86], Buffer.from('V_MPEGH/ISO/HEVC', 'ascii')),
      buildEbmlElement([0x63, 0xa2], hevcDecoderConfig),
    ])));
    const bytes = Uint8Array.from(tracks);
    const element = internals.parseEbmlElements(bytes, 0, bytes.length)[0];

    expect(internals.readWebmVideoTrack(bytes, element)).toMatchObject({
      trackNumber: 2,
      codec: 'hvc1.1.6.L93.B0',
      codecLabel: 'Matroska H.265',
      description: Uint8Array.from(hevcDecoderConfig),
    });
  });

  it('skips Matroska H.264 and H.265 tracks with missing or short codec private data', () => {
    const internals = loadPreviewWorkerInternals();
    const tracks = buildEbmlElement([0x16, 0x54, 0xae, 0x6b], Buffer.concat([
      buildEbmlElement([0xae], Buffer.concat([
        buildEbmlElement([0xd7], Buffer.from([1])),
        buildEbmlElement([0x83], Buffer.from([1])),
        buildEbmlElement([0x86], Buffer.from('V_MPEG4/ISO/AVC', 'ascii')),
      ])),
      buildEbmlElement([0xae], Buffer.concat([
        buildEbmlElement([0xd7], Buffer.from([2])),
        buildEbmlElement([0x83], Buffer.from([1])),
        buildEbmlElement([0x86], Buffer.from('V_MPEGH/ISO/HEVC', 'ascii')),
        buildEbmlElement([0x63, 0xa2], Buffer.alloc(22)),
      ])),
      buildEbmlElement([0xae], Buffer.concat([
        buildEbmlElement([0xd7], Buffer.from([3])),
        buildEbmlElement([0x83], Buffer.from([1])),
        buildEbmlElement([0x86], Buffer.from('V_VP9', 'ascii')),
      ])),
    ]));
    const bytes = Uint8Array.from(tracks);
    const element = internals.parseEbmlElements(bytes, 0, bytes.length)[0];

    expect(internals.readWebmVideoTrack(bytes, element)).toMatchObject({
      trackNumber: 3,
      codec: 'vp09.00.10.08',
    });
  });

  it('splits WebM laced block frame payloads and rejects malformed lace headers', () => {
    const internals = loadPreviewWorkerInternals();

    expect(internals.readWebmBlockFrameSlices(Uint8Array.from([0xaa, 0xbb]), 0, 2, 0)).toEqual([
      { start: 0, end: 2 },
    ]);
    expect(() => internals.readWebmBlockFrameSlices(Uint8Array.from([]), 0, 0, 0)).toThrow('frame payload is empty');

    expect(internals.readWebmBlockFrameSlices(Uint8Array.from([
      1,
      2,
      0xaa,
      0xbb,
      0xcc,
      0xdd,
      0xee,
    ]), 0, 7, 0x02)).toEqual([
      { start: 2, end: 4 },
      { start: 4, end: 7 },
    ]);

    expect(internals.readWebmBlockFrameSlices(Uint8Array.from([
      2,
      0xaa,
      0xbb,
      0xcc,
      0xdd,
      0xee,
      0xff,
    ]), 0, 7, 0x04)).toEqual([
      { start: 1, end: 3 },
      { start: 3, end: 5 },
      { start: 5, end: 7 },
    ]);

    expect(internals.readWebmBlockFrameSlices(Uint8Array.from([
      2,
      0x82,
      0xbf,
      0xaa,
      0xbb,
      0xcc,
      0xdd,
      0xee,
      0xff,
    ]), 0, 9, 0x06)).toEqual([
      { start: 3, end: 5 },
      { start: 5, end: 7 },
      { start: 7, end: 9 },
    ]);

    expect(() => internals.readWebmBlockFrameSlices(Uint8Array.from([64, 0xaa]), 0, 2, 0x02)).toThrow('invalid frame count');
    expect(() => internals.readWebmBlockFrameSlices(Uint8Array.from([1, 255]), 0, 2, 0x02)).toThrow('invalid frame size');
    expect(() => internals.readWebmBlockFrameSlices(Uint8Array.from([2, 0xaa, 0xbb, 0xcc, 0xdd]), 0, 5, 0x04)).toThrow('uneven frame data');
    expect(() => internals.readWebmBlockFrameSlices(Uint8Array.from([2, 0x82]), 0, 2, 0x06)).toThrow('invalid frame size delta');
    expect(() => internals.readWebmBlockFrameSlices(Uint8Array.from([1, 0xaa, 0xbb]), 0, 3, 0x08)).toThrow('unknown lacing mode');
  });

  it('rejects truncated WebM block headers before decode sample creation', () => {
    const internals = loadPreviewWorkerInternals();
    const validBlock = Uint8Array.from([0x81, 0x00, 0x02, 0x80, 0xaa, 0xbb]);
    const validSamples = internals.readWebmBlockSamples(
      validBlock,
      { id: 0xa3, start: 0, dataStart: 0, end: validBlock.length },
      10,
      1_000_000,
      1,
      1 / 30,
      undefined,
      0.04,
    );
    expect(validSamples).toHaveLength(1);
    expect(validSamples?.[0]).toMatchObject({
      keyframe: true,
      pts: 0.012,
      dts: 0.012,
      duration: 0.04,
      data: Uint8Array.from([0xaa, 0xbb]),
    });

    const referencedBlock = Uint8Array.from([0x81, 0x00, 0x10, 0x00, 0xaa, 0xbb, 0xcc]);
    const referencedSamples = internals.readWebmBlockSamples(
      referencedBlock,
      { id: 0xa1, start: 0, dataStart: 0, end: referencedBlock.length },
      20,
      1_000_000,
      1,
      1 / 24,
      false,
      0.08,
    );
    expect(referencedSamples).toHaveLength(1);
    expect(referencedSamples?.[0]).toMatchObject({
      keyframe: false,
      pts: 0.036,
      duration: 0.08,
      data: Uint8Array.from([0xaa, 0xbb, 0xcc]),
    });

    const referencedLacedBlock = Uint8Array.from([0x81, 0x00, 0x20, 0x04, 0x01, 0xaa, 0xbb, 0xcc, 0xdd]);
    const referencedLacedSamples = internals.readWebmBlockSamples(
      referencedLacedBlock,
      { id: 0xa1, start: 0, dataStart: 0, end: referencedLacedBlock.length },
      30,
      1_000_000,
      1,
      1 / 24,
      false,
      0.10,
    );
    expect(referencedLacedSamples?.map((sample) => ({
      keyframe: sample.keyframe,
      pts: sample.pts,
      duration: sample.duration,
      data: Array.from(sample.data),
    }))).toEqual([
      { keyframe: false, pts: 0.062, duration: 0.05, data: [0xaa, 0xbb] },
      { keyframe: false, pts: 0.112, duration: 0.05, data: [0xcc, 0xdd] },
    ]);

    expect(internals.readWebmBlockSamples(
      Uint8Array.from([0x82, 0x00, 0x00, 0x80, 0xaa]),
      { id: 0xa3, start: 0, dataStart: 0, end: 5 },
      0,
      1_000_000,
      1,
      1 / 30,
    )).toBeNull();

    expect(() => internals.readWebmBlockSamples(
      Uint8Array.from([]),
      { id: 0xa3, start: 0, dataStart: 0, end: 0 },
      0,
      1_000_000,
      1,
      1 / 30,
    )).toThrow('block track number is truncated');

    expect(() => internals.readWebmBlockSamples(
      Uint8Array.from([0x81, 0x00]),
      { id: 0xa3, start: 0, dataStart: 0, end: 2 },
      0,
      1_000_000,
      1,
      1 / 30,
    )).toThrow('block header is truncated');

    expect(() => internals.readWebmBlockSamples(
      Uint8Array.from([0x81, 0x00, 0x00, 0x80]),
      { id: 0xa3, start: 0, dataStart: 0, end: 4 },
      0,
      1_000_000,
      1,
      1 / 30,
    )).toThrow('frame payload is empty');
  });
});

function loadPreviewWorkerInternals(): PreviewWorkerInternals {
  const script = readFileSync(resolve(process.cwd(), 'public/editor-preview-worker.js'), 'utf8');
  const self = {
    __DANBI_PREVIEW_WORKER_TEST_HOOK__: true,
    postMessage: () => undefined,
  } as {
    __DANBI_PREVIEW_WORKER_TEST_HOOK__: boolean;
    __danbiPreviewWorkerInternals?: PreviewWorkerInternals;
    postMessage: () => undefined;
  };

  runInNewContext(script, {
    self,
    performance: { now: () => 0 },
  });

  if (!self.__danbiPreviewWorkerInternals) {
    throw new Error('Preview worker internals were not exposed for tests.');
  }

  return self.__danbiPreviewWorkerInternals;
}

function buildMp4Sample(index: number, keyframe: boolean, pts: number, dts: number): PreviewWorkerMp4Sample {
  return {
    index,
    keyframe,
    pts,
    dts,
    duration: 0.04,
    data: Uint8Array.from([index]),
  };
}

function buildMp4Box(type: string, payload: Buffer): Buffer {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(payload.length + 8, 0);
  header.write(type, 4, 4, 'ascii');
  return Buffer.concat([header, payload]);
}

function buildFullMp4Box(type: string, payload: Buffer, flags = 0, version = 0): Buffer {
  return buildMp4Box(type, Buffer.concat([
    Buffer.from([version & 0xff, (flags >> 16) & 0xff, (flags >> 8) & 0xff, flags & 0xff]),
    payload,
  ]));
}

function buildTkhdBox(matrix: number[]): Buffer {
  const payload = Buffer.alloc(40 + 36);
  payload.writeUInt32BE(0x00000007, 0);
  payload.writeUInt32BE(1, 12);
  matrix.forEach((value, index) => {
    payload.writeInt32BE(value, 40 + (index * 4));
  });
  return buildMp4Box('tkhd', payload);
}

function buildStz2Box(fieldSize: 4 | 8 | 16, entries: Buffer, sampleCount: number): Buffer {
  return buildMp4Box('stz2', Buffer.concat([
    Buffer.from([0, 0, 0, 0, 0, 0, 0, fieldSize]),
    uint32(sampleCount),
    entries,
  ]));
}

function buildCo64Box(entries: bigint[]): Buffer {
  return buildMp4Box('co64', Buffer.concat([
    Buffer.from([0, 0, 0, 0]),
    uint32(entries.length),
    ...entries.map((entry) => uint64(entry)),
  ]));
}

function buildEbmlElement(id: number[], payload: Buffer): Buffer {
  return Buffer.concat([
    Buffer.from(id),
    encodeEbmlVintValue(payload.length),
    payload,
  ]);
}

function buildEbmlUnknownSizeElement(id: number[], payload: Buffer): Buffer {
  return Buffer.concat([
    Buffer.from(id),
    Buffer.from([0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]),
    payload,
  ]);
}

function encodeEbmlVintValue(value: number): Buffer {
  for (let length = 1; length <= 8; length += 1) {
    const max = Math.pow(2, 7 * length) - 2;
    if (Number.isInteger(value) && value >= 0 && value <= max) {
      let encoded = Math.pow(2, 7 * length) + value;
      const output = Buffer.alloc(length);
      for (let index = length - 1; index >= 0; index -= 1) {
        output[index] = encoded & 0xff;
        encoded = Math.floor(encoded / 256);
      }
      return output;
    }
  }

  throw new Error(`Value ${value} is too large for an EBML vint.`);
}

function uint32(value: number): Buffer {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value, 0);
  return buffer;
}

function uint64(value: bigint): Buffer {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(value, 0);
  return buffer;
}

function int32(value: number): Buffer {
  const buffer = Buffer.alloc(4);
  buffer.writeInt32BE(value, 0);
  return buffer;
}

function uint16(value: number): Buffer {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16BE(value, 0);
  return buffer;
}

function int16(value: number): Buffer {
  const buffer = Buffer.alloc(2);
  buffer.writeInt16BE(value, 0);
  return buffer;
}
