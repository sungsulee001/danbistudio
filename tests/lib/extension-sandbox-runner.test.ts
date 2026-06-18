import { createSign } from 'node:crypto';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createClip, createDefaultEditorProject } from '../../src/lib/editor/project';
import type { EditorProject } from '../../src/lib/editor/types';
import {
  DEFAULT_PLUGIN_MANIFEST_TRUSTED_SIGNING_KEYS,
  PLUGIN_MANIFEST_RSA_SIGNATURE_VALUE_PREFIX,
  buildPluginManifestSignatureFingerprint,
  buildPluginManifestSignaturePayload,
  verifyPluginManifestSignature,
} from '../../src/lib/editor/plugin-signature';
import { updatePluginExporterWriterTrust } from '../../src/lib/editor/plugin-trust';
import { applyExtensionEffectPlans, readExtensionEffectPlansFromRuntimeResult } from '../../src/lib/editor/extension-effect-plan';
import { assertExtensionEffectPlansMatchManifest, assertExtensionTransitionPlansMatchManifest } from '../../src/lib/editor/extension-parameter-schema';
import { applyExtensionTransitionPlans, readExtensionTransitionPlansFromRuntimeResult } from '../../src/lib/editor/extension-transition-plan';
import {
  EXTENSION_SANDBOX_ANALYZE_EXPORTS_COMMAND,
  EXTENSION_SANDBOX_ANALYZE_TIMELINE_COMMAND,
  EXTENSION_SANDBOX_INSPECT_MANIFEST_COMMAND,
  EXTENSION_SANDBOX_PLAN_EFFECTS_COMMAND,
  EXTENSION_SANDBOX_PLAN_EXPORTS_COMMAND,
  EXTENSION_SANDBOX_PLAN_TRANSITIONS_COMMAND,
  EXTENSION_SANDBOX_RUN_CUSTOM_COMMAND,
  EXTENSION_SANDBOX_WRITE_EXPORTS_COMMAND,
  buildExtensionHostSnapshot,
  buildExtensionSandboxCommandRequest,
  buildExtensionSandboxHandshakeRequest,
  handleExtensionSandboxCommandRequest,
  handleExtensionSandboxHandshakeRequest,
} from '../../src/electron/shared/extension-api';
import { validateProjectJson } from '../../src/electron/shared/project-schema';
import {
  runExtensionSandboxProcessCommand,
  runExtensionSandboxProcessHandshake,
} from '../../src/electron/main/extension-sandbox-runner';
import { createEditorIpcHandlers } from '../../src/electron/main/ipc-handlers';
import { createReadonlyProjectRepository } from '../../src/electron/main/project-store-adapter';
import { EDITOR_IPC_CHANNELS } from '../../src/electron/shared/ipc-contract';

const TEST_PLUGIN_SIGNING_KEY_ID = 'danbi-local-plugin-dev-rsa-2026';
const TEST_PLUGIN_SIGNING_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDJWm1bR+xP6tQg
7ZWmezN62X3VyGVk29j6pkF4YjjO91WwQ5IuFqZhHQn6HA9XoaI4ruqLB5lGTkE5
iNrZpX/16I9G2xIca8rXFbdAhJoEcwps9gIzGIsZSn1wX+u7X89sq8n+GF/6A7U1
vZwaoB5TRHifrY32TeuLAr0TkYexj0Z1wckpjuIOMrIRr6uYWAdalYd8U/z6/bAw
fO9I/oJTUsBuYAWq6WgtJ4v5tcyW5arhPL+L733Na4Ti70zFnKRw8G+bJBxYVEB9
fxeXaBWA/ZnuTeogTdXDhCnmyGDkhl8s9UcQVYPyKCCs/xRuIa0ujL6AdC+aGH7b
H9guEOJXAgMBAAECggEARTksbXxdluARy7xCfbjPawXIyC2cBj+66fksevmxtB2+
PNoOMIAi9TIpku4ArEzqW3hvNBsJq+0NaX1OWBMY2e75CxAXuuOoGafil3C/DpaK
WAl/mhdvAuPkGjUv8vwucJri19ODc43Ax9gHCfRQWKoqmiLtsmb5epIXdNnMf9M4
9quAiNfUnCfmA+vAtn1fXCQZzGWuYQTqnaSbCKS913P/u2O+w7CeyYWZOhGY+YsU
inc/59e5Wj9q/QiEv2wU8nMRXjxFSmZ+FX+kXIsIFUjl9ENSKHWiTzjILGVlf0P8
PQ/GFTB5WAkp90htS9dGda6ft3X/gE+itS2xvbrwcQKBgQDj+Ih23UO9L2xMO/Ku
avwg/BkKSRhQGrGe5rNySbgs6FwNkU2qsW70l8Bg+pOb0LcTeefEaMG6syO4IK4D
WRUoZsoUl0nfC4ix4ujTp4woEfFO8Pd+wvH3A0gKj0k9ZAhpcIBJr+6hwxrvwzuG
ke85PcYktZ8lKt0hYBi/9T4irwKBgQDiHBhedoLTG8ioK0ZiSTTiUX6AN3/z7UrD
2VhQV1hZNeeETBMAUpNizNWcU4K75tj0QpPvLvRBlgz5tq7AgtLbThVzZQxXJw15
fj3Y0BA7SJCRa+wH8tdhB9lqSMmeXUlkm3MrkGOgvlhIh6iqLtDiB1QiWkspbUar
lf8v/4FE2QKBgGe2Lqcc3G9Z/sPj1fEBnPiIl/+050myCzKGNAb/gLl1cEN/4jyQ
gjDmRNAZz0NovZEvuYACRHhifRKMU34Ubeq2cKLTfPjq72I2H8QCimHEX+qQ95eE
qr28kW60ZxZ1xtnpI4PidQbEkyGWySLci1+YOeeDdQZcrMM9S6UwtfbjAoGBALka
DO0QEctnHF5nhughTBTWaDvos2vqX2FzhXPH/YCSu2Q3rvp9n0CrtVeTmhvfQM69
zkNpafZjM14eKnNY5es4wiDEoVSbmNFUAqeCtTcDEa6q7gAX0jAR7++thLiLX/Dn
vWH1g0ntaXJ+9BnV15SiMUMqLgvM9KS1V8JgZeAJAoGBAI4kufkzMDzXkkw3/Wz4
JDJY4N+tlxsT6/6Zdlm41PCJxlZVYVeCHo5W3SFVuQ9NnaDq6WLwAqK1D/4GFY9l
Me5j0PVmhANg+lgEmNWtPE0FylHcrnj0WEv9oryJ5BKcW1tANhu2DfwbpaKiVE1Y
JyCFszl0hSZgTHO/Su4CjlKo
-----END PRIVATE KEY-----`;

describe('extension sandbox runner', () => {
  it('accepts external manifests only as a process-isolated manifest-only handshake', async () => {
    const project = withExternalPlugin(createDefaultEditorProject());
    const request = buildExtensionSandboxHandshakeRequest(project, 'plugin-external-look-pack');
    const localResponse = handleExtensionSandboxHandshakeRequest(request);
    const processResponse = await runExtensionSandboxProcessHandshake({
      request,
      timeoutMs: 15000,
    });

    expect(localResponse).toMatchObject({
      pluginId: 'plugin-external-look-pack',
      accepted: true,
      status: 'manifest-only',
      runtime: 'external-process-handshake',
      codeExecution: 'reviewed-command-api',
      permissions: ['project'],
      declaredApis: ['effect', 'analyzer'],
      executableApis: ['command'],
    });
    expect(processResponse).toMatchObject(localResponse);
    expect(processResponse.warnings[0]).toContain('reviewed sandbox commands are executable');
  });

  it('executes a reviewed external command inside the sandbox process without importing plugin files', async () => {
    const project = withExternalPlugin(createDefaultEditorProject());
    const request = buildExtensionSandboxCommandRequest(
      project,
      'plugin-external-look-pack',
      EXTENSION_SANDBOX_INSPECT_MANIFEST_COMMAND,
      { source: 'vitest', ignoredNestedPayload: { unsafe: true } },
    );
    const localResponse = handleExtensionSandboxCommandRequest(request);
    const processResponse = await runExtensionSandboxProcessCommand({
      request,
      timeoutMs: 15000,
    });

    expect(localResponse).toMatchObject({
      pluginId: 'plugin-external-look-pack',
      command: EXTENSION_SANDBOX_INSPECT_MANIFEST_COMMAND,
      handled: true,
      status: 'executed',
      runtime: 'external-process-command',
      codeExecution: 'reviewed-command-api',
      permissions: ['project'],
      declaredApis: ['effect', 'analyzer'],
      executableApis: ['command'],
      result: {
        pluginId: 'plugin-external-look-pack',
        name: 'External Look Pack',
        project: {
          projectId: project.id,
          clipCount: project.tracks.reduce((total, track) => total + track.clips.length, 0),
          exportProfileCount: project.exportProfiles.length,
        },
        payloadKeys: ['source', 'ignoredNestedPayload'],
      },
    });
    expect(processResponse).toMatchObject(localResponse);
    expect(processResponse.warnings[0]).toContain('without importing the external plugin entry file');
  });

  it('runs the reviewed external timeline analyzer on a sanitized snapshot in the sandbox process', async () => {
    const project = withTimelineGapScenario(withExternalPlugin(createDefaultEditorProject()));
    const request = buildExtensionSandboxCommandRequest(
      project,
      'plugin-external-look-pack',
      EXTENSION_SANDBOX_ANALYZE_TIMELINE_COMMAND,
      { minGapDurationSeconds: 2 },
    );
    const localResponse = handleExtensionSandboxCommandRequest(request);
    const processResponse = await runExtensionSandboxProcessCommand({
      request,
      timeoutMs: 15000,
    });

    expect(localResponse).toMatchObject({
      pluginId: 'plugin-external-look-pack',
      command: EXTENSION_SANDBOX_ANALYZE_TIMELINE_COMMAND,
      handled: true,
      status: 'executed',
      runtime: 'external-process-command',
      codeExecution: 'reviewed-command-api',
      result: {
        command: EXTENSION_SANDBOX_ANALYZE_TIMELINE_COMMAND,
        minGapDurationSeconds: 2,
        project: {
          projectId: project.id,
          clipCount: project.tracks.reduce((total, track) => total + track.clips.length, 0),
        },
        totals: {
          visualGapCount: expect.any(Number),
          lockedClipCount: expect.any(Number),
          mutedClipCount: expect.any(Number),
        },
        trackReports: expect.arrayContaining([
          expect.objectContaining({
            trackId: 'track-v1',
            gapCount: 2,
            longestGapDuration: 15,
            lockedClipCount: 1,
            mutedClipCount: 1,
          }),
        ]),
        findings: expect.arrayContaining([
          expect.objectContaining({
            code: 'visual-gaps',
          }),
          expect.objectContaining({
            code: 'locked-items',
          }),
        ]),
      },
    });
    expect(processResponse).toMatchObject(localResponse);
    expect(processResponse.warnings[0]).toContain('sanitized timeline snapshot');
  });

  it('honors custom reviewed timeline analyzer payload scopes in the sandbox process', async () => {
    const project = withTimelineGapScenario(withExternalPlugin(createDefaultEditorProject()));
    const request = buildExtensionSandboxCommandRequest(
      project,
      'plugin-external-look-pack',
      EXTENSION_SANDBOX_ANALYZE_TIMELINE_COMMAND,
      {
        scope: 'selected',
        trackIds: ['track-v1'],
        selectedClipIds: ['clip-interview-1'],
        includeMuted: false,
        minGapDurationSeconds: 2,
        minFindingSeverity: 'warning',
      },
    );
    const localResponse = handleExtensionSandboxCommandRequest(request);
    const processResponse = await runExtensionSandboxProcessCommand({
      request,
      timeoutMs: 15000,
    });

    expect(processResponse).toMatchObject(localResponse);
    expect(processResponse.result).toMatchObject({
      command: EXTENSION_SANDBOX_ANALYZE_TIMELINE_COMMAND,
      request: {
        scope: 'selected',
        trackIds: ['track-v1'],
        selectedClipIds: ['clip-interview-1'],
        includeMuted: false,
        includeLocked: true,
        minGapDurationSeconds: 2,
        minFindingSeverity: 'warning',
      },
      coverage: {
        matchedTrackCount: 1,
        analyzedTrackCount: 1,
        analyzedClipCount: 1,
      },
      totals: {
        trackCount: 1,
        clipCount: 1,
        mutedClipCount: 0,
        lockedClipCount: 1,
      },
      trackReports: [
        expect.objectContaining({
          trackId: 'track-v1',
          clipCount: 1,
          mutedClipCount: 0,
          lockedClipCount: 1,
        }),
      ],
      findings: [],
    });
  });

  it('runs manifest-declared reviewed custom timeline commands through the sandbox process and IPC path', async () => {
    const project = withTimelineGapScenario(withExternalPlugin(createDefaultEditorProject(), {
      id: 'plugin-external-timeline-auditor',
      name: 'External Timeline Auditor',
      entry: 'plugins/external-timeline-auditor/index.js',
      permissions: ['project'],
      contributes: ['analyzer'],
      customCommands: [
        {
          id: 'timeline-gap-audit',
          label: 'Timeline Gap Audit',
          description: 'Summarizes timeline gaps from a reviewed manifest declaration.',
          contribution: 'analyzer',
          kind: 'timeline-report',
          parameters: [
            { key: 'minGapDurationSeconds', type: 'number', min: 0, max: 30, defaultValue: 1 },
            { key: 'includeMuted', type: 'boolean', defaultValue: true },
          ],
        },
      ],
    }));
    const payload = {
      commandId: 'timeline-gap-audit',
      parameters: {
        minGapDurationSeconds: 2,
        includeMuted: false,
        ignored: 'drop-me',
      },
    };
    const request = buildExtensionSandboxCommandRequest(
      project,
      'plugin-external-timeline-auditor',
      EXTENSION_SANDBOX_RUN_CUSTOM_COMMAND,
      payload,
    );
    const localResponse = handleExtensionSandboxCommandRequest(request);
    const processResponse = await runExtensionSandboxProcessCommand({
      request,
      timeoutMs: 15000,
    });
    const handlers = createEditorIpcHandlers({
      projects: createReadonlyProjectRepository(project),
    });
    const ipcResponse = await handlers[EDITOR_IPC_CHANNELS.extensionInvoke]({
      project,
      extensionId: 'plugin-external-timeline-auditor',
      command: EXTENSION_SANDBOX_RUN_CUSTOM_COMMAND,
      payload,
    });

    expect(localResponse).toMatchObject({
      pluginId: 'plugin-external-timeline-auditor',
      command: EXTENSION_SANDBOX_RUN_CUSTOM_COMMAND,
      handled: true,
      status: 'executed',
      runtime: 'external-process-command',
      codeExecution: 'reviewed-command-api',
      permissions: ['project'],
      declaredApis: ['analyzer'],
      result: {
        command: EXTENSION_SANDBOX_RUN_CUSTOM_COMMAND,
        customCommandId: 'timeline-gap-audit',
        label: 'Timeline Gap Audit',
        contribution: 'analyzer',
        kind: 'timeline-report',
        parameters: {
          minGapDurationSeconds: 2,
          includeMuted: false,
        },
        ignoredParameterKeys: ['ignored'],
        timelineReport: {
          request: {
            includeMuted: false,
            includeLocked: true,
            minGapDurationSeconds: 2,
          },
          tracks: expect.arrayContaining([
            expect.objectContaining({
              trackId: 'track-v1',
              clipCount: 1,
              gapCount: 2,
              longestGapDuration: 15,
            }),
          ]),
          findings: expect.arrayContaining([
            expect.objectContaining({
              code: 'timeline-gaps',
            }),
          ]),
        },
      },
    });
    expect(processResponse).toMatchObject(localResponse);
    expect(processResponse.warnings[0]).toContain('manifest-declared metadata');
    expect(ipcResponse).toMatchObject({
      extensionId: 'plugin-external-timeline-auditor',
      command: EXTENSION_SANDBOX_RUN_CUSTOM_COMMAND,
      handled: true,
      result: {
        customCommandId: 'timeline-gap-audit',
        kind: 'timeline-report',
        ignoredParameterKeys: ['ignored'],
        timelineReport: {
          request: {
            includeMuted: false,
            minGapDurationSeconds: 2,
          },
        },
      },
    });
  });

  it('treats automation-only custom commands as a reviewed command API contract', async () => {
    const project = withExternalPlugin(createDefaultEditorProject(), {
      id: 'plugin-external-automation-reporter',
      name: 'External Automation Reporter',
      entry: 'plugins/external-automation-reporter/index.js',
      permissions: ['project'],
      contributes: ['automation'],
      customCommands: [
        {
          id: 'project-summary',
          label: 'Project Summary',
          contribution: 'automation',
          kind: 'project-summary',
          parameters: [
            { key: 'includeDensity', type: 'boolean', defaultValue: true },
          ],
        },
      ],
    });
    const host = buildExtensionHostSnapshot(project);
    const sandbox = host.sandboxes.find((policy) => policy.pluginId === 'plugin-external-automation-reporter');
    const handshake = handleExtensionSandboxHandshakeRequest(
      buildExtensionSandboxHandshakeRequest(project, 'plugin-external-automation-reporter'),
    );
    const payload = {
      commandId: 'project-summary',
      parameters: {
        includeDensity: true,
      },
    };
    const localResponse = handleExtensionSandboxCommandRequest(buildExtensionSandboxCommandRequest(
      project,
      'plugin-external-automation-reporter',
      EXTENSION_SANDBOX_RUN_CUSTOM_COMMAND,
      payload,
    ));
    const handlers = createEditorIpcHandlers({
      projects: createReadonlyProjectRepository(project),
    });
    const ipcResponse = await handlers[EDITOR_IPC_CHANNELS.extensionInvoke]({
      project,
      extensionId: 'plugin-external-automation-reporter',
      command: EXTENSION_SANDBOX_RUN_CUSTOM_COMMAND,
      payload,
    });

    expect(sandbox).toMatchObject({
      status: 'manifest-only',
      runtime: 'external-process-command',
      executableApis: ['command'],
    });
    expect(handshake).toMatchObject({
      pluginId: 'plugin-external-automation-reporter',
      accepted: true,
      codeExecution: 'reviewed-command-api',
      executableApis: ['command'],
    });
    expect(localResponse).toMatchObject({
      pluginId: 'plugin-external-automation-reporter',
      command: EXTENSION_SANDBOX_RUN_CUSTOM_COMMAND,
      handled: true,
      status: 'executed',
      result: {
        customCommandId: 'project-summary',
        label: 'Project Summary',
        contribution: 'automation',
        kind: 'project-summary',
        parameters: {
          includeDensity: true,
        },
        projectSummary: {
          mediaAssetCount: project.assets.length,
          timelineTrackCount: project.tracks.length,
        },
      },
    });
    expect(ipcResponse).toMatchObject({
      extensionId: 'plugin-external-automation-reporter',
      command: EXTENSION_SANDBOX_RUN_CUSTOM_COMMAND,
      handled: true,
      result: {
        customCommandId: 'project-summary',
        contribution: 'automation',
        kind: 'project-summary',
      },
    });
  });

  it('runs the reviewed external exporter analyzer on sanitized export profile data', async () => {
    const project = withExporterProfileScenario(withExternalPlugin(createDefaultEditorProject(), {
      id: 'plugin-external-export-auditor',
      name: 'External Export Auditor',
      entry: 'plugins/external-export-auditor/index.js',
      permissions: ['project'],
      contributes: ['exporter'],
    }));
    const request = buildExtensionSandboxCommandRequest(
      project,
      'plugin-external-export-auditor',
      EXTENSION_SANDBOX_ANALYZE_EXPORTS_COMMAND,
    );
    const localResponse = handleExtensionSandboxCommandRequest(request);
    const processResponse = await runExtensionSandboxProcessCommand({
      request,
      timeoutMs: 15000,
    });

    expect(localResponse).toMatchObject({
      pluginId: 'plugin-external-export-auditor',
      command: EXTENSION_SANDBOX_ANALYZE_EXPORTS_COMMAND,
      handled: true,
      status: 'executed',
      runtime: 'external-process-command',
      codeExecution: 'reviewed-command-api',
      permissions: ['project'],
      declaredApis: ['exporter'],
      result: {
        command: EXTENSION_SANDBOX_ANALYZE_EXPORTS_COMMAND,
        project: {
          projectId: project.id,
          exportProfileCount: project.exportProfiles.length,
        },
        totals: {
          profileCount: project.exportProfiles.length,
          incompatibleCodecContainerCount: 1,
          incompatibleDimensionCount: 1,
          incompatibleProfileCount: 2,
        },
        profileReports: expect.arrayContaining([
          expect.objectContaining({
            profileId: 'profile-webm-h264-invalid',
            container: 'webm',
            codec: 'h264',
            compatibleCodecContainer: false,
          }),
          expect.objectContaining({
            profileId: 'profile-odd-dimensions',
            compatibleDimensions: false,
          }),
        ]),
        findings: expect.arrayContaining([
          expect.objectContaining({
            code: 'incompatible-codec-container',
          }),
          expect.objectContaining({
            code: 'incompatible-dimensions',
          }),
        ]),
      },
    });
    expect(processResponse).toMatchObject(localResponse);
    expect(processResponse.warnings[0]).toContain('sanitized export profile data');
  });

  it('honors custom reviewed exporter analyzer payload filters in the sandbox process', async () => {
    const project = withExporterProfileScenario(withExternalPlugin(createDefaultEditorProject(), {
      id: 'plugin-external-export-auditor',
      name: 'External Export Auditor',
      entry: 'plugins/external-export-auditor/index.js',
      permissions: ['project'],
      contributes: ['exporter'],
    }));
    const request = buildExtensionSandboxCommandRequest(
      project,
      'plugin-external-export-auditor',
      EXTENSION_SANDBOX_ANALYZE_EXPORTS_COMMAND,
      {
        profileIds: ['profile-webm-h264-invalid', 'profile-odd-dimensions'],
        purpose: 'proxy',
        includeCompatibleProfiles: false,
        throughputWarningMegapixelsPerSecond: 1,
        minFindingSeverity: 'error',
      },
    );
    const localResponse = handleExtensionSandboxCommandRequest(request);
    const processResponse = await runExtensionSandboxProcessCommand({
      request,
      timeoutMs: 15000,
    });

    expect(processResponse).toMatchObject(localResponse);
    expect(processResponse.result).toMatchObject({
      command: EXTENSION_SANDBOX_ANALYZE_EXPORTS_COMMAND,
      request: {
        profileIds: ['profile-webm-h264-invalid', 'profile-odd-dimensions'],
        container: null,
        purpose: 'proxy',
        includeCompatibleProfiles: false,
        throughputWarningMegapixelsPerSecond: 1,
        minFindingSeverity: 'error',
      },
      coverage: {
        matchedProfileCount: 1,
        reportedProfileCount: 1,
      },
      totals: {
        profileCount: 1,
        incompatibleCodecContainerCount: 0,
        incompatibleDimensionCount: 1,
        incompatibleProfileCount: 1,
      },
      profileReports: [
        expect.objectContaining({
          profileId: 'profile-odd-dimensions',
          purpose: 'proxy',
          compatibleDimensions: false,
          findingCount: 1,
          findings: [
            expect.objectContaining({
              severity: 'error',
              code: 'incompatible-dimensions',
            }),
          ],
        }),
      ],
      findings: [
        expect.objectContaining({
          severity: 'error',
          code: 'incompatible-dimensions',
        }),
      ],
    });
  });

  it('plans reviewed external exporter output manifests without granting file access', async () => {
    const project = withExporterProfileScenario(withExternalPlugin(createDefaultEditorProject(), {
      id: 'plugin-external-export-auditor',
      name: 'External Export Auditor',
      entry: 'plugins/external-export-auditor/index.js',
      permissions: ['project'],
      contributes: ['exporter'],
    }));
    const request = buildExtensionSandboxCommandRequest(
      project,
      'plugin-external-export-auditor',
      EXTENSION_SANDBOX_PLAN_EXPORTS_COMMAND,
      {
        profileIds: ['profile-youtube-4k', 'profile-webm-h264-invalid'],
        outputDirectory: '../escape',
        filenamePrefix: 'Final Review! 2026',
      },
    );
    const localResponse = handleExtensionSandboxCommandRequest(request);
    const processResponse = await runExtensionSandboxProcessCommand({
      request,
      timeoutMs: 15000,
    });
    const handlers = createEditorIpcHandlers({
      projects: createReadonlyProjectRepository(project),
    });
    const ipcResponse = await handlers[EDITOR_IPC_CHANNELS.extensionInvoke]({
      project,
      extensionId: 'plugin-external-export-auditor',
      command: EXTENSION_SANDBOX_PLAN_EXPORTS_COMMAND,
      payload: {
        profileIds: ['profile-webm-h264-invalid'],
        includeIncompatibleProfiles: true,
        outputDirectory: 'exports/custom-folder',
        filenamePrefix: 'Audit Export',
        dryRun: false,
      },
    });

    expect(localResponse).toMatchObject({
      pluginId: 'plugin-external-export-auditor',
      command: EXTENSION_SANDBOX_PLAN_EXPORTS_COMMAND,
      handled: true,
      status: 'executed',
      runtime: 'external-process-command',
      codeExecution: 'reviewed-command-api',
      permissions: ['project'],
      declaredApis: ['exporter'],
      result: {
        command: EXTENSION_SANDBOX_PLAN_EXPORTS_COMMAND,
        exporterManifestVersion: 1,
        request: {
          profileIds: ['profile-youtube-4k', 'profile-webm-h264-invalid'],
          includeIncompatibleProfiles: false,
          outputDirectory: 'exports/external/plugin-external-export-auditor',
          filenamePrefix: 'final-review-2026',
          dryRun: true,
        },
        coverage: {
          matchedProfileCount: 2,
          outputManifestCount: 1,
          skippedProfileCount: 1,
        },
        outputManifests: [
          expect.objectContaining({
            manifestVersion: 1,
            pluginId: 'plugin-external-export-auditor',
            profileId: 'profile-youtube-4k',
            outputDirectory: 'exports/external/plugin-external-export-auditor',
            outputFilename: 'final-review-2026-profile-youtube-4k.mp4',
            outputPath: 'exports/external/plugin-external-export-auditor/final-review-2026-profile-youtube-4k.mp4',
            dryRun: true,
            status: 'ready',
            issues: [],
          }),
        ],
        findings: [
          expect.objectContaining({
            code: 'skipped-incompatible-export-profiles',
          }),
        ],
      },
    });
    expect(processResponse).toMatchObject(localResponse);
    expect(processResponse.warnings[0]).toContain('output manifests');
    expect(ipcResponse).toMatchObject({
      extensionId: 'plugin-external-export-auditor',
      command: EXTENSION_SANDBOX_PLAN_EXPORTS_COMMAND,
      handled: true,
      result: {
        request: {
          outputDirectory: 'exports/custom-folder',
          filenamePrefix: 'audit-export',
          dryRun: false,
        },
        outputManifests: [
          expect.objectContaining({
            profileId: 'profile-webm-h264-invalid',
            outputPath: 'exports/custom-folder/audit-export-profile-webm-h264-invalid.webm',
            dryRun: false,
            status: 'blocked',
            issues: ['incompatible-codec-container'],
          }),
        ],
      },
    });

    const unsafeProfileProject = {
      ...project,
      exportProfiles: [
        ...project.exportProfiles,
        {
          ...project.exportProfiles[0],
          id: '../CON...',
          label: 'Unsafe Profile Id',
          container: 'mp4' as const,
          codec: 'h264' as const,
        },
      ],
    };
    const unsafeProfileResponse = handleExtensionSandboxCommandRequest(buildExtensionSandboxCommandRequest(
      unsafeProfileProject,
      'plugin-external-export-auditor',
      EXTENSION_SANDBOX_PLAN_EXPORTS_COMMAND,
      {
        profileIds: ['../CON...'],
        outputDirectory: 'exports/custom-folder',
        filenamePrefix: '...',
      },
    ));

    expect(unsafeProfileResponse).toMatchObject({
      result: {
        request: {
          filenamePrefix: 'danbi-export',
        },
        outputManifests: [
          expect.objectContaining({
            profileId: '../CON...',
            outputFilename: 'danbi-export-con.mp4',
            outputPath: 'exports/custom-folder/danbi-export-con.mp4',
          }),
        ],
      },
    });
  });

  it('materializes reviewed external exporter handoff manifests only through Electron main', async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), 'danbi-external-exporter-'));
    try {
      const project = withExporterProfileScenario(withExternalPlugin(createDefaultEditorProject(), {
        id: 'plugin-external-export-auditor',
        name: 'External Export Auditor',
        entry: 'plugins/external-export-auditor/index.js',
        permissions: ['project'],
        contributes: ['exporter'],
      }));
      const sandboxRequest = buildExtensionSandboxCommandRequest(
        project,
        'plugin-external-export-auditor',
        EXTENSION_SANDBOX_WRITE_EXPORTS_COMMAND,
        {
          profileIds: ['profile-youtube-4k'],
          outputDirectory: 'exports/reviewed-handoff',
          filenamePrefix: 'Final Writer',
        },
      );
      const sandboxResponse = await runExtensionSandboxProcessCommand({
        request: sandboxRequest,
        timeoutMs: 15000,
      });
      const handlers = createEditorIpcHandlers({
        projects: createReadonlyProjectRepository(project),
        externalExporterOutputRoot: outputRoot,
      });
      const ipcResponse = await handlers[EDITOR_IPC_CHANNELS.extensionInvoke]({
        project,
        extensionId: 'plugin-external-export-auditor',
        command: EXTENSION_SANDBOX_WRITE_EXPORTS_COMMAND,
        payload: {
          profileIds: ['profile-youtube-4k', 'profile-webm-h264-invalid'],
          includeIncompatibleProfiles: true,
          outputDirectory: 'exports/reviewed-handoff',
          filenamePrefix: 'Final Writer',
          dryRun: false,
        },
      });

      expect(sandboxResponse).toMatchObject({
        pluginId: 'plugin-external-export-auditor',
        command: EXTENSION_SANDBOX_WRITE_EXPORTS_COMMAND,
        handled: true,
        result: {
          command: EXTENSION_SANDBOX_WRITE_EXPORTS_COMMAND,
          materialization: 'electron-main-handoff-writer',
          request: {
            outputDirectory: 'exports/reviewed-handoff',
            filenamePrefix: 'final-writer',
            dryRun: false,
          },
          outputManifests: [
            expect.objectContaining({
              profileId: 'profile-youtube-4k',
              outputPath: 'exports/reviewed-handoff/final-writer-profile-youtube-4k.mp4',
              dryRun: false,
              status: 'ready',
            }),
          ],
        },
      });
      expect(sandboxResponse.warnings[0]).toContain('handoff manifests');

      expect(ipcResponse).toMatchObject({
        extensionId: 'plugin-external-export-auditor',
        command: EXTENSION_SANDBOX_WRITE_EXPORTS_COMMAND,
        handled: true,
        result: {
          writeSummary: {
            status: 'completed',
            batchManifestRelativePath: 'exports/reviewed-handoff/danbi-external-export-handoff.json',
            writtenCount: 1,
            skippedCount: 1,
            blockedCount: 0,
          },
          writtenManifests: expect.arrayContaining([
            expect.objectContaining({
              profileId: 'profile-youtube-4k',
              status: 'written',
              outputPath: 'exports/reviewed-handoff/final-writer-profile-youtube-4k.mp4',
              manifestRelativePath: 'exports/reviewed-handoff/final-writer-profile-youtube-4k.mp4.danbi-export.json',
            }),
            expect.objectContaining({
              profileId: 'profile-webm-h264-invalid',
              status: 'skipped',
            }),
          ]),
        },
      });

      const result = ipcResponse.result as {
        writeSummary: { batchManifestPath: string };
        writtenManifests: Array<{
          profileId: string;
          status: string;
          manifestPath?: string;
        }>;
      };
      const writtenManifest = result.writtenManifests.find((entry) => (
        entry.profileId === 'profile-youtube-4k' && entry.status === 'written'
      ));
      expect(writtenManifest?.manifestPath).toBeTruthy();
      const manifestDocument = JSON.parse(await readFile(writtenManifest?.manifestPath ?? '', 'utf8')) as Record<string, unknown>;
      expect(manifestDocument).toMatchObject({
        kind: 'danbi.external-exporter.output-manifest',
        command: EXTENSION_SANDBOX_WRITE_EXPORTS_COMMAND,
        pluginId: 'plugin-external-export-auditor',
        profileId: 'profile-youtube-4k',
        outputPath: 'exports/reviewed-handoff/final-writer-profile-youtube-4k.mp4',
        manifestPath: 'exports/reviewed-handoff/final-writer-profile-youtube-4k.mp4.danbi-export.json',
        safeguards: {
          codeExecution: 'disabled',
          writeBoundary: 'electron-main-reviewed-handoff',
          filesystemScope: 'exports-relative',
        },
      });
      expect(manifestDocument).not.toHaveProperty('outputAbsolutePath');

      const batchDocument = JSON.parse(await readFile(result.writeSummary.batchManifestPath, 'utf8')) as Record<string, unknown>;
      const handoffDirectoryFiles = await readdir(join(outputRoot, 'exports', 'reviewed-handoff'));
      expect(batchDocument).toMatchObject({
        kind: 'danbi.external-exporter.handoff',
        command: EXTENSION_SANDBOX_WRITE_EXPORTS_COMMAND,
        pluginId: 'plugin-external-export-auditor',
        entries: expect.arrayContaining([
          expect.objectContaining({
            profileId: 'profile-youtube-4k',
            status: 'written',
            manifestPath: 'exports/reviewed-handoff/final-writer-profile-youtube-4k.mp4.danbi-export.json',
          }),
          expect.objectContaining({
            profileId: 'profile-webm-h264-invalid',
            status: 'skipped',
          }),
        ]),
      });
      expect(handoffDirectoryFiles.some((filename) => filename.endsWith('.tmp'))).toBe(false);
    } finally {
      await rm(outputRoot, { recursive: true, force: true });
    }
  });

  it('runs the reviewed external effect planner on a sanitized timeline snapshot', async () => {
    const project = withEffectPlanScenario(withExternalPlugin(createDefaultEditorProject(), {
      id: 'plugin-external-look-planner',
      name: 'External Look Planner',
      entry: 'plugins/external-look-planner/index.js',
      permissions: ['project'],
      contributes: ['effect'],
      parameterSchemas: {
        effects: [
          {
            presetId: 'soft-vignette',
            parameters: [
              { key: 'visualEffect', type: 'enum', values: ['vignette-focus'], required: true },
              { key: 'vignetteStrength', type: 'number', min: 0, max: 1, required: true },
            ],
          },
        ],
      },
    }));
    const manifest = project.plugins.find((plugin) => plugin.id === 'plugin-external-look-planner');
    const request = buildExtensionSandboxCommandRequest(
      project,
      'plugin-external-look-planner',
      EXTENSION_SANDBOX_PLAN_EFFECTS_COMMAND,
      {
        presetId: 'soft-vignette',
        selectedClipIds: ['clip-interview-1', 'clip-interview-2'],
        parameters: { vignetteStrength: 0.55 },
      },
    );
    const localResponse = handleExtensionSandboxCommandRequest(request);
    const processResponse = await runExtensionSandboxProcessCommand({
      request,
      timeoutMs: 15000,
    });

    expect(localResponse).toMatchObject({
      pluginId: 'plugin-external-look-planner',
      command: EXTENSION_SANDBOX_PLAN_EFFECTS_COMMAND,
      handled: true,
      status: 'executed',
      runtime: 'external-process-command',
      codeExecution: 'reviewed-command-api',
      permissions: ['project'],
      declaredApis: ['effect'],
        result: {
          command: EXTENSION_SANDBOX_PLAN_EFFECTS_COMMAND,
          presetId: 'soft-vignette',
          parameterOverrides: {
            vignetteStrength: 0.55,
          },
          plannedEffectCount: 1,
        skippedClipCount: 1,
        plans: [
          expect.objectContaining({
            clipId: 'clip-interview-1',
            operation: 'upsert-effect',
            effect: expect.objectContaining({
              id: 'effect-external-soft-vignette-clip-interview-1',
              type: 'filter',
              label: 'External Soft Vignette',
              parameters: expect.objectContaining({
                externalPresetId: 'soft-vignette',
                visualEffect: 'vignette-focus',
                vignetteStrength: 0.55,
              }),
            }),
          }),
        ],
        skipped: [
          expect.objectContaining({
            clipId: 'clip-interview-2',
            reason: 'Track or clip is locked.',
          }),
        ],
      },
    });
    expect(processResponse).toMatchObject(localResponse);
    expect(processResponse.warnings[0]).toContain('validated effect plan');

    const effectPlans = readExtensionEffectPlansFromRuntimeResult(processResponse.result);
    expect(manifest).toBeDefined();
    assertExtensionEffectPlansMatchManifest(manifest!, effectPlans);
    expect(() => assertExtensionEffectPlansMatchManifest({
      ...manifest!,
      parameterSchemas: {
        effects: [
          {
            presetId: 'soft-vignette',
            parameters: [
              { key: 'vignetteStrength', type: 'number', min: 0, max: 0.5, required: true },
            ],
          },
        ],
      },
    }, effectPlans)).toThrow(/vignetteStrength/);
    const applied = applyExtensionEffectPlans(project, effectPlans);
    const appliedClip = applied.project.tracks[0].clips.find((clip) => clip.id === 'clip-interview-1');
    const deduped = applyExtensionEffectPlans(withDuplicateExternalEffectScenario(project), effectPlans);
    const dedupedClip = deduped.project.tracks[0].clips.find((clip) => clip.id === 'clip-interview-1');
    const reapplied = applyExtensionEffectPlans(applied.project, effectPlans);

    expect(applied).toMatchObject({
      requestedPlanCount: 1,
      appliedPlanCount: 1,
      updatedClipIds: ['clip-interview-1'],
      skipped: [],
    });
    expect(appliedClip?.effects.filter((effect) => effect.parameters.externalPresetId === 'soft-vignette')).toHaveLength(1);
    expect(appliedClip?.effects.find((effect) => effect.parameters.externalPresetId === 'soft-vignette')).toMatchObject({
      id: 'effect-external-soft-vignette-clip-interview-1',
      type: 'filter',
      label: 'External Soft Vignette',
      enabled: true,
    });
    expect(deduped).toMatchObject({
      requestedPlanCount: 1,
      appliedPlanCount: 1,
      updatedClipIds: ['clip-interview-1'],
      skipped: [],
    });
    expect(dedupedClip?.effects.filter((effect) => effect.parameters.externalPresetId === 'soft-vignette')).toHaveLength(1);
    expect(dedupedClip?.effects.find((effect) => effect.parameters.externalPresetId === 'soft-vignette')).toMatchObject({
      id: 'effect-external-soft-vignette-clip-interview-1',
      parameters: expect.objectContaining({
        visualEffect: 'vignette-focus',
      }),
    });
    expect(reapplied).toMatchObject({
      appliedPlanCount: 0,
      updatedClipIds: [],
      skipped: [{ clipId: 'clip-interview-1', reason: 'Effect plan already matches the clip.' }],
    });

    const aiVideoAsset: EditorProject['assets'][number] = {
      id: 'asset-ai-effect-video',
      name: 'AI effect video',
      kind: 'ai',
      source: '/outputs/ai-effect-video.mp4',
      renderPath: 'E:/renders/ai-effect-video.mp4',
      duration: 4,
      metadata: {
        generated: true,
        hasVideo: true,
        hasAudio: true,
        mimeType: 'video/mp4',
      },
    };
    const aiVoiceAsset: EditorProject['assets'][number] = {
      id: 'asset-ai-effect-voice',
      name: 'AI effect voice',
      kind: 'ai',
      source: '/outputs/ai-effect-voice.wav',
      renderPath: 'E:/renders/ai-effect-voice.wav',
      duration: 4,
      metadata: {
        generated: true,
        hasAudio: true,
        mimeType: 'audio/wav',
      },
    };
    const aiVideoClip = createClip({
      id: 'clip-ai-effect-video',
      assetId: aiVideoAsset.id,
      trackId: 'track-v2',
      name: aiVideoAsset.name,
      kind: 'ai',
      start: 42,
      duration: 4,
      color: '#a855f7',
    });
    const aiVoiceClip = createClip({
      id: 'clip-ai-effect-voice',
      assetId: aiVoiceAsset.id,
      trackId: 'track-a1',
      name: aiVoiceAsset.name,
      kind: 'ai',
      start: 42,
      duration: 4,
      color: '#84cc16',
    });
    const aiRenderedEffectProject: EditorProject = {
      ...project,
      assets: [...project.assets, aiVideoAsset, aiVoiceAsset],
      tracks: project.tracks.map((track) => {
        if (track.id === 'track-v2') {
          return { ...track, clips: [...track.clips, aiVideoClip] };
        }

        if (track.id === 'track-a1') {
          return { ...track, clips: [...track.clips, aiVoiceClip] };
        }

        return track;
      }),
    };
    const aiRenderedEffectResult = applyExtensionEffectPlans(aiRenderedEffectProject, [
      {
        clipId: aiVideoClip.id,
        trackId: 'track-v2',
        operation: 'upsert-effect',
        effect: {
          id: 'effect-ai-video-stabilize',
          type: 'stabilize',
          label: 'External AI Stabilize',
          enabled: true,
          parameters: { radius: 12 },
        },
      },
      {
        clipId: aiVoiceClip.id,
        trackId: 'track-a1',
        operation: 'upsert-effect',
        effect: {
          id: 'effect-ai-voice-gain',
          type: 'audio',
          label: 'External AI Voice Gain',
          enabled: true,
          parameters: { gainDb: -3 },
        },
      },
      {
        clipId: aiVoiceClip.id,
        trackId: 'track-a1',
        operation: 'upsert-effect',
        effect: {
          id: 'effect-ai-voice-filter',
          type: 'filter',
          label: 'External AI Voice Look',
          enabled: true,
          parameters: { visualEffect: 'vignette-focus' },
        },
      },
    ]);

    expect(aiRenderedEffectResult).toMatchObject({
      requestedPlanCount: 3,
      appliedPlanCount: 2,
      updatedClipIds: ['clip-ai-effect-video', 'clip-ai-effect-voice'],
      skipped: [{ clipId: 'clip-ai-effect-voice', reason: 'External AI Voice Look is not compatible with ai/audio clips.' }],
    });
    expect(aiRenderedEffectResult.project.tracks.find((track) => track.id === 'track-v2')?.clips.find((clip) => clip.id === aiVideoClip.id)?.effects).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'effect-ai-video-stabilize', type: 'stabilize' }),
    ]));
    expect(aiRenderedEffectResult.project.tracks.find((track) => track.id === 'track-a1')?.clips.find((clip) => clip.id === aiVoiceClip.id)?.effects).toEqual([
      expect.objectContaining({ id: 'effect-ai-voice-gain', type: 'audio' }),
    ]);
  });

  it('routes reviewed external effect planning through the extension invoke IPC handler', async () => {
    const project = withExternalPlugin(createDefaultEditorProject(), {
      id: 'plugin-external-look-planner',
      name: 'External Look Planner',
      entry: 'plugins/external-look-planner/index.js',
      permissions: ['project'],
      contributes: ['effect'],
    });
    const handlers = createEditorIpcHandlers({
      projects: createReadonlyProjectRepository(project),
    });
    const response = await handlers[EDITOR_IPC_CHANNELS.extensionInvoke]({
      project,
      extensionId: 'plugin-external-look-planner',
      command: EXTENSION_SANDBOX_PLAN_EFFECTS_COMMAND,
      payload: {
        presetId: 'warm-contrast',
        selectedClipIds: ['clip-interview-1'],
        parameters: { intensity: 1.5 },
      },
    });
    const effectPlans = readExtensionEffectPlansFromRuntimeResult(response.result);
    const applied = applyExtensionEffectPlans(project, effectPlans);

    expect(response).toMatchObject({
      extensionId: 'plugin-external-look-planner',
      command: EXTENSION_SANDBOX_PLAN_EFFECTS_COMMAND,
      handled: true,
      result: {
        plannedEffectCount: 1,
        parameterOverrides: {
          intensity: 1.5,
        },
        plans: [
          expect.objectContaining({
            clipId: 'clip-interview-1',
            effect: expect.objectContaining({
              label: 'External Warm Contrast',
              parameters: expect.objectContaining({
                externalPresetId: 'warm-contrast',
              }),
            }),
          }),
        ],
      },
    });
    expect(applied.appliedPlanCount).toBe(1);
    expect(applied.project.tracks[0].clips.find((clip) => clip.id === 'clip-interview-1')?.effects).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'color',
        label: 'External Warm Contrast',
        parameters: expect.objectContaining({
          brightness: 0.045,
          contrast: 1.12,
          externalPresetId: 'warm-contrast',
        }),
      }),
    ]));
  });

  it('runs and applies reviewed external transition plans through the sandbox and IPC path', async () => {
    const project = withExternalPlugin(createDefaultEditorProject(), {
      id: 'plugin-external-transition-pack',
      name: 'External Transition Pack',
      entry: 'plugins/external-transition-pack/index.js',
      permissions: ['project'],
      contributes: ['transition'],
      parameterSchemas: {
        transitions: [
          {
            presetId: 'push-left',
            parameters: [
              { key: 'direction', type: 'enum', values: ['left', 'right', 'up', 'down'], required: true },
              { key: 'preserveAudio', type: 'boolean', required: true },
            ],
          },
        ],
      },
    });
    const manifest = project.plugins.find((plugin) => plugin.id === 'plugin-external-transition-pack');
    const request = buildExtensionSandboxCommandRequest(
      project,
      'plugin-external-transition-pack',
      EXTENSION_SANDBOX_PLAN_TRANSITIONS_COMMAND,
      {
        presetId: 'push-left',
        selectedClipIds: ['clip-interview-1', 'clip-interview-2'],
        parameters: { duration: 1.1, direction: 'up', preserveAudio: false },
      },
    );
    const localResponse = handleExtensionSandboxCommandRequest(request);
    const processResponse = await runExtensionSandboxProcessCommand({
      request,
      timeoutMs: 15000,
    });
    const transitionPlans = readExtensionTransitionPlansFromRuntimeResult(processResponse.result);
    expect(manifest).toBeDefined();
    assertExtensionTransitionPlansMatchManifest(manifest!, transitionPlans);
    expect(() => assertExtensionTransitionPlansMatchManifest({
      ...manifest!,
      parameterSchemas: {
        transitions: [
          {
            presetId: 'push-left',
            parameters: [
              { key: 'direction', type: 'enum', values: ['left', 'right'], required: true },
            ],
          },
        ],
      },
    }, transitionPlans)).toThrow(/direction/);
    const applied = applyExtensionTransitionPlans(project, transitionPlans);
    const appliedClip = applied.project.tracks[0].clips.find((clip) => clip.id === 'clip-interview-1');
    const nextClip = applied.project.tracks[0].clips.find((clip) => clip.id === 'clip-interview-2');
    const reapplied = applyExtensionTransitionPlans(applied.project, transitionPlans);
    const aiVoiceAsset: EditorProject['assets'][number] = {
      id: 'asset-ai-transition-voice-1',
      name: 'AI transition voice 1',
      kind: 'ai',
      source: '/outputs/ai-transition-voice-1.wav',
      renderPath: 'E:/renders/ai-transition-voice-1.wav',
      duration: 3,
      metadata: {
        mimeType: 'audio/wav',
        hasAudio: true,
      },
    };
    const aiVoiceNextAsset: EditorProject['assets'][number] = {
      ...aiVoiceAsset,
      id: 'asset-ai-transition-voice-2',
      name: 'AI transition voice 2',
      source: '/outputs/ai-transition-voice-2.wav',
      renderPath: 'E:/renders/ai-transition-voice-2.wav',
    };
    const aiVoiceClip = createClip({
      id: 'clip-ai-transition-voice-1',
      assetId: aiVoiceAsset.id,
      trackId: 'track-a1',
      name: aiVoiceAsset.name,
      kind: 'ai',
      start: 0,
      duration: 3,
      color: '#84cc16',
    });
    const aiVoiceNextClip = createClip({
      id: 'clip-ai-transition-voice-2',
      assetId: aiVoiceNextAsset.id,
      trackId: 'track-a1',
      name: aiVoiceNextAsset.name,
      kind: 'ai',
      start: 3,
      duration: 3,
      color: '#84cc16',
    });
    const aiAudioTransitionProject: EditorProject = {
      ...project,
      assets: [...project.assets, aiVoiceAsset, aiVoiceNextAsset],
      tracks: project.tracks.map((track) => (
        track.id === 'track-a1'
          ? { ...track, clips: [aiVoiceClip, aiVoiceNextClip] }
          : track
      )),
    };
    const aiAudioTransitionResult = applyExtensionTransitionPlans(aiAudioTransitionProject, [{
      clipId: aiVoiceClip.id,
      trackId: 'track-a1',
      nextClipId: aiVoiceNextClip.id,
      operation: 'upsert-transition',
      transition: {
        id: 'transition-ai-audio-voice',
        type: 'crossfade',
        duration: 0.5,
        easing: 'easeInOut',
        parameters: {},
      },
    }]);
    const handlers = createEditorIpcHandlers({
      projects: createReadonlyProjectRepository(project),
    });
    const ipcResponse = await handlers[EDITOR_IPC_CHANNELS.extensionInvoke]({
      project,
      extensionId: 'plugin-external-transition-pack',
      command: EXTENSION_SANDBOX_PLAN_TRANSITIONS_COMMAND,
      payload: {
        presetId: 'smooth-crossfade',
        selectedClipIds: ['clip-interview-1'],
        parameters: { duration: 1.25, easing: 'easeOut', preserveAudio: false },
      },
    });

    expect(localResponse).toMatchObject({
      pluginId: 'plugin-external-transition-pack',
      command: EXTENSION_SANDBOX_PLAN_TRANSITIONS_COMMAND,
      handled: true,
      status: 'executed',
      runtime: 'external-process-command',
      codeExecution: 'reviewed-command-api',
      permissions: ['project'],
      declaredApis: ['transition'],
      result: {
        command: EXTENSION_SANDBOX_PLAN_TRANSITIONS_COMMAND,
        presetId: 'push-left',
        parameterOverrides: {
          duration: 1.1,
          easing: 'easeInOut',
          direction: 'up',
          preserveAudio: false,
        },
        plannedTransitionCount: 1,
        skippedClipCount: 1,
        plans: [
          expect.objectContaining({
            clipId: 'clip-interview-1',
            nextClipId: 'clip-interview-2',
            operation: 'upsert-transition',
            transition: expect.objectContaining({
              id: 'transition-external-push-left-clip-interview-1',
              type: 'push',
              duration: 1.1,
              easing: 'easeInOut',
              parameters: expect.objectContaining({
                externalPresetId: 'push-left',
                direction: 'up',
                preserveAudio: false,
              }),
            }),
          }),
        ],
        skipped: [
          expect.objectContaining({
            clipId: 'clip-interview-2',
            reason: 'Outgoing transition requires a next clip on the same track.',
          }),
        ],
      },
    });
    expect(processResponse).toMatchObject(localResponse);
    expect(processResponse.warnings[0]).toContain('validated transition plan');
    expect(applied).toMatchObject({
      requestedPlanCount: 1,
      appliedPlanCount: 1,
      updatedClipIds: ['clip-interview-1'],
      skipped: [],
    });
    expect(appliedClip?.transitionOut).toMatchObject({
      id: 'transition-external-push-left-clip-interview-1',
      type: 'push',
      duration: 1.1,
      easing: 'easeInOut',
      parameters: expect.objectContaining({
        externalPresetId: 'push-left',
        direction: 'up',
        preserveAudio: false,
      }),
    });
    expect(nextClip?.start).toBe(26.9);
    expect(reapplied).toMatchObject({
      appliedPlanCount: 0,
      updatedClipIds: [],
      skipped: [{ clipId: 'clip-interview-1', reason: 'Transition plan already matches the clip.' }],
    });
    expect(aiAudioTransitionResult).toMatchObject({
      appliedPlanCount: 0,
      updatedClipIds: [],
      skipped: [{ clipId: aiVoiceClip.id, reason: 'External transition plans are available for visual clips.' }],
    });
    expect(ipcResponse).toMatchObject({
      extensionId: 'plugin-external-transition-pack',
      command: EXTENSION_SANDBOX_PLAN_TRANSITIONS_COMMAND,
      handled: true,
      result: {
        plannedTransitionCount: 1,
        parameterOverrides: {
          duration: 1.25,
          easing: 'easeOut',
          preserveAudio: false,
        },
        plans: [
          expect.objectContaining({
            transition: expect.objectContaining({
              type: 'crossfade',
              duration: 1.25,
              easing: 'easeOut',
              parameters: expect.objectContaining({
                externalPresetId: 'smooth-crossfade',
                preserveAudio: false,
              }),
            }),
          }),
        ],
      },
    });
  });

  it('blocks unsafe plugin entries at the sandbox handshake boundary', () => {
    const project = withExternalPlugin(createDefaultEditorProject(), {
      entry: '../escape.js',
    });
    const request = buildExtensionSandboxHandshakeRequest(project, 'plugin-external-look-pack');

    expect(handleExtensionSandboxHandshakeRequest(request)).toMatchObject({
      pluginId: 'plugin-external-look-pack',
      accepted: false,
      status: 'blocked',
      runtime: 'external-process-handshake',
      reason: 'Plugin entry must be a safe relative path under plugins/.',
    });
  });

  it('verifies signed external plugin manifests and blocks tampered fingerprints', () => {
    const unsignedPlugin: EditorProject['plugins'][number] = {
      id: 'plugin-external-signed-auditor',
      name: 'External Signed Auditor',
      version: '0.1.0',
      entry: 'plugins/external-signed-auditor/index.js',
      permissions: ['project'],
      contributes: ['analyzer'],
    };
    const signedPlugin: EditorProject['plugins'][number] = {
      ...unsignedPlugin,
      signature: {
        algorithm: 'manifest-sha256-v1',
        keyId: 'test-local-key',
        manifestFingerprint: buildPluginManifestSignatureFingerprint(unsignedPlugin),
        signedAt: '2026-06-15T00:00:00.000Z',
      },
    };
    const project = withExternalPlugin(createDefaultEditorProject(), signedPlugin);
    const host = buildExtensionHostSnapshot(project);
    const handshakeRequest = buildExtensionSandboxHandshakeRequest(project, signedPlugin.id);

    expect(validateProjectJson(project).ok).toBe(true);
    expect(host.sandboxes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        pluginId: signedPlugin.id,
        status: 'manifest-only',
        executableApis: ['command'],
        signature: expect.objectContaining({
          status: 'verified',
          keyId: 'test-local-key',
          manifestFingerprint: signedPlugin.signature?.manifestFingerprint,
        }),
      }),
    ]));
    expect(handleExtensionSandboxHandshakeRequest(handshakeRequest)).toMatchObject({
      pluginId: signedPlugin.id,
      accepted: true,
      executableApis: ['command'],
    });

    const tamperedProject: EditorProject = {
      ...project,
      plugins: project.plugins.map((plugin) => (
        plugin.id === signedPlugin.id
          ? { ...plugin, version: '0.2.0' }
          : plugin
      )),
    };
    const tamperedValidation = validateProjectJson(tamperedProject);
    const tamperedHost = buildExtensionHostSnapshot(tamperedProject);
    const commandRequest = buildExtensionSandboxCommandRequest(
      tamperedProject,
      signedPlugin.id,
      EXTENSION_SANDBOX_INSPECT_MANIFEST_COMMAND,
    );

    expect(tamperedValidation.ok).toBe(false);
    expect(tamperedValidation.errors).toEqual(expect.arrayContaining([
      expect.stringContaining('$.plugins[2].signature.manifestFingerprint'),
    ]));
    expect(tamperedHost.blockedPlugins).toEqual(expect.arrayContaining([
      expect.objectContaining({
        pluginId: signedPlugin.id,
        reason: expect.stringContaining('signature fingerprint does not match'),
      }),
    ]));
    expect(tamperedHost.sandboxes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        pluginId: signedPlugin.id,
        status: 'blocked',
        executableApis: [],
        signature: expect.objectContaining({
          status: 'mismatch',
          manifestFingerprint: signedPlugin.signature?.manifestFingerprint,
        }),
      }),
    ]));
    expect(handleExtensionSandboxCommandRequest(commandRequest)).toMatchObject({
      pluginId: signedPlugin.id,
      handled: false,
      status: 'blocked',
      reason: expect.stringContaining('signature fingerprint does not match'),
    });
  });

  it('verifies trusted RSA-signed external plugin manifests and blocks bad signatures', () => {
    const unsignedPlugin: EditorProject['plugins'][number] = {
      id: 'plugin-external-rsa-signed-auditor',
      name: 'External RSA Signed Auditor',
      version: '0.1.0',
      entry: 'plugins/external-rsa-signed-auditor/index.js',
      permissions: ['project'],
      contributes: ['analyzer'],
    };
    const signatureValue = signPluginManifestForTest(unsignedPlugin);
    const signedPlugin: EditorProject['plugins'][number] = {
      ...unsignedPlugin,
      signature: {
        algorithm: 'manifest-rsa-sha256-v1',
        keyId: TEST_PLUGIN_SIGNING_KEY_ID,
        manifestFingerprint: buildPluginManifestSignatureFingerprint(unsignedPlugin),
        signatureValue,
        signedAt: '2026-06-15T00:00:00.000Z',
      },
    };
    const project = withExternalPlugin(createDefaultEditorProject(), signedPlugin);
    const host = buildExtensionHostSnapshot(project);

    expect(validateProjectJson(project).ok).toBe(true);
    expect(host.sandboxes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        pluginId: signedPlugin.id,
        status: 'manifest-only',
        executableApis: ['command'],
        signature: expect.objectContaining({
          status: 'verified',
          trustLevel: 'trusted-signer',
          keyId: TEST_PLUGIN_SIGNING_KEY_ID,
          signingKeyFingerprint: expect.stringMatching(/^signer-v1-[a-f0-9]{64}$/),
        }),
      }),
    ]));
    expect(handleExtensionSandboxHandshakeRequest(
      buildExtensionSandboxHandshakeRequest(project, signedPlugin.id),
    )).toMatchObject({
      pluginId: signedPlugin.id,
      accepted: true,
      executableApis: ['command'],
    });

    const badSignatureValue = `${signatureValue.slice(0, -1)}${signatureValue.endsWith('A') ? 'B' : 'A'}`;
    const badSignatureProject = withExternalPlugin(createDefaultEditorProject(), {
      ...signedPlugin,
      signature: {
        ...signedPlugin.signature!,
        signatureValue: badSignatureValue,
      },
    });
    const badValidation = validateProjectJson(badSignatureProject);
    const badHost = buildExtensionHostSnapshot(badSignatureProject);

    expect(badValidation.ok).toBe(false);
    expect(badValidation.errors).toEqual(expect.arrayContaining([
      expect.stringContaining('RSA signature does not verify'),
    ]));
    expect(badHost.sandboxes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        pluginId: signedPlugin.id,
        status: 'blocked',
        executableApis: [],
        signature: expect.objectContaining({
          status: 'bad-signature',
          trustLevel: 'untrusted-signer',
        }),
      }),
    ]));
    expect(handleExtensionSandboxCommandRequest(buildExtensionSandboxCommandRequest(
      badSignatureProject,
      signedPlugin.id,
      EXTENSION_SANDBOX_INSPECT_MANIFEST_COMMAND,
    ))).toMatchObject({
      pluginId: signedPlugin.id,
      handled: false,
      status: 'blocked',
      reason: expect.stringContaining('RSA signature does not verify'),
    });
  });

  it('applies trusted signer key rotation policy after RSA verification', () => {
    const unsignedPlugin: EditorProject['plugins'][number] = {
      id: 'plugin-external-rotated-signer-auditor',
      name: 'External Rotated Signer Auditor',
      version: '0.1.0',
      entry: 'plugins/external-rotated-signer-auditor/index.js',
      permissions: ['project'],
      contributes: ['analyzer'],
    };
    const signedPlugin: EditorProject['plugins'][number] = {
      ...unsignedPlugin,
      signature: {
        algorithm: 'manifest-rsa-sha256-v1',
        keyId: TEST_PLUGIN_SIGNING_KEY_ID,
        manifestFingerprint: buildPluginManifestSignatureFingerprint(unsignedPlugin),
        signatureValue: signPluginManifestForTest(unsignedPlugin),
        signedAt: '2026-06-15T00:00:00.000Z',
      },
    };
    const trustedKey = DEFAULT_PLUGIN_MANIFEST_TRUSTED_SIGNING_KEYS.find((key) => key.id === TEST_PLUGIN_SIGNING_KEY_ID);
    expect(trustedKey).toBeDefined();
    const retiringVerification = verifyPluginManifestSignature(signedPlugin, {
      trustedSigningKeys: [{
        ...trustedKey!,
        status: 'retiring',
        replacementKeyId: 'danbi-production-plugin-rsa-2027',
      }],
      verificationTime: '2026-06-16T00:00:00.000Z',
    });
    const expiredVerification = verifyPluginManifestSignature(signedPlugin, {
      trustedSigningKeys: [{
        ...trustedKey!,
        validUntil: '2026-06-14T23:59:59.000Z',
        replacementKeyId: 'danbi-production-plugin-rsa-2027',
      }],
      verificationTime: '2026-06-16T00:00:00.000Z',
    });
    const revokedVerification = verifyPluginManifestSignature(signedPlugin, {
      trustedSigningKeys: [{
        ...trustedKey!,
        status: 'revoked',
        revokedAt: '2026-06-16T00:00:00.000Z',
        replacementKeyId: 'danbi-production-plugin-rsa-2027',
      }],
      verificationTime: '2026-06-16T00:00:00.000Z',
    });

    expect(retiringVerification).toMatchObject({
      status: 'verified',
      trustLevel: 'trusted-signer',
      signingKeyStatus: 'retiring',
      signingKeyReplacementKeyId: 'danbi-production-plugin-rsa-2027',
      reason: expect.stringContaining('retiring trusted signer key'),
    });
    expect(expiredVerification).toMatchObject({
      status: 'untrusted-key',
      trustLevel: 'untrusted-signer',
      signingKeyStatus: 'expired',
      signingKeyReplacementKeyId: 'danbi-production-plugin-rsa-2027',
      reason: expect.stringContaining('expired'),
    });
    expect(revokedVerification).toMatchObject({
      status: 'untrusted-key',
      trustLevel: 'untrusted-signer',
      signingKeyStatus: 'revoked',
      signingKeyReplacementKeyId: 'danbi-production-plugin-rsa-2027',
      reason: expect.stringContaining('revoked'),
    });
  });

  it('keeps signed manifest fingerprints stable across exporter writer trust decisions', () => {
    const unsignedPlugin: EditorProject['plugins'][number] = {
      id: 'plugin-external-signed-exporter',
      name: 'External Signed Exporter',
      version: '0.1.0',
      entry: 'plugins/external-signed-exporter/index.js',
      permissions: ['project'],
      contributes: ['exporter'],
      exporterWriters: [
        {
          id: 'signed-writer',
          label: 'Signed Writer',
          executable: 'plugins/external-signed-exporter/writer.cmd',
          args: ['{manifest}', '{output}'],
          trust: 'prompt',
        },
      ],
    };
    const project = withExternalPlugin(createDefaultEditorProject(), {
      ...unsignedPlugin,
      signature: {
        algorithm: 'manifest-sha256-v1',
        keyId: 'test-local-key',
        manifestFingerprint: buildPluginManifestSignatureFingerprint(unsignedPlugin),
      },
    });

    const approval = updatePluginExporterWriterTrust(
      project,
      unsignedPlugin.id,
      'signed-writer',
      'trusted',
      { updatedAt: '2026-06-15T00:00:00.000Z', source: 'test-suite' },
    );
    const host = buildExtensionHostSnapshot(approval.project);

    expect(validateProjectJson(approval.project).ok).toBe(true);
    expect(host.sandboxes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        pluginId: unsignedPlugin.id,
        signature: expect.objectContaining({
          status: 'verified',
        }),
        exporterWriters: [
          expect.objectContaining({
            writerId: 'signed-writer',
            status: 'trusted',
            trustHistoryCount: 1,
          }),
        ],
      }),
    ]));
  });

  it('exposes trusted exporter writer declarations without importing plugin files', () => {
    const declaredProject = withExternalPlugin(createDefaultEditorProject(), {
      id: 'plugin-external-export-auditor',
      name: 'External Export Auditor',
      entry: 'plugins/external-export-auditor/index.js',
      permissions: ['project'],
      contributes: ['exporter'],
      exporterWriters: [
        {
          id: 'reviewed-writer',
          label: 'Reviewed Writer',
          executable: 'plugins/external-export-auditor/writer.cmd',
          args: ['--manifest', '{manifest}', '--output', '{output}'],
          cwd: 'plugins/external-export-auditor',
          trust: 'trusted',
          runtimePackage: {
            packageId: 'external-export-auditor-writer-win-x64',
            runtime: 'native',
            root: 'plugins/external-export-auditor',
            entry: 'writer.cmd',
            files: [
              {
                path: 'writer.cmd',
                sha256: 'sha256-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
                bytes: 42,
              },
            ],
          },
          timeoutMs: 15000,
        },
        {
          id: 'approval-writer',
          label: 'Approval Writer',
          executable: 'plugins/external-export-auditor/review.cmd',
          args: ['{manifest}', '{output}'],
          trust: 'prompt',
        },
      ],
    });
    const project = updatePluginExporterWriterTrust(
      declaredProject,
      'plugin-external-export-auditor',
      'reviewed-writer',
      'trusted',
      { updatedAt: '2026-06-15T00:00:00.000Z' },
    ).project;
    const host = buildExtensionHostSnapshot(project);
    const request = buildExtensionSandboxHandshakeRequest(project, 'plugin-external-export-auditor');

    expect(handleExtensionSandboxHandshakeRequest(request)).toMatchObject({
      pluginId: 'plugin-external-export-auditor',
      accepted: true,
      executableApis: ['command'],
    });
    expect(host.sandboxes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        pluginId: 'plugin-external-export-auditor',
        executableApis: ['command', 'exporter-writer'],
        exporterWriters: [
          expect.objectContaining({
            writerId: 'reviewed-writer',
            status: 'trusted',
            approvalStatus: 'current',
            executable: 'plugins/external-export-auditor/writer.cmd',
            packageStatus: 'packaged',
            runtimePackage: expect.objectContaining({
              packageId: 'external-export-auditor-writer-win-x64',
              runtime: 'native',
              files: [
                expect.objectContaining({
                  path: 'writer.cmd',
                }),
              ],
            }),
            timeoutMs: 15000,
          }),
          expect.objectContaining({
            writerId: 'approval-writer',
            status: 'approval-required',
          }),
        ],
      }),
    ]));
  });

  it('persists exporter writer approval decisions into sandbox trust policy', () => {
    const project = withExternalPlugin(createDefaultEditorProject(), {
      id: 'plugin-external-export-auditor',
      name: 'External Export Auditor',
      entry: 'plugins/external-export-auditor/index.js',
      permissions: ['project'],
      contributes: ['exporter'],
      exporterWriters: [
        {
          id: 'approval-writer',
          label: 'Approval Writer',
          executable: 'plugins/external-export-auditor/review.cmd',
          args: ['{manifest}', '{output}'],
          trust: 'prompt',
        },
      ],
    });

    const approval = updatePluginExporterWriterTrust(
      project,
      'plugin-external-export-auditor',
      'approval-writer',
      'trusted',
      { updatedAt: '2026-06-15T00:00:00.000Z', source: 'test-suite' },
    );
    const approvedHost = buildExtensionHostSnapshot(approval.project);

    expect(approval).toMatchObject({
      updated: true,
      status: 'updated',
      previousTrust: 'prompt',
      nextTrust: 'trusted',
      auditEntry: expect.objectContaining({
        at: '2026-06-15T00:00:00.000Z',
        action: 'approved',
        previousTrust: 'prompt',
        nextTrust: 'trusted',
        commandPreview: 'plugins/external-export-auditor/review.cmd {manifest} {output}',
        source: 'test-suite',
      }),
    });
    expect(approval.project.updatedAt).toBe('2026-06-15T00:00:00.000Z');
    expect(approval.project.plugins.at(-1)?.exporterWriters?.[0].trustHistory).toEqual([
      expect.objectContaining({
        action: 'approved',
        source: 'test-suite',
      }),
    ]);
    expect(approvedHost.sandboxes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        pluginId: 'plugin-external-export-auditor',
        executableApis: ['command', 'exporter-writer'],
        exporterWriters: [
          expect.objectContaining({
            writerId: 'approval-writer',
            trust: 'trusted',
            status: 'trusted',
            trustHistoryCount: 1,
            latestTrustDecision: expect.objectContaining({
              action: 'approved',
              source: 'test-suite',
            }),
          }),
        ],
      }),
    ]));

    const tamperedProject: EditorProject = {
      ...approval.project,
      plugins: approval.project.plugins.map((plugin) => (
        plugin.id === 'plugin-external-export-auditor'
          ? {
              ...plugin,
              exporterWriters: plugin.exporterWriters?.map((writer) => (
                writer.id === 'approval-writer'
                  ? { ...writer, args: ['{manifest}', '{output}', '--changed-after-approval'] }
                  : writer
              )),
            }
          : plugin
      )),
    };
    const staleHost = buildExtensionHostSnapshot(tamperedProject);

    expect(staleHost.sandboxes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        pluginId: 'plugin-external-export-auditor',
        executableApis: ['command'],
        exporterWriters: [
          expect.objectContaining({
            writerId: 'approval-writer',
            trust: 'trusted',
            status: 'approval-required',
            approvalStatus: 'stale',
            latestTrustDecision: expect.objectContaining({
              action: 'approved',
            }),
          }),
        ],
      }),
    ]));

    const block = updatePluginExporterWriterTrust(
      approval.project,
      'plugin-external-export-auditor',
      'approval-writer',
      'blocked',
      { updatedAt: '2026-06-15T00:01:00.000Z', source: 'test-suite' },
    );
    const blockedHost = buildExtensionHostSnapshot(block.project);

    expect(block).toMatchObject({
      updated: true,
      status: 'updated',
      previousTrust: 'trusted',
      nextTrust: 'blocked',
      auditEntry: expect.objectContaining({
        at: '2026-06-15T00:01:00.000Z',
        action: 'blocked',
        previousTrust: 'trusted',
        nextTrust: 'blocked',
      }),
    });
    expect(block.project.plugins.at(-1)?.exporterWriters?.[0].trustHistory).toEqual([
      expect.objectContaining({ action: 'approved' }),
      expect.objectContaining({ action: 'blocked' }),
    ]);
    expect(blockedHost.sandboxes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        pluginId: 'plugin-external-export-auditor',
        executableApis: ['command'],
        exporterWriters: [
          expect.objectContaining({
            writerId: 'approval-writer',
            trust: 'blocked',
            status: 'blocked',
            trustHistoryCount: 2,
            latestTrustDecision: expect.objectContaining({
              action: 'blocked',
            }),
          }),
        ],
      }),
    ]));
  });

  it('rejects unsafe exporter writer declarations at project and sandbox boundaries', () => {
    const project = withExternalPlugin(createDefaultEditorProject(), {
      id: 'plugin-external-export-auditor',
      name: 'External Export Auditor',
      entry: 'plugins/external-export-auditor/index.js',
      permissions: ['project'],
      contributes: ['exporter'],
      exporterWriters: [
        {
          id: 'unsafe-writer',
          label: 'Unsafe Writer',
          executable: 'C:/Windows/System32/cmd.exe',
          args: ['{manifest}', '{output}'],
          trust: 'trusted',
        },
      ],
    });
    const validation = validateProjectJson(project);
    const request = buildExtensionSandboxHandshakeRequest(project, 'plugin-external-export-auditor');

    expect(validation.ok).toBe(false);
    expect(validation.errors).toEqual(expect.arrayContaining([
      expect.stringContaining('$.plugins[2].exporterWriters[0].executable'),
    ]));
    expect(handleExtensionSandboxHandshakeRequest(request)).toMatchObject({
      pluginId: 'plugin-external-export-auditor',
      accepted: false,
      status: 'blocked',
      reason: expect.stringContaining('exporterWriters[0].executable'),
    });
  });

  it('rejects unsafe custom command declarations at project and sandbox boundaries', () => {
    const project = withExternalPlugin(createDefaultEditorProject(), {
      permissions: ['project'],
      contributes: ['analyzer'],
      customCommands: [
        {
          id: 'export-report',
          label: 'Export Report',
          contribution: 'exporter',
          kind: 'export-report',
        },
      ],
    });
    const validation = validateProjectJson(project);
    const request = buildExtensionSandboxHandshakeRequest(project, 'plugin-external-look-pack');

    expect(validation.ok).toBe(false);
    expect(validation.errors).toEqual(expect.arrayContaining([
      expect.stringContaining('$.plugins[2].customCommands[0].contribution'),
    ]));
    expect(handleExtensionSandboxHandshakeRequest(request)).toMatchObject({
      pluginId: 'plugin-external-look-pack',
      accepted: false,
      status: 'blocked',
      reason: expect.stringContaining('customCommands[0].contribution'),
    });
  });

  it('blocks reviewed custom commands with invalid payload parameters', () => {
    const project = withExternalPlugin(createDefaultEditorProject(), {
      permissions: ['project'],
      contributes: ['analyzer'],
      customCommands: [
        {
          id: 'timeline-gap-audit',
          label: 'Timeline Gap Audit',
          contribution: 'analyzer',
          kind: 'timeline-report',
          parameters: [
            { key: 'minGapDurationSeconds', type: 'number', min: 0, max: 30, required: true },
          ],
        },
      ],
    });
    const request = buildExtensionSandboxCommandRequest(
      project,
      'plugin-external-look-pack',
      EXTENSION_SANDBOX_RUN_CUSTOM_COMMAND,
      {
        commandId: 'timeline-gap-audit',
        parameters: {
          minGapDurationSeconds: 'slow',
        },
      },
    );

    expect(handleExtensionSandboxCommandRequest(request)).toMatchObject({
      pluginId: 'plugin-external-look-pack',
      command: EXTENSION_SANDBOX_RUN_CUSTOM_COMMAND,
      handled: false,
      status: 'blocked',
      runtime: 'external-process-command',
      codeExecution: 'disabled',
      reason: 'Reviewed custom command parameter minGapDurationSeconds must be a finite number.',
    });
  });

  it('blocks reviewed sandbox commands when the manifest lacks the reviewed API contract', () => {
    const project = withExternalPlugin(createDefaultEditorProject(), {
      permissions: ['project'],
      contributes: ['effect'],
    });
    const request = buildExtensionSandboxCommandRequest(
      project,
      'plugin-external-look-pack',
      EXTENSION_SANDBOX_INSPECT_MANIFEST_COMMAND,
    );

    expect(handleExtensionSandboxCommandRequest(request)).toMatchObject({
      pluginId: 'plugin-external-look-pack',
      command: EXTENSION_SANDBOX_INSPECT_MANIFEST_COMMAND,
      handled: false,
      status: 'blocked',
      runtime: 'external-process-command',
      codeExecution: 'disabled',
      reason: 'Reviewed sandbox command danbi.external.inspectManifest requires project permission and analyzer contribution.',
    });
  });

  it('blocks unreviewed sandbox commands even for valid external manifests', () => {
    const project = withExternalPlugin(createDefaultEditorProject());
    const request = buildExtensionSandboxCommandRequest(
      project,
      'plugin-external-look-pack',
      'external.looks.apply',
    );

    expect(handleExtensionSandboxCommandRequest(request)).toMatchObject({
      pluginId: 'plugin-external-look-pack',
      command: 'external.looks.apply',
      handled: false,
      status: 'blocked',
      reason: 'Reviewed sandbox command is not available: external.looks.apply.',
    });
  });
});

function withExternalPlugin(
  project: EditorProject,
  patch: Partial<EditorProject['plugins'][number]> = {},
): EditorProject {
  return {
    ...project,
    plugins: [
      ...project.plugins,
      {
        id: 'plugin-external-look-pack',
        name: 'External Look Pack',
        version: '0.1.0',
        entry: 'plugins/external-look-pack/index.js',
        permissions: ['project'],
        contributes: ['effect', 'analyzer'],
        ...patch,
      },
    ],
  };
}

function signPluginManifestForTest(plugin: EditorProject['plugins'][number]): string {
  const signer = createSign('RSA-SHA256');
  signer.update(buildPluginManifestSignaturePayload(plugin));
  signer.end();
  return `${PLUGIN_MANIFEST_RSA_SIGNATURE_VALUE_PREFIX}${signer.sign(TEST_PLUGIN_SIGNING_PRIVATE_KEY).toString('base64url')}`;
}

function withTimelineGapScenario(project: EditorProject): EditorProject {
  return {
    ...project,
    duration: 30,
    tracks: project.tracks.map((track) => {
      if (track.id !== 'track-v1') {
        return track;
      }

      const [firstClip, secondClip] = track.clips;
      return {
        ...track,
        clips: [
          {
            ...firstClip,
            start: 0,
            duration: 5,
            sourceIn: 0,
            locked: true,
          },
          {
            ...secondClip,
            start: 12,
            duration: 3,
            sourceIn: 12,
            muted: true,
          },
        ],
      };
    }),
  };
}

function withExporterProfileScenario(project: EditorProject): EditorProject {
  return {
    ...project,
    exportProfiles: [
      ...project.exportProfiles,
      {
        ...project.exportProfiles[0],
        id: 'profile-webm-h264-invalid',
        label: 'Invalid WebM H.264',
        purpose: 'social',
        container: 'webm',
        codec: 'h264',
      },
      {
        ...project.exportProfiles[0],
        id: 'profile-odd-dimensions',
        label: 'Odd Dimension Review',
        purpose: 'proxy',
        width: 1919,
        height: 1081,
      },
    ],
  };
}

function withEffectPlanScenario(project: EditorProject): EditorProject {
  return {
    ...project,
    tracks: project.tracks.map((track) => {
      if (track.id !== 'track-v1') {
        return track;
      }

      return {
        ...track,
        clips: track.clips.map((clip) => (
          clip.id === 'clip-interview-2'
            ? { ...clip, locked: true }
            : clip
        )),
      };
    }),
  };
}

function withDuplicateExternalEffectScenario(project: EditorProject): EditorProject {
  return {
    ...project,
    tracks: project.tracks.map((track) => (
      track.id === 'track-v1'
        ? {
            ...track,
            clips: track.clips.map((clip) => (
              clip.id === 'clip-interview-1'
                ? {
                    ...clip,
                    effects: [
                      ...clip.effects,
                      {
                        id: 'effect-old-external-soft-vignette-a',
                        type: 'filter',
                        label: 'Old External Soft Vignette',
                        enabled: true,
                        parameters: { externalPresetId: 'soft-vignette', visualEffect: 'old-vignette' },
                      },
                      {
                        id: 'effect-old-external-soft-vignette-b',
                        type: 'filter',
                        label: 'Old External Soft Vignette Duplicate',
                        enabled: true,
                        parameters: { externalPresetId: 'soft-vignette', visualEffect: 'old-vignette' },
                      },
                    ],
                  }
                : clip
            )),
          }
        : track
    )),
  };
}
