import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EXTENSION_SANDBOX_WRITE_EXPORTS_COMMAND } from '../../src/electron/shared/extension-api';
import { writeReviewedExternalExporterHandoff } from '../../src/electron/main/external-exporter-handoff-writer';
import {
  EXTERNAL_EXPORTER_RUN_REPORT_KIND,
  formatExternalExporterHelp,
  formatExternalExporterRunReport,
  loadExternalExporterHandoffManifest,
  parseExternalExporterCliArgs,
  runExternalExporterHandoffManifest,
  writeExternalExporterRunReport,
  type ExternalExporterWriterCommand,
} from '../../src/electron/main/external-exporter-runner';

const PACKAGED_WRITER_CONTENT = '@echo off\nnode writer.js %*\n';
const PACKAGED_WRITER_SHA256 = `sha256-${createHash('sha256').update(PACKAGED_WRITER_CONTENT).digest('hex')}`;
const PACKAGED_WRITER_BYTES = Buffer.byteLength(PACKAGED_WRITER_CONTENT, 'utf8');

describe('external exporter runner', () => {
  it('parses CLI options and formats help', () => {
    const options = parseExternalExporterCliArgs([
      '--handoff',
      'exports/reviewed/danbi-external-export-handoff.json',
      '--root',
      '.danbi/external',
      '--report',
      'exports/reviewed/report.json',
      '--profile',
      'profile-a,profile-b',
      '--worker-id',
      'writer-a',
      '--dry-run',
      '--writer',
      'external-writer',
      '--writer-arg',
      '--manifest={manifest}',
      '--writer-arg',
      '--output={output}',
      '--timeout-ms',
      '1234',
    ], 'E:\\work');

    expect(options).toMatchObject({
      workerId: 'writer-a',
      dryRun: true,
      writerExecutable: 'external-writer',
      writerArgs: ['--manifest={manifest}', '--output={output}'],
      profileIds: ['profile-a', 'profile-b'],
      timeoutMs: 1234,
    });
    expect(options.handoffPath).toBe('E:\\work\\exports\\reviewed\\danbi-external-export-handoff.json');
    expect(options.rootDirectory).toBe('E:\\work\\.danbi\\external');
    expect(formatExternalExporterHelp()).toContain('editor:external-exporter');
  });

  it('dry-runs and executes reviewed external exporter handoffs through a writer command boundary', async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), 'danbi-external-exporter-runner-'));
    try {
      const writeResult = await writeReviewedExternalExporterHandoff(buildReviewedWriteExportsResult(), {
        rootDirectory: outputRoot,
        now: '2026-06-15T00:00:00.000Z',
      });
      expect(writeResult.status).toBe('completed');
      expect(writeResult.batchManifestPath).toBeTruthy();

      const handoff = await loadExternalExporterHandoffManifest(writeResult.batchManifestPath ?? '');
      const dryRunReport = await runExternalExporterHandoffManifest({
        manifest: handoff,
        handoffPath: writeResult.batchManifestPath ?? '',
        workerId: 'runner-dry',
        dryRun: true,
        writerCommand: {
          executable: 'external-writer',
          args: ['--manifest', '{manifest}', '--output', '{output}', '--profile', '{profileId}'],
          cwd: outputRoot,
        },
        now: createClock(),
      });

      expect(dryRunReport).toMatchObject({
        kind: EXTERNAL_EXPORTER_RUN_REPORT_KIND,
        dryRun: true,
        summary: {
          totalJobs: 2,
          plannedJobs: 1,
          skippedJobs: 1,
        },
        jobs: [
          expect.objectContaining({
            profileId: 'profile-ready',
            status: 'planned',
            commandText: expect.stringContaining('--profile profile-ready'),
          }),
          expect.objectContaining({
            profileId: 'profile-blocked',
            status: 'skipped',
          }),
        ],
      });

      const executedCommands: ExternalExporterWriterCommand[] = [];
      const runReport = await runExternalExporterHandoffManifest({
        manifest: handoff,
        handoffPath: writeResult.batchManifestPath ?? '',
        workerId: 'runner-exec',
        writerCommand: {
          executable: 'external-writer',
          args: ['--manifest', '{manifest}', '--output', '{output}', '--profile', '{profileId}', '--plugin', '{pluginId}', '--handoff', '{handoff}'],
          cwd: outputRoot,
        },
        executeCommand: async (command) => {
          executedCommands.push(command);
          const outputPath = command.args[command.args.indexOf('--output') + 1];
          await mkdir(dirname(outputPath), { recursive: true });
          await writeFile(outputPath, 'external exporter output\n', 'utf8');
          return { exitCode: 0, stdout: 'writer completed', stderr: '' };
        },
        now: createClock(),
      });

      expect(executedCommands).toHaveLength(1);
      expect(executedCommands[0].args).toEqual(expect.arrayContaining([
        '--profile',
        'profile-ready',
        '--plugin',
        'plugin-external-export-auditor',
      ]));
      expect(runReport).toMatchObject({
        dryRun: false,
        summary: {
          totalJobs: 2,
          completedJobs: 1,
          skippedJobs: 1,
          failedJobs: 0,
        },
        jobs: [
          expect.objectContaining({
            profileId: 'profile-ready',
            status: 'completed',
            outputPath: 'exports/reviewed-runner/final-profile-ready.mp4',
            outputBytes: expect.any(Number),
            stdoutTail: 'writer completed',
          }),
          expect.objectContaining({
            profileId: 'profile-blocked',
            status: 'skipped',
          }),
        ],
      });
      expect(formatExternalExporterRunReport(runReport)).toContain('completed: 1');

      await writePackagedWriterFixture(outputRoot);
      const declaredCommands: ExternalExporterWriterCommand[] = [];
      const declaredReport = await runExternalExporterHandoffManifest({
        manifest: handoff,
        handoffPath: writeResult.batchManifestPath ?? '',
        workerId: 'runner-declared',
        profileIds: ['profile-ready'],
        executeCommand: async (command) => {
          declaredCommands.push(command);
          const outputPath = command.args[command.args.indexOf('--output') + 1];
          await mkdir(dirname(outputPath), { recursive: true });
          await writeFile(outputPath, 'declared external exporter output\n', 'utf8');
          return { exitCode: 0, stdout: 'declared writer completed', stderr: '' };
        },
        now: createClock(),
      });

      expect(declaredCommands).toHaveLength(1);
      expect(declaredCommands[0].executable).toBe(join(outputRoot, 'plugins', 'external-export-auditor', 'writer.cmd'));
      expect(declaredCommands[0].cwd).toBe(join(outputRoot, 'plugins', 'external-export-auditor'));
      expect(declaredReport).toMatchObject({
        summary: {
          totalJobs: 2,
          completedJobs: 1,
          skippedJobs: 1,
          failedJobs: 0,
        },
        jobs: [
          expect.objectContaining({
            profileId: 'profile-ready',
            status: 'completed',
            stdoutTail: 'declared writer completed',
          }),
          expect.objectContaining({
            profileId: 'profile-blocked',
            status: 'skipped',
          }),
        ],
      });

      await writeFile(join(outputRoot, 'plugins', 'external-export-auditor', 'writer.cmd'), '@echo off\nrem tampered\n', 'utf8');
      const tamperedReport = await runExternalExporterHandoffManifest({
        manifest: handoff,
        handoffPath: writeResult.batchManifestPath ?? '',
        workerId: 'runner-tampered-package',
        profileIds: ['profile-ready'],
        executeCommand: async (command) => {
          declaredCommands.push(command);
          return { exitCode: 0, stdout: '', stderr: '' };
        },
        now: createClock(),
      });

      expect(declaredCommands).toHaveLength(1);
      expect(tamperedReport).toMatchObject({
        summary: {
          totalJobs: 2,
          blockedJobs: 1,
          skippedJobs: 1,
        },
        jobs: [
          expect.objectContaining({
            profileId: 'profile-ready',
            status: 'blocked',
            error: expect.stringContaining('mismatch'),
          }),
          expect.objectContaining({
            profileId: 'profile-blocked',
            status: 'skipped',
          }),
        ],
      });

      const reportPath = join(outputRoot, 'exports', 'reviewed-runner', 'external-exporter-report.json');
      await writeExternalExporterRunReport(runReport, reportPath);
      const reportDocument = JSON.parse(await readFile(reportPath, 'utf8')) as Record<string, unknown>;
      const reportDirectoryFiles = await readdir(dirname(reportPath));
      expect(reportDocument).toMatchObject({
        kind: EXTERNAL_EXPORTER_RUN_REPORT_KIND,
        workerId: 'runner-exec',
      });
      expect(reportDirectoryFiles.some((filename) => filename.endsWith('.tmp'))).toBe(false);
    } finally {
      await rm(outputRoot, { recursive: true, force: true });
    }
  });
});

function buildReviewedWriteExportsResult(): Record<string, unknown> {
  return {
    command: EXTENSION_SANDBOX_WRITE_EXPORTS_COMMAND,
    pluginId: 'plugin-external-export-auditor',
    request: {
      outputDirectory: 'exports/reviewed-runner',
    },
    project: {
      projectId: 'project-test',
      name: 'Runner Test',
      duration: 12,
      fps: 30,
      width: 1920,
      height: 1080,
      exportProfileCount: 2,
    },
    outputManifests: [
      {
        manifestVersion: 1,
        pluginId: 'plugin-external-export-auditor',
        profileId: 'profile-ready',
        label: 'Ready Export',
        purpose: 'master',
        container: 'mp4',
        codec: 'h264',
        width: 1920,
        height: 1080,
        fps: 30,
        videoBitrateMbps: 20,
        audioBitrateKbps: 320,
        duration: 12,
        estimatedPixelCount: 746496000,
        outputDirectory: 'exports/reviewed-runner',
        outputFilename: 'final-profile-ready.mp4',
        outputPath: 'exports/reviewed-runner/final-profile-ready.mp4',
        dryRun: false,
        status: 'ready',
        issueCount: 0,
        issues: [],
        priority: 1,
      },
      {
        manifestVersion: 1,
        pluginId: 'plugin-external-export-auditor',
        profileId: 'profile-blocked',
        label: 'Blocked Export',
        purpose: 'social',
        container: 'webm',
        codec: 'h264',
        width: 1920,
        height: 1080,
        fps: 30,
        videoBitrateMbps: 8,
        audioBitrateKbps: 160,
        duration: 12,
        estimatedPixelCount: 746496000,
        outputDirectory: 'exports/reviewed-runner',
        outputFilename: 'final-profile-blocked.webm',
        outputPath: 'exports/reviewed-runner/final-profile-blocked.webm',
        dryRun: false,
        status: 'blocked',
        issueCount: 1,
        issues: ['incompatible-codec-container'],
        priority: 2,
      },
    ],
    exporterWriters: [
      {
        writerId: 'reviewed-writer',
        label: 'Reviewed Writer',
        executable: 'plugins/external-export-auditor/writer.cmd',
        args: ['--manifest', '{manifest}', '--output', '{output}', '--profile', '{profileId}'],
        cwd: 'plugins/external-export-auditor',
        trust: 'trusted',
        status: 'trusted',
        packageStatus: 'packaged',
        runtimePackage: {
          packageId: 'external-export-auditor-writer-win-x64',
          runtime: 'native',
          root: 'plugins/external-export-auditor',
          entry: 'writer.cmd',
          packagedAt: '2026-06-15T00:00:00.000Z',
          files: [
            {
              path: 'writer.cmd',
              sha256: PACKAGED_WRITER_SHA256,
              bytes: PACKAGED_WRITER_BYTES,
            },
          ],
        },
        timeoutMs: 1500,
      },
    ],
  };
}

async function writePackagedWriterFixture(outputRoot: string): Promise<void> {
  const writerPath = join(outputRoot, 'plugins', 'external-export-auditor', 'writer.cmd');
  await mkdir(dirname(writerPath), { recursive: true });
  await writeFile(writerPath, PACKAGED_WRITER_CONTENT, 'utf8');
}

function createClock(): () => string {
  let tick = 0;
  return () => `2026-06-15T00:00:${String(tick++).padStart(2, '0')}.000Z`;
}
