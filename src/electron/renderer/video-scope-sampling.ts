import { buildVideoScopeSampleFromRgba, type VideoScopeSample } from '../../lib/editor/video-scopes';

export function readMediaPreviewVideoScopeSample(source: HTMLVideoElement | HTMLImageElement): VideoScopeSample | undefined {
  if (typeof document === 'undefined') {
    return undefined;
  }

  const isVideo = source instanceof HTMLVideoElement;
  const sourceWidth = isVideo ? source.videoWidth : source.naturalWidth;
  const sourceHeight = isVideo ? source.videoHeight : source.naturalHeight;
  if (sourceWidth <= 0 || sourceHeight <= 0 || (isVideo && source.readyState < 2)) {
    return undefined;
  }

  const maxSampleWidth = 96;
  const maxSampleHeight = 54;
  const scale = Math.min(maxSampleWidth / sourceWidth, maxSampleHeight / sourceHeight, 1);
  const sampleWidth = Math.max(1, Math.round(sourceWidth * scale));
  const sampleHeight = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = sampleWidth;
  canvas.height = sampleHeight;

  try {
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) {
      return undefined;
    }

    context.drawImage(source, 0, 0, sampleWidth, sampleHeight);
    const imageData = context.getImageData(0, 0, sampleWidth, sampleHeight);
    return buildVideoScopeSampleFromRgba(imageData.data, sampleWidth, sampleHeight, {
      histogramBins: 32,
      waveformColumns: 32,
      vectorscopeBins: 18,
      sampleStride: 1,
    });
  } catch {
    return undefined;
  }
}
