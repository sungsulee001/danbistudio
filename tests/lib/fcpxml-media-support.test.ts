import { describe, expect, it } from 'vitest';

import { importFcpxmlProject } from '../../src/lib/editor/fcpxml';

describe('FCPXML media support inference', () => {
  it('preserves shared media MIME metadata for supported imported asset paths', () => {
    const imported = importFcpxmlProject([
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<!DOCTYPE fcpxml>',
      '<fcpxml version="1.10">',
      '  <resources>',
      '    <format id="fmt1" frameDuration="1/30s" width="1920" height="1080"/>',
      '    <asset id="r-avi" name="Camera AVI" src="file:///E:/media/Camera%20AVI.avi" format="fmt1" duration="5s" data-danbi-kind="video"/>',
      '    <asset id="r-bmp" name="Matte BMP" src="/imports/fcpxml/matte.bmp" format="fmt1" duration="5s" data-danbi-kind="image"/>',
      '    <asset id="r-bmp-cache" name="Cached Matte BMP" src="file:///E:/media/original.mov" data-danbi-source="/imports/fcpxml/cached-matte.bmp" format="fmt1" duration="5s" data-danbi-kind="image"/>',
      '    <asset id="r-unknown" name="Vector" src="/imports/fcpxml/vector.svg" format="fmt1" duration="5s" data-danbi-kind="image"/>',
      '  </resources>',
      '  <library><event name="Media"><project name="Media XML"><sequence format="fmt1" duration="5s"><spine>',
      '    <asset-clip ref="r-avi" name="Camera AVI" offset="0s" start="0s" duration="5s"/>',
      '    <asset-clip ref="r-bmp" name="Matte BMP" offset="0s" start="0s" duration="5s"/>',
      '    <asset-clip ref="r-bmp-cache" name="Cached Matte BMP" offset="0s" start="0s" duration="5s"/>',
      '  </spine></sequence></project></event></library>',
      '</fcpxml>',
    ].join('\n'));

    expect(imported.project.assets.find((asset) => asset.id === 'r-avi')?.metadata).toMatchObject({
      mimeType: 'video/x-msvideo',
    });
    expect(imported.project.assets.find((asset) => asset.id === 'r-bmp')?.metadata).toMatchObject({
      mimeType: 'image/bmp',
    });
    expect(imported.project.assets.find((asset) => asset.id === 'r-bmp-cache')?.metadata).toMatchObject({
      mimeType: 'image/bmp',
    });
    expect(imported.project.assets.find((asset) => asset.id === 'r-unknown')?.metadata).not.toHaveProperty('mimeType');
    expect(imported.clips.find((clip) => clip.assetId === 'r-bmp')?.kind).toBe('image');
    expect(imported.clips.find((clip) => clip.assetId === 'r-bmp-cache')?.kind).toBe('image');
  });
});
