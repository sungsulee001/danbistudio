(function () {
  function detectCapabilities(id) {
    self.postMessage({
      type: 'capabilities',
      id: id,
      capabilities: {
        workerSupported: true,
        webCodecsSupported: typeof self.VideoDecoder !== 'undefined' || typeof self.VideoFrame !== 'undefined',
        videoDecoderSupported: typeof self.VideoDecoder !== 'undefined',
        videoFrameSupported: typeof self.VideoFrame !== 'undefined',
        encodedVideoChunkSupported: typeof self.EncodedVideoChunk !== 'undefined',
        offscreenCanvasSupported: typeof self.OffscreenCanvas !== 'undefined',
        imageBitmapSupported: typeof self.createImageBitmap === 'function',
        requestVideoFrameCallbackSupported: false,
      },
    });
  }

  function benchmarkFrameBudget(id, message) {
    if (typeof self.OffscreenCanvas === 'undefined') {
      self.postMessage({
        type: 'benchmark',
        id: id,
        benchmark: {
          averageFrameMs: undefined,
          width: 0,
          height: 0,
          samples: 0,
        },
      });
      return;
    }

    var width = Math.max(16, Math.min(4096, Math.round(Number(message.width) || 640)));
    var height = Math.max(16, Math.min(4096, Math.round(Number(message.height) || 360)));
    var samples = Math.max(4, Math.min(60, Math.round(Number(message.samples) || 12)));
    var canvas = new self.OffscreenCanvas(width, height);
    var context = canvas.getContext('2d', { alpha: false });
    var startedAt = performance.now();

    if (!context) {
      self.postMessage({
        type: 'benchmark',
        id: id,
        benchmark: {
          averageFrameMs: undefined,
          width: width,
          height: height,
          samples: 0,
        },
      });
      return;
    }

    for (var index = 0; index < samples; index += 1) {
      context.fillStyle = index % 2 === 0 ? '#050505' : '#111827';
      context.fillRect(0, 0, width, height);
      context.fillStyle = '#10b981';
      context.fillRect((index * 17) % width, (index * 11) % height, Math.max(4, width / 12), Math.max(4, height / 12));
    }

    var averageFrameMs = (performance.now() - startedAt) / samples;
    self.postMessage({
      type: 'benchmark',
      id: id,
      benchmark: {
        averageFrameMs: Math.max(0.1, Math.round(averageFrameMs * 1000) / 1000),
        width: width,
        height: height,
        samples: samples,
      },
    });
  }

  function decodeFrame(id, message) {
    var request = message.request || {};
    var startedAt = performance.now();
    var source = typeof request.source === 'string' ? request.source : '';
    var kind = request.kind === 'video' ? 'video' : 'image';
    var decodeSourceKind = request.decodeSourceKind === 'image'
      ? 'image'
      : request.decodeSourceKind === 'video'
        ? 'video'
        : kind;
    var requestId = typeof request.requestId === 'string' ? request.requestId : id + '-frame';
    var mediaId = typeof request.mediaId === 'string' ? request.mediaId : source;
    var timestamp = Math.max(0, Number(request.time) || 0);

    if (!source) {
      postFrameResult(id, {
        requestId: requestId,
        mediaId: mediaId,
        kind: kind,
        status: 'failed',
        timestamp: timestamp,
        duration: 0.04,
        width: 0,
        height: 0,
        reason: 'Missing preview frame source.',
      });
      return;
    }

    if (decodeSourceKind === 'video') {
      decodeVideoFrame(id, request, {
        requestId: requestId,
        mediaId: mediaId,
        kind: kind,
        source: source,
        timestamp: timestamp,
        startedAt: startedAt,
      });
      return;
    }

    decodeImageFrame(id, request, {
      requestId: requestId,
      mediaId: mediaId,
      kind: kind,
      source: source,
      timestamp: timestamp,
      startedAt: startedAt,
    });
  }

  function decodeImageFrame(id, request, context) {
    var source = context.source;
    if (typeof self.createImageBitmap !== 'function' || typeof self.fetch !== 'function') {
      postFrameResult(id, {
        requestId: context.requestId,
        mediaId: context.mediaId,
        kind: context.kind,
        status: 'unsupported',
        timestamp: context.timestamp,
        duration: 0.04,
        width: 0,
        height: 0,
        reason: 'Worker ImageBitmap decoding is unavailable.',
      });
      return;
    }

    self.fetch(source)
      .then(function (response) {
        if (!response.ok) {
          throw new Error('Frame source request failed: ' + response.status);
        }
        return response.blob();
      })
      .then(function (blob) {
        return self.createImageBitmap(blob);
      })
      .then(function (bitmap) {
        var targetWidth = Math.max(16, Math.min(4096, Math.round(Number(request.targetWidth) || bitmap.width || 320)));
        var targetHeight = Math.max(16, Math.min(4096, Math.round(Number(request.targetHeight) || bitmap.height || 180)));
        var outputBitmap = bitmap;

        if (typeof self.OffscreenCanvas !== 'undefined' && (bitmap.width !== targetWidth || bitmap.height !== targetHeight)) {
          var canvas = new self.OffscreenCanvas(targetWidth, targetHeight);
          var context = canvas.getContext('2d', { alpha: false });
          if (context && typeof canvas.transferToImageBitmap === 'function') {
            context.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
            outputBitmap = canvas.transferToImageBitmap();
            bitmap.close();
          }
        }

        var result = {
          requestId: context.requestId,
          mediaId: context.mediaId,
          kind: context.kind,
          status: 'decoded',
          timestamp: context.timestamp,
          duration: 0.04,
          width: outputBitmap.width,
          height: outputBitmap.height,
          decodeMs: Math.max(0.1, Math.round((performance.now() - context.startedAt) * 1000) / 1000),
        };
        if (context.reason) {
          result.reason = context.reason;
        }
        postFrameResult(id, result, outputBitmap);
      })
      .catch(function (error) {
        postFrameResult(id, {
          requestId: context.requestId,
          mediaId: context.mediaId,
          kind: context.kind,
          status: 'failed',
          timestamp: context.timestamp,
          duration: 0.04,
          width: 0,
          height: 0,
          decodeMs: Math.max(0.1, Math.round((performance.now() - context.startedAt) * 1000) / 1000),
          reason: error && error.message ? error.message : 'Preview worker frame decode failed.',
        });
      });
  }

  function decodeVideoFrame(id, request, context) {
    var fallbackSource = typeof request.fallbackSource === 'string' ? request.fallbackSource : '';

    if (
      typeof self.VideoDecoder === 'undefined'
      || typeof self.VideoFrame === 'undefined'
      || typeof self.EncodedVideoChunk === 'undefined'
    ) {
      postVideoFallbackOrResult(id, request, context, fallbackSource, 'unsupported', 'WebCodecs VideoDecoder, VideoFrame, or EncodedVideoChunk is unavailable.');
      return;
    }

    if (typeof self.OffscreenCanvas === 'undefined') {
      postVideoFallbackOrResult(id, request, context, fallbackSource, 'unsupported', 'OffscreenCanvas is required to transfer decoded video frames from the worker.');
      return;
    }

    if (typeof self.fetch !== 'function') {
      postVideoFallbackOrResult(id, request, context, fallbackSource, 'unsupported', 'Worker fetch is unavailable for video frame decode.');
      return;
    }

    var container = readVideoContainerFromSource(context.source);
    if (container !== 'mp4' && container !== 'webm') {
      postVideoFallbackOrResult(id, request, context, fallbackSource, 'unsupported', 'Worker video decode currently supports MP4/MOV/M4V/QT H.264/H.265/AV1/VP8/VP9 and WebM/Matroska VP8/VP9/AV1/H.264/H.265 sources only.');
      return;
    }

    self.fetch(context.source)
      .then(function (response) {
        if (!response.ok) {
          throw new Error('Video source request failed: ' + response.status);
        }
        return response.arrayBuffer();
      })
      .then(function (arrayBuffer) {
        var bytes = new Uint8Array(arrayBuffer);
        var demuxed = container === 'webm'
          ? demuxWebmVideoFrameSamples(bytes, context.timestamp)
          : demuxMp4VideoFrameSamples(bytes, context.timestamp);
        return decodeVideoSamplesToBitmap(demuxed, request, context);
      })
      .then(function (decoded) {
        postFrameResult(id, {
          requestId: context.requestId,
          mediaId: context.mediaId,
          kind: context.kind,
          status: 'decoded',
          timestamp: decoded.timestamp,
          duration: decoded.duration,
          width: decoded.bitmap.width,
          height: decoded.bitmap.height,
          decodeMs: Math.max(0.1, Math.round((performance.now() - context.startedAt) * 1000) / 1000),
          reason: decoded.reason,
        }, decoded.bitmap);
      })
      .catch(function (error) {
        postVideoFallbackOrResult(
          id,
          request,
          context,
          fallbackSource,
          'failed',
          error && error.message ? error.message : 'Worker video frame decode failed.',
        );
      });
  }

  function postVideoFallbackOrResult(id, request, context, fallbackSource, status, reason) {
    if (fallbackSource) {
      decodeImageFrame(id, request, {
        requestId: context.requestId,
        mediaId: context.mediaId,
        kind: context.kind,
        source: fallbackSource,
        timestamp: context.timestamp,
        startedAt: context.startedAt,
        reason: 'Video decode fallback: ' + reason,
      });
      return;
    }

    postFrameResult(id, {
      requestId: context.requestId,
      mediaId: context.mediaId,
      kind: context.kind,
      status: status,
      timestamp: context.timestamp,
      duration: 0.04,
      width: 0,
      height: 0,
      decodeMs: Math.max(0.1, Math.round((performance.now() - context.startedAt) * 1000) / 1000),
      reason: reason,
    });
  }

  function readVideoContainerFromSource(source) {
    var normalized = String(source || '').split(/[?#]/, 1)[0].toLowerCase();
    if (/\.(mp4|m4v|mov|qt)$/.test(normalized)) {
      return 'mp4';
    }

    if (/\.(webm|mkv)$/.test(normalized)) {
      return 'webm';
    }

    return 'unknown';
  }

  function demuxMp4VideoFrameSamples(bytes, targetSeconds) {
    var topLevelBoxes = parseMp4Boxes(bytes, 0, bytes.length);
    var moov = findMp4Box(topLevelBoxes, 'moov');
    if (!moov) {
      throw new Error('MP4 moov box was not found.');
    }

    var movieTimescale = readMp4MovieTimescale(bytes, moov);
    var fragments = findMp4Boxes(topLevelBoxes, 'moof');
    if (fragments.length > 0) {
      return parseFragmentedMp4VideoTrack(bytes, moov, topLevelBoxes, fragments, targetSeconds, movieTimescale);
    }

    var tracks = findMp4Boxes(childrenOfMp4Box(bytes, moov), 'trak');
    for (var trackIndex = 0; trackIndex < tracks.length; trackIndex += 1) {
      var track = parseMp4VideoTrack(bytes, tracks[trackIndex], targetSeconds, movieTimescale);
      if (track) {
        return track;
      }
    }

    throw new Error('No supported H.264/H.265/AV1/VP8/VP9 video track was found in the MP4 source.');
  }

  function parseMp4VideoTrack(bytes, trak, targetSeconds, movieTimescale) {
    var trackInfo = readMp4VideoTrackInfo(bytes, trak, movieTimescale);
    if (!trackInfo) {
      return null;
    }

    var sampleSizes = readMp4SampleSizes(bytes, findMp4Box(trackInfo.stblChildren, 'stsz') || findMp4Box(trackInfo.stblChildren, 'stz2'));
    var durations = readMp4SampleDurations(bytes, findMp4Box(trackInfo.stblChildren, 'stts'), sampleSizes.length);
    var compositionOffsets = readMp4CompositionOffsets(bytes, findMp4Box(trackInfo.stblChildren, 'ctts'), sampleSizes.length);
    var keyframes = readMp4Keyframes(bytes, findMp4Box(trackInfo.stblChildren, 'stss'), sampleSizes.length);
    var chunkOffsets = readMp4ChunkOffsets(bytes, findMp4Box(trackInfo.stblChildren, 'stco') || findMp4Box(trackInfo.stblChildren, 'co64'));
    var sampleToChunk = readMp4SampleToChunk(bytes, findMp4Box(trackInfo.stblChildren, 'stsc'));
    var offsets = buildMp4SampleOffsets(sampleSizes, chunkOffsets, sampleToChunk);
    var samples = [];
    var dts = 0;

    for (var sampleIndex = 0; sampleIndex < sampleSizes.length; sampleIndex += 1) {
      var duration = durations[sampleIndex] || durations[durations.length - 1] || Math.max(1, Math.round(trackInfo.timescale / 30));
      var offset = offsets[sampleIndex];
      var size = sampleSizes[sampleIndex];
      if (!Number.isFinite(offset) || !Number.isFinite(size) || offset < 0 || size <= 0 || offset + size > bytes.length) {
        throw new Error('MP4 sample table points outside the source data.');
      }

      samples.push({
        index: sampleIndex,
        keyframe: keyframes.has(sampleIndex + 1),
        pts: (dts + (compositionOffsets[sampleIndex] || 0)) / trackInfo.timescale,
        dts: dts / trackInfo.timescale,
        duration: duration / trackInfo.timescale,
        data: bytes.slice(offset, offset + size),
      });
      dts += duration;
    }

    return {
      codec: trackInfo.sampleDescription.codec,
      description: trackInfo.sampleDescription.description,
      orientation: trackInfo.orientation,
      samples: selectMp4DecodeSamples(applyMp4EditListToSamples(samples, trackInfo.editList), targetSeconds),
      targetSeconds: Math.max(0, Number(targetSeconds) || 0),
    };
  }

  function parseFragmentedMp4VideoTrack(bytes, moov, topLevelBoxes, fragments, targetSeconds, movieTimescale) {
    var tracks = findMp4Boxes(childrenOfMp4Box(bytes, moov), 'trak');
    var trackInfo = null;
    for (var trackIndex = 0; trackIndex < tracks.length; trackIndex += 1) {
      trackInfo = readMp4VideoTrackInfo(bytes, tracks[trackIndex], movieTimescale);
      if (trackInfo) {
        break;
      }
    }

    if (!trackInfo) {
      throw new Error('No supported H.264/H.265/AV1/VP8/VP9 video track was found in the fragmented MP4 source.');
    }

    var trexDefaults = readMp4TrackExtendsDefaults(bytes, moov, trackInfo.trackId);
    var samples = [];
    var nextDecodeTime = 0;
    for (var fragmentIndex = 0; fragmentIndex < fragments.length; fragmentIndex += 1) {
      var moof = fragments[fragmentIndex];
      var moofChildren = childrenOfMp4Box(bytes, moof);
      var trafs = findMp4Boxes(moofChildren, 'traf');
      var fallbackMdat = findFollowingMp4Mdat(topLevelBoxes, moof);

      for (var trafIndex = 0; trafIndex < trafs.length; trafIndex += 1) {
        var trafChildren = childrenOfMp4Box(bytes, trafs[trafIndex]);
        var tfhd = readMp4TrackFragmentHeader(bytes, findMp4Box(trafChildren, 'tfhd'), moof);
        if (!tfhd || tfhd.trackId !== trackInfo.trackId) {
          continue;
        }

        var tfdt = findMp4Box(trafChildren, 'tfdt');
        var baseDecodeTime = tfdt ? readMp4TrackFragmentDecodeTime(bytes, tfdt) : nextDecodeTime;
        var decodeTime = baseDecodeTime;
        var truns = findMp4Boxes(trafChildren, 'trun');
        var nextTrafDataCursor;
        for (var trunIndex = 0; trunIndex < truns.length; trunIndex += 1) {
          var trun = readMp4TrackRun(bytes, truns[trunIndex]);
          var baseDataOffset = tfhd.baseDataOffset !== undefined
            ? tfhd.baseDataOffset
            : tfhd.defaultBaseIsMoof
              ? moof.start
              : moof.start;
          var dataCursor = resolveMp4FragmentRunDataCursor({
            trun: trun,
            baseDataOffset: baseDataOffset,
            fallbackMdatStart: fallbackMdat ? fallbackMdat.dataStart : undefined,
            nextTrafDataCursor: nextTrafDataCursor,
          });

          for (var sampleIndex = 0; sampleIndex < trun.samples.length; sampleIndex += 1) {
            var sample = trun.samples[sampleIndex];
            var duration = sample.duration
              || tfhd.defaultSampleDuration
              || trexDefaults.defaultSampleDuration
              || Math.max(1, Math.round(trackInfo.timescale / 30));
            var size = sample.size || tfhd.defaultSampleSize || trexDefaults.defaultSampleSize;
            var flags = sample.flags !== undefined
              ? sample.flags
              : sampleIndex === 0 && trun.firstSampleFlags !== undefined
                ? trun.firstSampleFlags
                : tfhd.defaultSampleFlags !== undefined
                  ? tfhd.defaultSampleFlags
                  : trexDefaults.defaultSampleFlags;
            if (!Number.isFinite(size) || size <= 0 || dataCursor < 0 || dataCursor + size > bytes.length) {
              throw new Error('Fragmented MP4 sample table points outside the source data.');
            }

            var compositionOffset = sample.compositionTimeOffset || 0;
            samples.push({
              index: samples.length,
              keyframe: isMp4SampleKeyframe(flags, sampleIndex === 0 && samples.length === 0),
              pts: (decodeTime + compositionOffset) / trackInfo.timescale,
              dts: decodeTime / trackInfo.timescale,
              duration: duration / trackInfo.timescale,
              data: bytes.slice(dataCursor, dataCursor + size),
            });
            dataCursor += size;
            decodeTime += duration;
          }
          nextTrafDataCursor = dataCursor;
        }
        nextDecodeTime = Math.max(nextDecodeTime, decodeTime);
      }
    }

    return {
      codec: trackInfo.sampleDescription.codec,
      description: trackInfo.sampleDescription.description,
      orientation: trackInfo.orientation,
      samples: selectMp4DecodeSamples(applyMp4EditListToSamples(samples, trackInfo.editList), targetSeconds),
      targetSeconds: Math.max(0, Number(targetSeconds) || 0),
    };
  }

  function readMp4VideoTrackInfo(bytes, trak, movieTimescale) {
    var trakChildren = childrenOfMp4Box(bytes, trak);
    var mdia = findMp4Box(trakChildren, 'mdia');
    if (!mdia) {
      return null;
    }

    var mdiaChildren = childrenOfMp4Box(bytes, mdia);
    var hdlr = findMp4Box(mdiaChildren, 'hdlr');
    if (!hdlr || readAscii(bytes, hdlr.dataStart + 8, 4) !== 'vide') {
      return null;
    }

    var mdhd = findMp4Box(mdiaChildren, 'mdhd');
    var minf = findMp4Box(mdiaChildren, 'minf');
    var stbl = minf ? findMp4Box(childrenOfMp4Box(bytes, minf), 'stbl') : null;
    if (!mdhd || !stbl) {
      return null;
    }

    var timescale = readMp4MediaTimescale(bytes, mdhd);
    if (!timescale) {
      throw new Error('MP4 video track timescale is missing.');
    }

    var stblChildren = childrenOfMp4Box(bytes, stbl);
    var sampleDescription = readMp4SampleDescription(bytes, findMp4Box(stblChildren, 'stsd'));
    if (
      !sampleDescription
      || (
        sampleDescription.codecFamily !== 'avc'
        && sampleDescription.codecFamily !== 'hevc'
        && sampleDescription.codecFamily !== 'av1'
        && sampleDescription.codecFamily !== 'vp8'
        && sampleDescription.codecFamily !== 'vp9'
      )
    ) {
      return null;
    }

    return {
      trackId: readMp4TrackId(bytes, trakChildren),
      timescale: timescale,
      editList: readMp4EditList(bytes, trakChildren, movieTimescale, timescale),
      orientation: readMp4TrackDisplayOrientation(bytes, trakChildren),
      sampleDescription: sampleDescription,
      stblChildren: stblChildren,
    };
  }

  function demuxWebmVideoFrameSamples(bytes, targetSeconds) {
    var topLevelElements = parseEbmlElements(bytes, 0, bytes.length);
    var segment = findEbmlElement(topLevelElements, 0x18538067);
    if (!segment) {
      throw new Error('WebM Segment element was not found.');
    }

    var segmentChildren = parseEbmlElements(bytes, segment.dataStart, segment.end);
    var track = readWebmVideoTrack(bytes, findEbmlElement(segmentChildren, 0x1654AE6B));
    if (!track) {
      throw new Error('No supported VP8/VP9/AV1/H.264/H.265 video track was found in the WebM/Matroska source.');
    }

    var timecodeScale = readWebmTimecodeScale(bytes, findEbmlElement(segmentChildren, 0x1549A966));
    var clusters = findEbmlElements(segmentChildren, 0x1F43B675);
    var samples = [];
    for (var clusterIndex = 0; clusterIndex < clusters.length; clusterIndex += 1) {
      samples = samples.concat(readWebmClusterSamples(bytes, clusters[clusterIndex], track, timecodeScale));
    }

    samples.sort(function (a, b) {
      return a.pts - b.pts;
    });
    for (var index = 0; index < samples.length; index += 1) {
      if (samples[index].duration > 0) {
        continue;
      }

      var next = samples[index + 1];
      samples[index].duration = next && next.pts > samples[index].pts
        ? Math.max(0.001, next.pts - samples[index].pts)
        : 1 / 30;
    }

    return {
      codec: track.codec,
      description: track.description,
      samples: selectVideoDecodeSamples(samples, targetSeconds, 'WebM'),
      targetSeconds: Math.max(0, Number(targetSeconds) || 0),
      reason: track.codecLabel
        ? 'Worker decoded ' + track.codecLabel + ' video through WebCodecs.'
        : 'Worker decoded WebM video through WebCodecs.',
    };
  }

  function readWebmTimecodeScale(bytes, info) {
    if (!info) {
      return 1000000;
    }

    var scale = readEbmlUnsigned(bytes, findEbmlElement(parseEbmlElements(bytes, info.dataStart, info.end), 0x2AD7B1));
    return scale > 0 ? scale : 1000000;
  }

  function readWebmVideoTrack(bytes, tracks) {
    if (!tracks) {
      return null;
    }

    var trackEntries = findEbmlElements(parseEbmlElements(bytes, tracks.dataStart, tracks.end), 0xAE);
    for (var index = 0; index < trackEntries.length; index += 1) {
      var children = parseEbmlElements(bytes, trackEntries[index].dataStart, trackEntries[index].end);
      var trackType = readEbmlUnsigned(bytes, findEbmlElement(children, 0x83));
      if (trackType !== 1) {
        continue;
      }

      var codecId = readEbmlString(bytes, findEbmlElement(children, 0x86));
      var codecPrivate = readEbmlBinary(bytes, findEbmlElement(children, 0x63A2));
      var codec = readWebmVideoCodec(codecId, codecPrivate);
      if (!codec) {
        continue;
      }

      var trackNumber = readEbmlUnsigned(bytes, findEbmlElement(children, 0xD7));
      if (!trackNumber) {
        continue;
      }

      var defaultDuration = readEbmlUnsigned(bytes, findEbmlElement(children, 0x23E383));
      return {
        trackNumber: trackNumber,
        codec: codec.codec,
        codecLabel: codec.codecLabel,
        description: codec.description,
        defaultDurationSeconds: defaultDuration > 0 ? defaultDuration / 1000000000 : 0,
      };
    }

    return null;
  }

  function readWebmVideoCodec(codecId, codecPrivate) {
    if (codecId === 'V_VP8') {
      return { codec: 'vp8' };
    }

    if (codecId === 'V_VP9') {
      return {
        codec: codecPrivate && codecPrivate.length >= 7
          ? buildVpCodecString('vp09', codecPrivate)
          : 'vp09.00.10.08',
        description: codecPrivate && codecPrivate.length >= 7 ? codecPrivate : undefined,
      };
    }

    if (codecId === 'V_AV1') {
      return {
        codec: codecPrivate && codecPrivate.length >= 4
          ? buildAv1CodecString(codecPrivate)
          : 'av01.0.04M.08',
        description: codecPrivate && codecPrivate.length >= 4 ? codecPrivate : undefined,
      };
    }

    if (codecId === 'V_MPEG4/ISO/AVC') {
      if (!codecPrivate || codecPrivate.length < 4) {
        return null;
      }

      return {
        codec: buildAvcCodecString(codecPrivate),
        codecLabel: 'Matroska H.264',
        description: codecPrivate,
      };
    }

    if (codecId === 'V_MPEGH/ISO/HEVC') {
      if (!codecPrivate || codecPrivate.length < 23) {
        return null;
      }

      return {
        codec: buildHevcCodecString('hvc1', codecPrivate),
        codecLabel: 'Matroska H.265',
        description: codecPrivate,
      };
    }

    return null;
  }

  function readWebmClusterSamples(bytes, cluster, track, timecodeScale) {
    var children = parseEbmlElements(bytes, cluster.dataStart, cluster.end);
    var clusterTimecode = readEbmlUnsigned(bytes, findEbmlElement(children, 0xE7));
    var samples = [];

    findEbmlElements(children, 0xA3).forEach(function (simpleBlock) {
      var blockSamples = readWebmBlockSamples(bytes, simpleBlock, clusterTimecode, timecodeScale, track.trackNumber, track.defaultDurationSeconds, undefined, undefined);
      if (blockSamples) {
        samples = samples.concat(blockSamples);
      }
    });

    findEbmlElements(children, 0xA0).forEach(function (blockGroup) {
      var groupChildren = parseEbmlElements(bytes, blockGroup.dataStart, blockGroup.end);
      var block = findEbmlElement(groupChildren, 0xA1);
      var durationTicks = readEbmlUnsigned(bytes, findEbmlElement(groupChildren, 0x9B));
      var hasReferenceBlock = Boolean(findEbmlElement(groupChildren, 0xFB));
      var blockSamples = block
        ? readWebmBlockSamples(bytes, block, clusterTimecode, timecodeScale, track.trackNumber, track.defaultDurationSeconds, !hasReferenceBlock, durationTicksToSeconds(durationTicks, timecodeScale))
        : null;
      if (blockSamples) {
        samples = samples.concat(blockSamples);
      }
    });

    return samples;
  }

  function readWebmBlockSamples(bytes, block, clusterTimecode, timecodeScale, expectedTrackNumber, defaultDurationSeconds, keyframeOverride, durationSeconds) {
    var offset = block.dataStart;
    var trackNumber = readEbmlVint(bytes, offset, false);
    if (!trackNumber.length || offset + trackNumber.length > block.end) {
      throw new Error('WebM block track number is truncated.');
    }

    offset += trackNumber.length;
    if (trackNumber.value !== expectedTrackNumber) {
      return null;
    }

    if (offset + 3 > block.end) {
      throw new Error('WebM block header is truncated.');
    }

    var blockTimecode = readInt16(bytes, offset);
    offset += 2;
    var flags = bytes[offset] || 0;
    offset += 1;

    var timeSeconds = durationTicksToSeconds(clusterTimecode + blockTimecode, timecodeScale);
    var frameSlices = readWebmBlockFrameSlices(bytes, offset, block.end, flags & 0x06);
    var blockDuration = Math.max(0, Number(durationSeconds) || 0);
    var frameDuration = frameSlices.length > 1
      ? (blockDuration > 0 ? blockDuration / frameSlices.length : Math.max(0.001, Number(defaultDurationSeconds) || (1 / 30)))
      : blockDuration;
    var keyframe = keyframeOverride !== undefined ? keyframeOverride : Boolean(flags & 0x80);

    return frameSlices.map(function (slice, index) {
      var pts = timeSeconds + (frameSlices.length > 1 ? frameDuration * index : 0);
      return {
        index: index,
        keyframe: index === 0 ? keyframe : false,
        pts: pts,
        dts: pts,
        duration: frameDuration,
        data: bytes.slice(slice.start, slice.end),
      };
    });
  }

  function readWebmBlockFrameSlices(bytes, offset, end, lacing) {
    if (lacing === 0) {
      if (offset >= end) {
        throw new Error('WebM block frame payload is empty.');
      }
      return [{ start: offset, end: end }];
    }

    if (offset >= end) {
      throw new Error('WebM laced block is missing a lace frame count.');
    }

    var frameCount = (bytes[offset] || 0) + 1;
    offset += 1;
    if (frameCount < 2 || frameCount > 64) {
      throw new Error('WebM laced block has an invalid frame count.');
    }

    var sizes = [];
    if (lacing === 0x02) {
      offset = readWebmXiphLaceSizes(bytes, offset, end, frameCount, sizes);
    } else if (lacing === 0x04) {
      var fixedRemaining = end - offset;
      if (fixedRemaining <= 0 || fixedRemaining % frameCount !== 0) {
        throw new Error('WebM fixed-size laced block has uneven frame data.');
      }
      var fixedSize = fixedRemaining / frameCount;
      for (var fixedIndex = 0; fixedIndex < frameCount; fixedIndex += 1) {
        sizes.push(fixedSize);
      }
    } else if (lacing === 0x06) {
      offset = readWebmEbmlLaceSizes(bytes, offset, end, frameCount, sizes);
    } else {
      throw new Error('WebM laced block uses an unknown lacing mode.');
    }

    if (lacing === 0x02 || lacing === 0x06) {
      var knownSize = sizes.reduce(function (total, size) {
        return total + size;
      }, 0);
      var finalSize = end - offset - knownSize;
      if (finalSize <= 0) {
        throw new Error('WebM laced block has invalid inferred frame size.');
      }
      sizes.push(finalSize);
    }

    var slices = [];
    var cursor = offset;
    for (var index = 0; index < sizes.length; index += 1) {
      var size = sizes[index];
      if (!Number.isFinite(size) || size <= 0 || cursor + size > end) {
        throw new Error('WebM laced block frame size points outside the block.');
      }
      slices.push({ start: cursor, end: cursor + size });
      cursor += size;
    }

    if (cursor !== end || slices.length !== frameCount) {
      throw new Error('WebM laced block frame sizes do not match the block payload.');
    }

    return slices;
  }

  function readWebmXiphLaceSizes(bytes, offset, end, frameCount, sizes) {
    for (var frameIndex = 0; frameIndex < frameCount - 1; frameIndex += 1) {
      var size = 0;
      var foundEnd = false;
      while (offset < end) {
        var value = bytes[offset] || 0;
        offset += 1;
        size += value;
        if (value !== 255) {
          foundEnd = true;
          break;
        }
      }

      if (!foundEnd || size <= 0) {
        throw new Error('WebM Xiph-laced block has an invalid frame size.');
      }
      sizes.push(size);
    }

    return offset;
  }

  function readWebmEbmlLaceSizes(bytes, offset, end, frameCount, sizes) {
    var firstSize = readEbmlVint(bytes, offset, false);
    if (!firstSize.length || firstSize.value <= 0 || offset + firstSize.length > end) {
      throw new Error('WebM EBML-laced block has an invalid first frame size.');
    }

    sizes.push(firstSize.value);
    offset += firstSize.length;
    var previousSize = firstSize.value;
    for (var frameIndex = 1; frameIndex < frameCount - 1; frameIndex += 1) {
      var signedSize = readEbmlSignedVint(bytes, offset);
      if (!signedSize.length || offset + signedSize.length > end) {
        throw new Error('WebM EBML-laced block has an invalid frame size delta.');
      }

      previousSize += signedSize.value;
      if (previousSize <= 0) {
        throw new Error('WebM EBML-laced block produced a non-positive frame size.');
      }
      sizes.push(previousSize);
      offset += signedSize.length;
    }

    return offset;
  }

  function durationTicksToSeconds(ticks, timecodeScale) {
    return (Number(ticks) || 0) * (Number(timecodeScale) || 1000000) / 1000000000;
  }

  var EBML_UNKNOWN_SIZE_CHILD_IDS = {};
  EBML_UNKNOWN_SIZE_CHILD_IDS[0x18538067] = makeEbmlIdLookup([
    0xEC, 0xBF, 0x114D9B74, 0x1549A966, 0x1654AE6B, 0x1F43B675,
    0x1C53BB6B, 0x1941A469, 0x1043A770, 0x1254C367,
  ]);
  EBML_UNKNOWN_SIZE_CHILD_IDS[0x1F43B675] = makeEbmlIdLookup([
    0xEC, 0xBF, 0xE7, 0xA7, 0xAB, 0x5854, 0xA3, 0xA0,
  ]);
  EBML_UNKNOWN_SIZE_CHILD_IDS[0xA0] = makeEbmlIdLookup([
    0xEC, 0xBF, 0xA1, 0xA2, 0x75A1, 0x9B, 0xFA, 0xFB, 0xFD, 0xA4, 0x75A2,
  ]);

  function makeEbmlIdLookup(ids) {
    return ids.reduce(function (lookup, id) {
      lookup[id] = true;
      return lookup;
    }, {});
  }

  function parseEbmlElements(bytes, start, end) {
    var elements = [];
    var offset = start;
    while (offset < end) {
      var id = readEbmlVint(bytes, offset, true);
      var size = readEbmlVint(bytes, offset + id.length, false);
      if (!id.length || !size.length) {
        break;
      }

      var dataStart = offset + id.length + size.length;
      var elementEnd = size.unknownSize ? inferUnknownSizeElementEnd(bytes, id.value, dataStart, end) : dataStart + size.value;
      if (elementEnd > end || elementEnd <= dataStart) {
        break;
      }

      elements.push({
        id: id.value,
        start: offset,
        dataStart: dataStart,
        end: elementEnd,
      });
      offset = elementEnd;
    }

    return elements;
  }

  function inferUnknownSizeElementEnd(bytes, elementId, dataStart, end) {
    var childIds = EBML_UNKNOWN_SIZE_CHILD_IDS[elementId];
    if (!childIds) {
      return end;
    }

    var offset = dataStart;
    while (offset < end) {
      var id = readEbmlVint(bytes, offset, true);
      var size = id.length ? readEbmlVint(bytes, offset + id.length, false) : { length: 0 };
      if (!id.length || !size.length || !childIds[id.value]) {
        return offset > dataStart ? offset : end;
      }

      var childDataStart = offset + id.length + size.length;
      var childEnd = size.unknownSize
        ? inferUnknownSizeElementEnd(bytes, id.value, childDataStart, end)
        : childDataStart + size.value;
      if (childEnd > end || childEnd <= childDataStart) {
        return offset > dataStart ? offset : end;
      }

      offset = childEnd;
    }

    return end;
  }

  function findEbmlElement(elements, id) {
    return elements.find(function (element) {
      return element.id === id;
    }) || null;
  }

  function findEbmlElements(elements, id) {
    return elements.filter(function (element) {
      return element.id === id;
    });
  }

  function readEbmlUnsigned(bytes, element) {
    if (!element) {
      return 0;
    }

    var value = 0;
    for (var offset = element.dataStart; offset < element.end; offset += 1) {
      value = value * 256 + (bytes[offset] || 0);
    }
    return value;
  }

  function readEbmlString(bytes, element) {
    if (!element) {
      return '';
    }

    return readAscii(bytes, element.dataStart, element.end - element.dataStart).replace(/\0+$/, '');
  }

  function readEbmlBinary(bytes, element) {
    if (!element) {
      return undefined;
    }

    return bytes.slice(element.dataStart, element.end);
  }

  function readEbmlVint(bytes, offset, keepMarker) {
    var first = bytes[offset];
    if (first === undefined) {
      return { value: 0, length: 0 };
    }

    var mask = 0x80;
    var length = 1;
    while (length <= 8 && (first & mask) === 0) {
      mask >>= 1;
      length += 1;
    }

    if (length > 8 || offset + length > bytes.length) {
      return { value: 0, length: 0 };
    }

    var value = keepMarker ? first : first & (~mask);
    for (var index = 1; index < length; index += 1) {
      value = value * 256 + (bytes[offset + index] || 0);
    }

    return {
      value: value,
      length: length,
      unknownSize: !keepMarker && isEbmlUnknownSizeVint(bytes, offset, length, first, mask),
    };
  }

  function isEbmlUnknownSizeVint(bytes, offset, length, first, mask) {
    if ((first & (~mask)) !== mask - 1) {
      return false;
    }

    for (var index = 1; index < length; index += 1) {
      if (bytes[offset + index] !== 0xff) {
        return false;
      }
    }

    return true;
  }

  function readEbmlSignedVint(bytes, offset) {
    var vint = readEbmlVint(bytes, offset, false);
    if (!vint.length) {
      return vint;
    }

    var bias = Math.pow(2, (7 * vint.length) - 1) - 1;
    return {
      value: vint.value - bias,
      length: vint.length,
    };
  }

  function selectVideoDecodeSamples(samples, targetSeconds, label) {
    if (samples.length === 0) {
      throw new Error(label + ' video track has no samples.');
    }

    var target = Math.max(0, Number(targetSeconds) || 0);
    var targetIndex = samples.findIndex(function (sample) {
      return sample.pts >= target;
    });
    if (targetIndex < 0) {
      targetIndex = samples.length - 1;
    }

    var startIndex = targetIndex;
    while (startIndex > 0 && !samples[startIndex].keyframe) {
      startIndex -= 1;
    }
    if (!samples[startIndex].keyframe) {
      startIndex = 0;
    }

    var selected = [];
    var endTime = target + 1;
    for (var index = startIndex; index < samples.length && selected.length < 240; index += 1) {
      selected.push(samples[index]);
      if (index >= targetIndex && samples[index].pts >= endTime) {
        break;
      }
    }

    return selected;
  }

  function selectMp4DecodeSamples(samples, targetSeconds) {
    return selectVideoDecodeSamples(samples, targetSeconds, 'MP4');
  }

  function decodeVideoSamplesToBitmap(demuxed, request, _context) {
    return new Promise(function (resolve, reject) {
      var decoder;
      var frames = [];
      var config = {
        codec: demuxed.codec,
      };
      if (demuxed.description) {
        config.description = demuxed.description;
      }

      function closeFramesExcept(keptFrame) {
        frames.forEach(function (frame) {
          if (frame !== keptFrame && typeof frame.close === 'function') {
            frame.close();
          }
        });
      }

      Promise.resolve(
        typeof self.VideoDecoder.isConfigSupported === 'function'
          ? self.VideoDecoder.isConfigSupported(config)
          : { supported: true, config: config },
      )
        .then(function (support) {
          if (support && support.supported === false) {
            throw new Error('Browser WebCodecs does not support ' + demuxed.codec + ' in this worker.');
          }

          decoder = new self.VideoDecoder({
            output: function (frame) {
              frames.push(frame);
            },
            error: function (error) {
              reject(error);
            },
          });
          decoder.configure(support && support.config ? support.config : config);

          demuxed.samples.forEach(function (sample, index) {
            decoder.decode(new self.EncodedVideoChunk({
              type: sample.keyframe || index === 0 ? 'key' : 'delta',
              timestamp: Math.round(sample.pts * 1000000),
              duration: Math.max(1, Math.round(sample.duration * 1000000)),
              data: sample.data,
            }));
          });

          return decoder.flush();
        })
        .then(function () {
          if (decoder && decoder.state !== 'closed') {
            decoder.close();
          }
          if (frames.length === 0) {
            throw new Error('WebCodecs produced no video frames for the requested timestamp.');
          }

          var targetUs = Math.round(demuxed.targetSeconds * 1000000);
          var selected = frames[0];
          var selectedDistance = Math.abs((selected.timestamp || 0) - targetUs);
          frames.forEach(function (frame) {
            var distance = Math.abs((frame.timestamp || 0) - targetUs);
            if (distance <= selectedDistance) {
              selected = frame;
              selectedDistance = distance;
            }
          });

          var bitmap = drawVideoFrameToBitmap(selected, request, demuxed.orientation);
          var timestamp = typeof selected.timestamp === 'number' ? selected.timestamp / 1000000 : demuxed.targetSeconds;
          var duration = typeof selected.duration === 'number' ? selected.duration / 1000000 : 0.04;
          var reason = demuxed.reason || 'Worker decoded video through WebCodecs.';
          if (demuxed.orientation && demuxed.orientation.rotation) {
            reason = 'Worker decoded video through WebCodecs with MP4 ' + demuxed.orientation.rotation + 'deg orientation metadata.';
          }
          closeFramesExcept(selected);
          if (typeof selected.close === 'function') {
            selected.close();
          }
          resolve({
            bitmap: bitmap,
            timestamp: timestamp,
            duration: duration || 0.04,
            reason: reason,
          });
        })
        .catch(function (error) {
          if (decoder && decoder.state !== 'closed') {
            try {
              decoder.close();
            } catch (_error) {
              // Ignore close failures during decode error handling.
            }
          }
          closeFramesExcept(null);
          reject(error);
        });
    });
  }

  function drawVideoFrameToBitmap(frame, request, orientation) {
    var frameWidth = frame.displayWidth || frame.codedWidth || 320;
    var frameHeight = frame.displayHeight || frame.codedHeight || 180;
    var targetWidth = Math.max(16, Math.min(4096, Math.round(Number(request.targetWidth) || frameWidth)));
    var targetHeight = Math.max(16, Math.min(4096, Math.round(Number(request.targetHeight) || frameHeight)));
    var canvas = new self.OffscreenCanvas(targetWidth, targetHeight);
    var context = canvas.getContext('2d', { alpha: false });
    if (!context || typeof canvas.transferToImageBitmap !== 'function') {
      throw new Error('OffscreenCanvas 2D transfer is unavailable for decoded video frames.');
    }

    var drawPlan = buildVideoFrameDrawPlan(targetWidth, targetHeight, orientation);
    context.save();
    context.translate(drawPlan.translateX, drawPlan.translateY);
    context.rotate(drawPlan.rotationRadians);
    context.drawImage(frame, 0, 0, drawPlan.drawWidth, drawPlan.drawHeight);
    context.restore();
    return canvas.transferToImageBitmap();
  }

  function buildVideoFrameDrawPlan(targetWidth, targetHeight, orientation) {
    var rotation = normalizeMp4OrientationRotation(orientation && orientation.rotation);
    if (rotation === 90) {
      return {
        rotation: rotation,
        rotationRadians: -Math.PI / 2,
        translateX: 0,
        translateY: targetHeight,
        drawWidth: targetHeight,
        drawHeight: targetWidth,
      };
    }

    if (rotation === 180) {
      return {
        rotation: rotation,
        rotationRadians: Math.PI,
        translateX: targetWidth,
        translateY: targetHeight,
        drawWidth: targetWidth,
        drawHeight: targetHeight,
      };
    }

    if (rotation === 270) {
      return {
        rotation: rotation,
        rotationRadians: Math.PI / 2,
        translateX: targetWidth,
        translateY: 0,
        drawWidth: targetHeight,
        drawHeight: targetWidth,
      };
    }

    return {
      rotation: 0,
      rotationRadians: 0,
      translateX: 0,
      translateY: 0,
      drawWidth: targetWidth,
      drawHeight: targetHeight,
    };
  }

  function parseMp4Boxes(bytes, start, end) {
    var boxes = [];
    var offset = start;
    while (offset + 8 <= end) {
      var size = readUint32(bytes, offset);
      var type = readAscii(bytes, offset + 4, 4);
      var headerSize = 8;
      if (size === 1) {
        if (offset + 16 > end) {
          break;
        }
        size = readUint64(bytes, offset + 8);
        headerSize = 16;
      } else if (size === 0) {
        size = end - offset;
      }

      if (!size || size < headerSize || offset + size > end) {
        break;
      }

      boxes.push({
        type: type,
        start: offset,
        dataStart: offset + headerSize,
        end: offset + size,
      });
      offset += size;
    }
    return boxes;
  }

  function childrenOfMp4Box(bytes, box) {
    return parseMp4Boxes(bytes, box.dataStart, box.end);
  }

  function findMp4Box(boxes, type) {
    return boxes.find(function (box) {
      return box.type === type;
    }) || null;
  }

  function findMp4Boxes(boxes, type) {
    return boxes.filter(function (box) {
      return box.type === type;
    });
  }

  function findMp4ChildBoxInRange(bytes, start, end, type) {
    return findMp4Box(parseMp4Boxes(bytes, start, end), type);
  }

  function readMp4MediaTimescale(bytes, mdhd) {
    if (!mdhd || mdhd.dataStart + 4 > mdhd.end) {
      throw new Error('MP4 media header is truncated.');
    }

    var version = bytes[mdhd.dataStart];
    var timescaleOffset = version === 1 ? mdhd.dataStart + 20 : mdhd.dataStart + 12;
    if (timescaleOffset + 4 > mdhd.end) {
      throw new Error('MP4 media header is truncated.');
    }

    if (version === 1) {
      return readUint32(bytes, timescaleOffset);
    }
    return readUint32(bytes, timescaleOffset);
  }

  function readMp4MovieTimescale(bytes, moov) {
    var mvhd = findMp4Box(childrenOfMp4Box(bytes, moov), 'mvhd');
    if (!mvhd) {
      return 0;
    }

    if (mvhd.dataStart + 4 > mvhd.end) {
      throw new Error('MP4 movie header is truncated.');
    }

    var version = bytes[mvhd.dataStart];
    var timescaleOffset = version === 1 ? mvhd.dataStart + 20 : mvhd.dataStart + 12;
    if (timescaleOffset + 4 > mvhd.end) {
      throw new Error('MP4 movie header is truncated.');
    }

    return readUint32(bytes, timescaleOffset);
  }

  function readMp4SampleDescription(bytes, stsd) {
    if (!stsd) {
      throw new Error('MP4 sample description table is missing.');
    }

    if (stsd.dataStart + 8 > stsd.end) {
      throw new Error('MP4 sample description table is truncated.');
    }

    var entryCount = readUint32(bytes, stsd.dataStart + 4);
    var offset = stsd.dataStart + 8;
    for (var index = 0; index < entryCount; index += 1) {
      if (offset + 8 > stsd.end) {
        throw new Error('MP4 sample description table is truncated.');
      }

      var size = readUint32(bytes, offset);
      var type = readAscii(bytes, offset + 4, 4);
      var entryEnd = offset + size;
      if (!size || size < 8 || entryEnd > stsd.end) {
        throw new Error('MP4 sample description table is truncated.');
      }

      if (type === 'avc1' || type === 'avc3') {
        if (offset + 86 > entryEnd) {
          throw new Error('MP4 sample description table is truncated.');
        }

        var avcC = findMp4ChildBoxInRange(bytes, offset + 86, entryEnd, 'avcC');
        if (!avcC) {
          throw new Error('H.264 MP4 track is missing avcC decoder configuration.');
        }

        var description = bytes.slice(avcC.dataStart, avcC.end);
        if (description.length < 4) {
          throw new Error('H.264 avcC decoder configuration is too small.');
        }

        return {
          codecFamily: 'avc',
          codec: buildAvcCodecString(description, type),
          description: description,
        };
      }

      if (type === 'hvc1' || type === 'hev1') {
        if (offset + 86 > entryEnd) {
          throw new Error('MP4 sample description table is truncated.');
        }

        var hvcC = findMp4ChildBoxInRange(bytes, offset + 86, entryEnd, 'hvcC');
        if (!hvcC) {
          throw new Error('H.265 MP4 track is missing hvcC decoder configuration.');
        }

        var hevcDescription = bytes.slice(hvcC.dataStart, hvcC.end);
        if (hevcDescription.length < 23) {
          throw new Error('H.265 hvcC decoder configuration is too small.');
        }

        return {
          codecFamily: 'hevc',
          codec: buildHevcCodecString(type, hevcDescription),
          description: hevcDescription,
        };
      }

      if (type === 'av01') {
        if (offset + 86 > entryEnd) {
          throw new Error('MP4 sample description table is truncated.');
        }

        var av1C = findMp4ChildBoxInRange(bytes, offset + 86, entryEnd, 'av1C');
        if (!av1C) {
          throw new Error('AV1 MP4 track is missing av1C decoder configuration.');
        }

        var av1Description = bytes.slice(av1C.dataStart, av1C.end);
        if (av1Description.length < 4) {
          throw new Error('AV1 av1C decoder configuration is too small.');
        }

        return {
          codecFamily: 'av1',
          codec: buildAv1CodecString(av1Description),
        };
      }

      if (type === 'vp08' || type === 'vp09') {
        if (offset + 86 > entryEnd) {
          throw new Error('MP4 sample description table is truncated.');
        }

        var vpcC = findMp4ChildBoxInRange(bytes, offset + 86, entryEnd, 'vpcC');
        if (!vpcC) {
          throw new Error('VP8/VP9 MP4 track is missing vpcC decoder configuration.');
        }

        var vpDescription = bytes.slice(vpcC.dataStart, vpcC.end);
        if (vpDescription.length < 7) {
          throw new Error('VP8/VP9 vpcC decoder configuration is too small.');
        }

        return {
          codecFamily: type === 'vp09' ? 'vp9' : 'vp8',
          codec: buildVpCodecString(type, vpDescription),
        };
      }

      offset = entryEnd;
    }

    return null;
  }

  function buildHevcCodecString(type, description) {
    var profileByte = description[1] || 0;
    var profileSpace = (profileByte >> 6) & 0x03;
    var tierFlag = (profileByte & 0x20) ? 'H' : 'L';
    var profileIdc = profileByte & 0x1f;
    var profileSpacePrefix = profileSpace === 1 ? 'A' : profileSpace === 2 ? 'B' : profileSpace === 3 ? 'C' : '';
    var compatibility = readUint32(description, 2).toString(16).toUpperCase().replace(/0+$/, '') || '0';
    var levelIdc = description[12] || 0;
    var constraints = Array.prototype.slice.call(description, 6, 12)
      .map(function (value) { return toHexByte(value); })
      .join('')
      .replace(/(00)+$/, '');
    var constraintSuffix = constraints ? '.' + constraints : '';

    return type + '.' + profileSpacePrefix + profileIdc + '.' + compatibility + '.' + tierFlag + levelIdc + constraintSuffix;
  }

  function buildAvcCodecString(description, type) {
    var codecType = type === 'avc3' ? 'avc3' : 'avc1';
    return codecType + '.' + toHexByte(description[1]) + toHexByte(description[2]) + toHexByte(description[3]);
  }

  function buildAv1CodecString(description) {
    var profile = (description[1] >> 5) & 0x07;
    var level = description[1] & 0x1f;
    var tier = (description[2] & 0x80) ? 'H' : 'M';
    var highBitDepth = (description[2] & 0x40) !== 0;
    var twelveBit = (description[2] & 0x20) !== 0;
    var bitDepth = highBitDepth ? (twelveBit ? 12 : 10) : 8;
    return 'av01.' + profile + '.' + pad2(level) + tier + '.' + pad2(bitDepth);
  }

  function buildVpCodecString(type, description) {
    if (type === 'vp08') {
      return 'vp8';
    }

    var configOffset = description.length >= 7 && (description[0] === 0 || description[0] === 1) ? 4 : 0;
    var profile = description[configOffset] || 0;
    var level = description[configOffset + 1] || 10;
    var bitDepth = ((description[configOffset + 2] || 0) >> 4) & 0x0f;
    return 'vp09.' + pad2(profile) + '.' + pad2(level) + '.' + pad2(bitDepth || 8);
  }

  function pad2(value) {
    return String(Math.max(0, Number(value) || 0)).padStart(2, '0');
  }

  function readMp4SampleSizes(bytes, stszOrStz2) {
    if (!stszOrStz2) {
      throw new Error('MP4 sample size table is missing.');
    }

    if (stszOrStz2.dataStart + 12 > stszOrStz2.end) {
      throw new Error('MP4 sample size table is truncated.');
    }

    if (stszOrStz2.type === 'stz2') {
      return readMp4CompactSampleSizes(bytes, stszOrStz2);
    }

    var sampleSize = readUint32(bytes, stszOrStz2.dataStart + 4);
    var sampleCount = readUint32(bytes, stszOrStz2.dataStart + 8);
    var sizes = [];
    if (sampleSize > 0) {
      for (var index = 0; index < sampleCount; index += 1) {
        sizes.push(sampleSize);
      }
      return sizes;
    }

    var offset = stszOrStz2.dataStart + 12;
    if (offset + (sampleCount * 4) > stszOrStz2.end) {
      throw new Error('MP4 sample size table is truncated.');
    }
    for (var sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
      sizes.push(readUint32(bytes, offset));
      offset += 4;
    }
    return sizes;
  }

  function readMp4CompactSampleSizes(bytes, stz2) {
    if (stz2.dataStart + 12 > stz2.end) {
      throw new Error('MP4 compact sample size table is truncated.');
    }

    var fieldSize = bytes[stz2.dataStart + 7] || 0;
    var sampleCount = readUint32(bytes, stz2.dataStart + 8);
    var sizes = [];
    var offset = stz2.dataStart + 12;

    if (fieldSize === 4) {
      if (offset + Math.ceil(sampleCount / 2) > stz2.end) {
        throw new Error('MP4 compact sample size table is truncated.');
      }
      for (var sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
        var pair = bytes[offset] || 0;
        sizes.push(sampleIndex % 2 === 0 ? (pair >> 4) & 0x0f : pair & 0x0f);
        if (sampleIndex % 2 === 1) {
          offset += 1;
        }
      }
      return sizes;
    }

    if (fieldSize === 8) {
      if (offset + sampleCount > stz2.end) {
        throw new Error('MP4 compact sample size table is truncated.');
      }
      for (var index = 0; index < sampleCount; index += 1) {
        sizes.push(bytes[offset] || 0);
        offset += 1;
      }
      return sizes;
    }

    if (fieldSize === 16) {
      if (offset + (sampleCount * 2) > stz2.end) {
        throw new Error('MP4 compact sample size table is truncated.');
      }
      for (var sizeIndex = 0; sizeIndex < sampleCount; sizeIndex += 1) {
        sizes.push(readUint16(bytes, offset));
        offset += 2;
      }
      return sizes;
    }

    throw new Error('MP4 compact sample size table uses unsupported field size ' + fieldSize + '.');
  }

  function readMp4SampleDurations(bytes, stts, sampleCount) {
    if (!stts) {
      throw new Error('MP4 decoding time table is missing.');
    }
    if (stts.dataStart + 8 > stts.end) {
      throw new Error('MP4 decoding time table is truncated.');
    }

    var durations = [];
    var entryCount = readUint32(bytes, stts.dataStart + 4);
    var offset = stts.dataStart + 8;
    if (offset + (entryCount * 8) > stts.end) {
      throw new Error('MP4 decoding time table is truncated.');
    }
    for (var index = 0; index < entryCount; index += 1) {
      var count = readUint32(bytes, offset);
      var delta = readUint32(bytes, offset + 4);
      for (var repeat = 0; repeat < count && durations.length < sampleCount; repeat += 1) {
        durations.push(delta);
      }
      offset += 8;
    }
    if (durations.length < sampleCount) {
      throw new Error('MP4 decoding time table does not cover all samples.');
    }
    return durations;
  }

  function applyMp4EditListToSamples(samples, editList) {
    if (!editList || editList.length === 0) {
      return samples;
    }

    var orderedEdits = editList.slice().sort(function (a, b) {
      return a.movieStart - b.movieStart;
    });
    var firstEdit = orderedEdits[0];
    var lastEdit = orderedEdits[orderedEdits.length - 1];
    var adjustedSamples = [];

    samples.forEach(function (sample) {
      var edit = findMp4EditForSample(sample, orderedEdits);
      if (!edit) {
        return;
      }

      var rate = Math.max(0.0001, Number(edit.rate) || 1);
      var adjustedSample = Object.assign({}, sample, {
        pts: edit.movieStart + ((sample.pts - edit.mediaStart) / rate),
        dts: edit.movieStart + ((sample.dts - edit.mediaStart) / rate),
        duration: sample.duration / rate,
      });

      if (
        !Number.isFinite(adjustedSample.pts)
        || !Number.isFinite(adjustedSample.dts)
        || adjustedSample.pts < firstEdit.movieStart - 5
        || adjustedSample.pts > lastEdit.movieEnd + 5
      ) {
        return;
      }

      adjustedSamples.push(adjustedSample);
    });

    return adjustedSamples.length > 0 ? adjustedSamples : samples;
  }

  function findMp4EditForSample(sample, editList) {
    for (var index = 0; index < editList.length; index += 1) {
      var edit = editList[index];
      var mediaDuration = Math.max(0, edit.movieEnd - edit.movieStart) * Math.max(0.0001, edit.rate || 1);
      var mediaEnd = edit.mediaStart + mediaDuration;
      if (sample.pts + Math.max(0.001, sample.duration || 0) >= edit.mediaStart && sample.pts < mediaEnd + Math.max(0.001, sample.duration || 0)) {
        return edit;
      }
    }

    var firstEdit = editList[0];
    if (firstEdit && sample.pts < firstEdit.mediaStart && sample.pts >= firstEdit.mediaStart - 5) {
      return firstEdit;
    }

    return null;
  }

  function readMp4CompositionOffsets(bytes, ctts, sampleCount) {
    var offsets = Array.from({ length: sampleCount }, function () { return 0; });
    if (!ctts) {
      return offsets;
    }
    if (ctts.dataStart + 8 > ctts.end) {
      throw new Error('MP4 composition offset table is truncated.');
    }

    var version = bytes[ctts.dataStart];
    var entryCount = readUint32(bytes, ctts.dataStart + 4);
    var offset = ctts.dataStart + 8;
    var sampleIndex = 0;
    if (offset + (entryCount * 8) > ctts.end) {
      throw new Error('MP4 composition offset table is truncated.');
    }
    for (var index = 0; index < entryCount; index += 1) {
      var count = readUint32(bytes, offset);
      var compositionOffset = version === 1 ? readInt32(bytes, offset + 4) : readUint32(bytes, offset + 4);
      for (var repeat = 0; repeat < count && sampleIndex < sampleCount; repeat += 1) {
        offsets[sampleIndex] = compositionOffset;
        sampleIndex += 1;
      }
      offset += 8;
    }
    if (sampleIndex < sampleCount) {
      throw new Error('MP4 composition offset table does not cover all samples.');
    }
    return offsets;
  }

  function readMp4Keyframes(bytes, stss, sampleCount) {
    var keyframes = new Set();
    if (!stss) {
      for (var sampleIndex = 1; sampleIndex <= sampleCount; sampleIndex += 1) {
        keyframes.add(sampleIndex);
      }
      return keyframes;
    }
    if (stss.dataStart + 8 > stss.end) {
      throw new Error('MP4 sync sample table is truncated.');
    }

    var entryCount = readUint32(bytes, stss.dataStart + 4);
    var offset = stss.dataStart + 8;
    if (offset + (entryCount * 4) > stss.end) {
      throw new Error('MP4 sync sample table is truncated.');
    }
    for (var index = 0; index < entryCount; index += 1) {
      var sampleNumber = readUint32(bytes, offset);
      if (sampleNumber < 1 || sampleNumber > sampleCount) {
        throw new Error('MP4 sync sample table points outside the sample range.');
      }
      keyframes.add(sampleNumber);
      offset += 4;
    }
    return keyframes;
  }

  function readMp4ChunkOffsets(bytes, stcoOrCo64) {
    if (!stcoOrCo64) {
      throw new Error('MP4 chunk offset table is missing.');
    }

    var offsets = [];
    if (stcoOrCo64.dataStart + 8 > stcoOrCo64.end) {
      throw new Error('MP4 chunk offset table is truncated.');
    }
    var entryCount = readUint32(bytes, stcoOrCo64.dataStart + 4);
    var offset = stcoOrCo64.dataStart + 8;
    for (var index = 0; index < entryCount; index += 1) {
      if (stcoOrCo64.type === 'co64') {
        if (offset + 8 > stcoOrCo64.end) {
          throw new Error('MP4 64-bit chunk offset table is truncated.');
        }
        offsets.push(readMp4SafeUint64(bytes, offset, 'MP4 64-bit chunk offset'));
        offset += 8;
      } else {
        if (offset + 4 > stcoOrCo64.end) {
          throw new Error('MP4 chunk offset table is truncated.');
        }
        offsets.push(readUint32(bytes, offset));
        offset += 4;
      }
    }
    return offsets;
  }

  function readMp4SampleToChunk(bytes, stsc) {
    if (!stsc) {
      throw new Error('MP4 sample-to-chunk table is missing.');
    }
    if (stsc.dataStart + 8 > stsc.end) {
      throw new Error('MP4 sample-to-chunk table is truncated.');
    }

    var entries = [];
    var entryCount = readUint32(bytes, stsc.dataStart + 4);
    var offset = stsc.dataStart + 8;
    if (entryCount === 0) {
      throw new Error('MP4 sample-to-chunk table has no entries.');
    }
    if (offset + (entryCount * 12) > stsc.end) {
      throw new Error('MP4 sample-to-chunk table is truncated.');
    }
    var previousFirstChunk = 0;
    for (var index = 0; index < entryCount; index += 1) {
      var firstChunk = readUint32(bytes, offset);
      var samplesPerChunk = readUint32(bytes, offset + 4);
      if (firstChunk <= previousFirstChunk || firstChunk < 1) {
        throw new Error('MP4 sample-to-chunk table has invalid chunk ordering.');
      }
      if (samplesPerChunk < 1) {
        throw new Error('MP4 sample-to-chunk table has an invalid samples-per-chunk value.');
      }
      entries.push({
        firstChunk: firstChunk,
        samplesPerChunk: samplesPerChunk,
      });
      previousFirstChunk = firstChunk;
      offset += 12;
    }
    return entries;
  }

  function buildMp4SampleOffsets(sampleSizes, chunkOffsets, sampleToChunk) {
    var offsets = [];
    var sampleIndex = 0;
    var stscIndex = 0;
    for (var chunkIndex = 0; chunkIndex < chunkOffsets.length && sampleIndex < sampleSizes.length; chunkIndex += 1) {
      var chunkNumber = chunkIndex + 1;
      while (stscIndex + 1 < sampleToChunk.length && sampleToChunk[stscIndex + 1].firstChunk <= chunkNumber) {
        stscIndex += 1;
      }

      var samplesPerChunk = sampleToChunk[stscIndex] ? sampleToChunk[stscIndex].samplesPerChunk : 1;
      var offset = chunkOffsets[chunkIndex];
      for (var index = 0; index < samplesPerChunk && sampleIndex < sampleSizes.length; index += 1) {
        offsets[sampleIndex] = offset;
        offset += sampleSizes[sampleIndex];
        sampleIndex += 1;
      }
    }
    if (offsets.length < sampleSizes.length) {
      throw new Error('MP4 sample-to-chunk table does not map all samples.');
    }
    return offsets;
  }

  function readMp4TrackId(bytes, trakChildren) {
    var tkhd = findMp4Box(trakChildren, 'tkhd');
    if (!tkhd) {
      throw new Error('MP4 video track id is missing.');
    }

    var version = bytes[tkhd.dataStart];
    return readUint32(bytes, version === 1 ? tkhd.dataStart + 20 : tkhd.dataStart + 12);
  }

  function readMp4TrackDisplayOrientation(bytes, trakChildren) {
    var tkhd = findMp4Box(trakChildren, 'tkhd');
    if (!tkhd) {
      return { rotation: 0 };
    }

    var matrix = readMp4TrackMatrix(bytes, tkhd);
    return resolveMp4DisplayOrientation(matrix);
  }

  function readMp4TrackMatrix(bytes, tkhd) {
    var version = bytes[tkhd.dataStart];
    var matrixStart = tkhd.dataStart + (version === 1 ? 52 : 40);
    if (matrixStart + 36 > tkhd.end) {
      return [];
    }

    var matrix = [];
    for (var index = 0; index < 9; index += 1) {
      matrix.push(readInt32(bytes, matrixStart + (index * 4)));
    }
    return matrix;
  }

  function resolveMp4DisplayOrientation(matrix) {
    if (!matrix || matrix.length < 5) {
      return { rotation: 0 };
    }

    var unit = 65536;
    var a = matrix[0];
    var b = matrix[1];
    var c = matrix[3];
    var d = matrix[4];

    if (isNearlyMp4MatrixValue(a, unit) && isNearlyMp4MatrixValue(b, 0) && isNearlyMp4MatrixValue(c, 0) && isNearlyMp4MatrixValue(d, unit)) {
      return { rotation: 0 };
    }

    if (isNearlyMp4MatrixValue(a, 0) && isNearlyMp4MatrixValue(b, -unit) && isNearlyMp4MatrixValue(c, unit) && isNearlyMp4MatrixValue(d, 0)) {
      return { rotation: 90 };
    }

    if (isNearlyMp4MatrixValue(a, -unit) && isNearlyMp4MatrixValue(b, 0) && isNearlyMp4MatrixValue(c, 0) && isNearlyMp4MatrixValue(d, -unit)) {
      return { rotation: 180 };
    }

    if (isNearlyMp4MatrixValue(a, 0) && isNearlyMp4MatrixValue(b, unit) && isNearlyMp4MatrixValue(c, -unit) && isNearlyMp4MatrixValue(d, 0)) {
      return { rotation: 270 };
    }

    return { rotation: 0 };
  }

  function isNearlyMp4MatrixValue(value, expected) {
    return Math.abs((Number(value) || 0) - expected) <= 1024;
  }

  function normalizeMp4OrientationRotation(rotation) {
    var normalized = Math.round(Number(rotation) || 0) % 360;
    if (normalized < 0) {
      normalized += 360;
    }
    return normalized === 90 || normalized === 180 || normalized === 270 ? normalized : 0;
  }

  function readMp4EditList(bytes, trakChildren, movieTimescale, mediaTimescale) {
    if (!movieTimescale || !mediaTimescale) {
      return [];
    }

    var edts = findMp4Box(trakChildren, 'edts');
    var elst = edts ? findMp4Box(childrenOfMp4Box(bytes, edts), 'elst') : null;
    if (!elst || elst.dataStart + 8 > elst.end) {
      return [];
    }

    var version = bytes[elst.dataStart];
    var entryCount = readUint32(bytes, elst.dataStart + 4);
    var offset = elst.dataStart + 8;
    var movieStart = 0;
    var edits = [];

    for (var index = 0; index < entryCount && offset < elst.end; index += 1) {
      var segmentDuration;
      var mediaTime;
      if (version === 1) {
        if (offset + 20 > elst.end) {
          break;
        }
        segmentDuration = readUint64(bytes, offset);
        mediaTime = readInt64(bytes, offset + 8);
        offset += 16;
      } else {
        if (offset + 12 > elst.end) {
          break;
        }
        segmentDuration = readUint32(bytes, offset);
        mediaTime = readInt32(bytes, offset + 4);
        offset += 8;
      }

      var mediaRateInteger = readInt16(bytes, offset);
      var mediaRateFraction = readUint16(bytes, offset + 2);
      offset += 4;

      var durationSeconds = segmentDuration / movieTimescale;
      if (mediaTime >= 0 && durationSeconds > 0) {
        var rate = mediaRateInteger + (mediaRateFraction / 65536);
        if (rate > 0) {
          edits.push({
            movieStart: movieStart,
            movieEnd: movieStart + durationSeconds,
            mediaStart: mediaTime / mediaTimescale,
            rate: rate,
          });
        }
      }

      movieStart += Math.max(0, durationSeconds);
    }

    return edits;
  }

  function readMp4TrackExtendsDefaults(bytes, moov, trackId) {
    var mvex = findMp4Box(childrenOfMp4Box(bytes, moov), 'mvex');
    if (!mvex) {
      return {};
    }

    var trexBoxes = findMp4Boxes(childrenOfMp4Box(bytes, mvex), 'trex');
    for (var index = 0; index < trexBoxes.length; index += 1) {
      var trex = trexBoxes[index];
      if (trex.dataStart + 24 > trex.end || readUint32(bytes, trex.dataStart + 4) !== trackId) {
        continue;
      }

      return {
        defaultSampleDuration: readUint32(bytes, trex.dataStart + 12),
        defaultSampleSize: readUint32(bytes, trex.dataStart + 16),
        defaultSampleFlags: readUint32(bytes, trex.dataStart + 20),
      };
    }

    return {};
  }

  function readMp4TrackFragmentHeader(bytes, tfhd, moof) {
    if (!tfhd) {
      return null;
    }
    if (tfhd.dataStart + 8 > tfhd.end) {
      throw new Error('MP4 track fragment header is truncated.');
    }

    var flags = readUint32(bytes, tfhd.dataStart) & 0xffffff;
    var offset = tfhd.dataStart + 4;
    var header = {
      trackId: readUint32(bytes, offset),
      baseDataOffset: undefined,
      defaultSampleDuration: undefined,
      defaultSampleSize: undefined,
      defaultSampleFlags: undefined,
      defaultBaseIsMoof: Boolean(flags & 0x020000),
    };
    offset += 4;

    if (flags & 0x000001) {
      if (offset + 8 > tfhd.end) {
        throw new Error('MP4 track fragment header is truncated.');
      }
      header.baseDataOffset = readMp4SafeUint64(bytes, offset, 'MP4 track fragment base data offset');
      offset += 8;
    } else if (header.defaultBaseIsMoof) {
      header.baseDataOffset = moof.start;
    }

    if (flags & 0x000002) {
      if (offset + 4 > tfhd.end) {
        throw new Error('MP4 track fragment header is truncated.');
      }
      offset += 4;
    }

    if (flags & 0x000008) {
      if (offset + 4 > tfhd.end) {
        throw new Error('MP4 track fragment header is truncated.');
      }
      header.defaultSampleDuration = readUint32(bytes, offset);
      offset += 4;
    }

    if (flags & 0x000010) {
      if (offset + 4 > tfhd.end) {
        throw new Error('MP4 track fragment header is truncated.');
      }
      header.defaultSampleSize = readUint32(bytes, offset);
      offset += 4;
    }

    if (flags & 0x000020) {
      if (offset + 4 > tfhd.end) {
        throw new Error('MP4 track fragment header is truncated.');
      }
      header.defaultSampleFlags = readUint32(bytes, offset);
    }

    return header;
  }

  function readMp4TrackFragmentDecodeTime(bytes, tfdt) {
    if (!tfdt || tfdt.dataStart + 8 > tfdt.end) {
      throw new Error('MP4 track fragment decode time is truncated.');
    }
    var version = bytes[tfdt.dataStart];
    if (version === 1) {
      if (tfdt.dataStart + 12 > tfdt.end) {
        throw new Error('MP4 track fragment decode time is truncated.');
      }
      return readMp4SafeUint64(bytes, tfdt.dataStart + 4, 'MP4 track fragment decode time');
    }
    return readUint32(bytes, tfdt.dataStart + 4);
  }

  function readMp4TrackRun(bytes, trun) {
    if (!trun || trun.dataStart + 8 > trun.end) {
      throw new Error('MP4 track run is truncated.');
    }
    var version = bytes[trun.dataStart];
    var flags = readUint32(bytes, trun.dataStart) & 0xffffff;
    var sampleCount = readUint32(bytes, trun.dataStart + 4);
    var offset = trun.dataStart + 8;
    var dataOffset;
    var firstSampleFlags;
    var samples = [];

    if (flags & 0x000001) {
      if (offset + 4 > trun.end) {
        throw new Error('MP4 track run is truncated.');
      }
      dataOffset = readInt32(bytes, offset);
      offset += 4;
    }

    if (flags & 0x000004) {
      if (offset + 4 > trun.end) {
        throw new Error('MP4 track run is truncated.');
      }
      firstSampleFlags = readUint32(bytes, offset);
      offset += 4;
    }

    var sampleFieldBytes = 0;
    if (flags & 0x000100) {
      sampleFieldBytes += 4;
    }
    if (flags & 0x000200) {
      sampleFieldBytes += 4;
    }
    if (flags & 0x000400) {
      sampleFieldBytes += 4;
    }
    if (flags & 0x000800) {
      sampleFieldBytes += 4;
    }
    if (offset + (sampleCount * sampleFieldBytes) > trun.end) {
      throw new Error('MP4 track run is truncated.');
    }

    for (var index = 0; index < sampleCount; index += 1) {
      var sample = {};
      if (flags & 0x000100) {
        sample.duration = readUint32(bytes, offset);
        offset += 4;
      }

      if (flags & 0x000200) {
        sample.size = readUint32(bytes, offset);
        offset += 4;
      }

      if (flags & 0x000400) {
        sample.flags = readUint32(bytes, offset);
        offset += 4;
      }

      if (flags & 0x000800) {
        sample.compositionTimeOffset = version === 1 ? readInt32(bytes, offset) : readUint32(bytes, offset);
        offset += 4;
      }

      samples.push(sample);
    }

    return {
      dataOffset: dataOffset,
      firstSampleFlags: firstSampleFlags,
      samples: samples,
    };
  }

  function resolveMp4FragmentRunDataCursor(options) {
    if (options.trun && options.trun.dataOffset !== undefined) {
      return options.baseDataOffset + options.trun.dataOffset;
    }

    if (Number.isFinite(options.nextTrafDataCursor)) {
      return options.nextTrafDataCursor;
    }

    if (Number.isFinite(options.fallbackMdatStart)) {
      return options.fallbackMdatStart;
    }

    return options.baseDataOffset;
  }

  function findFollowingMp4Mdat(topLevelBoxes, moof) {
    for (var index = 0; index < topLevelBoxes.length; index += 1) {
      if (topLevelBoxes[index].start < moof.end) {
        continue;
      }

      if (topLevelBoxes[index].type === 'mdat') {
        return topLevelBoxes[index];
      }

      if (topLevelBoxes[index].type === 'moof') {
        return null;
      }
    }

    return null;
  }

  function isMp4SampleKeyframe(flags, fallback) {
    if (flags === undefined || flags === null) {
      return Boolean(fallback);
    }

    var sampleDependsOn = (flags >> 24) & 0x03;
    var nonSyncSample = Boolean(flags & 0x00010000);
    return !nonSyncSample || sampleDependsOn === 2;
  }

  function readUint32(bytes, offset) {
    return (
      (bytes[offset] * 16777216)
      + ((bytes[offset + 1] || 0) << 16)
      + ((bytes[offset + 2] || 0) << 8)
      + (bytes[offset + 3] || 0)
    ) >>> 0;
  }

  function readInt32(bytes, offset) {
    var value = readUint32(bytes, offset);
    return value > 0x7fffffff ? value - 0x100000000 : value;
  }

  function readInt16(bytes, offset) {
    var value = ((bytes[offset] || 0) << 8) + (bytes[offset + 1] || 0);
    return value > 0x7fff ? value - 0x10000 : value;
  }

  function readUint16(bytes, offset) {
    return ((bytes[offset] || 0) << 8) + (bytes[offset + 1] || 0);
  }

  function readUint64(bytes, offset) {
    return readUint32(bytes, offset) * 4294967296 + readUint32(bytes, offset + 4);
  }

  function readMp4SafeUint64(bytes, offset, label) {
    var value = readUint64(bytes, offset);
    if (!Number.isSafeInteger(value)) {
      throw new Error(label + ' exceeds JavaScript safe integer range.');
    }
    return value;
  }

  function readInt64(bytes, offset) {
    return readInt32(bytes, offset) * 4294967296 + readUint32(bytes, offset + 4);
  }

  function readAscii(bytes, offset, length) {
    var value = '';
    for (var index = 0; index < length; index += 1) {
      value += String.fromCharCode(bytes[offset + index] || 0);
    }
    return value;
  }

  function toHexByte(value) {
    return (value || 0).toString(16).padStart(2, '0').toUpperCase();
  }

  function postFrameResult(id, result, bitmap) {
    var message = {
      type: 'frame',
      id: id,
      result: result,
    };

    if (bitmap) {
      message.bitmap = bitmap;
      self.postMessage(message, [bitmap]);
      return;
    }

    self.postMessage(message);
  }

  if (self.__DANBI_PREVIEW_WORKER_TEST_HOOK__) {
    self.__danbiPreviewWorkerInternals = {
      applyMp4EditListToSamples: applyMp4EditListToSamples,
      buildVideoFrameDrawPlan: buildVideoFrameDrawPlan,
      demuxWebmVideoFrameSamples: demuxWebmVideoFrameSamples,
      parseMp4Boxes: parseMp4Boxes,
      parseEbmlElements: parseEbmlElements,
      readVideoContainerFromSource: readVideoContainerFromSource,
      readMp4EditList: readMp4EditList,
      readMp4ChunkOffsets: readMp4ChunkOffsets,
      readMp4CompositionOffsets: readMp4CompositionOffsets,
      readMp4Keyframes: readMp4Keyframes,
      readMp4MediaTimescale: readMp4MediaTimescale,
      readMp4MovieTimescale: readMp4MovieTimescale,
      readMp4SampleDescription: readMp4SampleDescription,
      readMp4SampleDurations: readMp4SampleDurations,
      readMp4SampleSizes: readMp4SampleSizes,
      readMp4SampleToChunk: readMp4SampleToChunk,
      readMp4TrackFragmentDecodeTime: readMp4TrackFragmentDecodeTime,
      readMp4TrackFragmentHeader: readMp4TrackFragmentHeader,
      readMp4TrackRun: readMp4TrackRun,
      readMp4TrackDisplayOrientation: readMp4TrackDisplayOrientation,
      readWebmBlockFrameSlices: readWebmBlockFrameSlices,
      readWebmBlockSamples: readWebmBlockSamples,
      readWebmVideoTrack: readWebmVideoTrack,
      buildMp4SampleOffsets: buildMp4SampleOffsets,
      resolveMp4FragmentRunDataCursor: resolveMp4FragmentRunDataCursor,
      resolveMp4DisplayOrientation: resolveMp4DisplayOrientation,
      selectVideoDecodeSamples: selectVideoDecodeSamples,
    };
  }

  self.onmessage = function (event) {
    var message = event.data || {};
    var id = message.id || 'preview-worker';

    if (message.type === 'detect') {
      detectCapabilities(id);
      return;
    }

    if (message.type === 'benchmark') {
      benchmarkFrameBudget(id, message);
      return;
    }

    if (message.type === 'frame') {
      decodeFrame(id, message);
    }
  };
}());
