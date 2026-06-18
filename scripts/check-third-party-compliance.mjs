import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceMirrorLockPath = 'third_party/source-mirrors.lock.json';

const requiredDocs = [
  'docs/THIRD_PARTY_LICENSE_DECISION_LOG_KR.md',
  'docs/THIRD_PARTY_LICENSE_SOURCES_KR.md',
  'docs/THIRD_PARTY_LICENSE_POLICY_KR.md',
  'docs/THIRD_PARTY_LICENSE_COMPLIANCE_KR.md',
  'docs/SOURCE_REUSE_INTAKE_CHECKLIST_KR.md',
  'docs/THIRD_PARTY_SOURCE_REGISTER_KR.md',
  'docs/SOURCE_REUSE_AUDIT_KR.md',
  'docs/SHOTCUT_GPL_BOUNDARY_KR.md',
  'docs/FFMPEG_BINARY_LICENSE_BOUNDARY_KR.md',
  'docs/LICENSE_GUARDRAILS_KR.md',
  sourceMirrorLockPath,
  'third_party/FFMPEG_BINARY_NOTICE.md',
  'third_party/NOTICE.md',
  'third_party/README.md',
];

const sourceMirrorCommits = loadSourceMirrorLock();

const expectedRegisterIds = [
  'OPCUT-CLASSIC-ACTIONS-001',
  'OPCUT-CLASSIC-TIMELINE-SNAP-PLACE-001',
  'OPCUT-CLASSIC-ANIMATION-001',
  'OPCUT-CLASSIC-GROUP-MOVE-001',
  'OPCUT-CLASSIC-GROUP-RESIZE-001',
  'OPCUT-CLASSIC-WAVEFORM-CACHE-001',
  'OPCUT-CLASSIC-VIDEO-CACHE-001',
  'OPCUT-CLASSIC-TIMELINE-TRANSACTION-001',
  'OPCUT-CLASSIC-STORAGE-RECOVERY-001',
];

const expectedNoticeTerms = [
  'OpenCut Classic',
  'cf5e79e919144200294fb9fed22a222592a0aeea',
  'Copyright 2025-2026 OpenCut',
  'Permission is hereby granted, free of charge',
  'apps/web/src/animation/interpolation.ts',
  'apps/web/src/animation/resolve.ts',
  'apps/web/src/animation/types.ts',
  'apps/web/src/timeline/group-move/build-group.ts',
  'apps/web/src/timeline/group-move/resolve-move.ts',
  'apps/web/src/timeline/group-move/types.ts',
  'apps/web/src/timeline/group-resize/compute-resize.ts',
  'apps/web/src/timeline/group-resize/types.ts',
  'apps/web/src/services/waveform-cache/service.ts',
  'apps/web/src/services/video-cache/service.ts',
  'apps/web/src/timeline/update-pipeline.ts',
  'apps/web/src/core/managers/commands.ts',
  'apps/web/src/services/storage/service.ts',
  'apps/web/src/services/storage/quota.ts',
  'apps/web/src/services/storage/types.ts',
];

const requiredImportedFiles = [
  'src/lib/editor/command-registry.ts',
  'src/lib/editor/keyboard-map.ts',
  'src/lib/editor/keyframe-interpolation.ts',
  'src/lib/editor/preview.ts',
  'src/lib/editor/timeline-group-move.ts',
  'src/lib/editor/timeline-group-resize.ts',
  'src/lib/editor/timeline-snapping.ts',
  'src/lib/editor/timeline-placement.ts',
  'src/lib/editor/waveform-cache.ts',
  'src/lib/editor/preview-frame-cache.ts',
  'src/lib/editor/timeline-transaction.ts',
  'src/lib/editor/project-recovery.ts',
  'src/lib/editor/timeline.ts',
  'src/electron/renderer/media-drop-helpers.ts',
  'src/electron/renderer/timeline-edit-preview-helpers.ts',
  'src/electron/renderer/project-history-controller.ts',
  'src/electron/renderer/project-persistence-workflow-helpers.ts',
];

const requiredAdaptedSourceHeaderFiles = [
  'src/lib/editor/command-registry.ts',
  'src/lib/editor/keyframe-interpolation.ts',
  'src/lib/editor/timeline-group-move.ts',
  'src/lib/editor/timeline-group-resize.ts',
  'src/lib/editor/timeline-snapping.ts',
  'src/lib/editor/timeline-placement.ts',
  'src/lib/editor/waveform-cache.ts',
  'src/lib/editor/preview-frame-cache.ts',
  'src/lib/editor/timeline-transaction.ts',
  'src/lib/editor/project-recovery.ts',
];

const runtimeSourceRoots = ['src', 'public'];
const ffmpegBinarySearchRoots = [
  'resources',
  'bin',
  '.danbi/electron-release',
  'dist-electron',
  'public',
];
const skippedDirectories = new Set([
  '.git',
  '.next',
  '.danbi',
  'coverage',
  'dist',
  'build',
  'node_modules',
  'public/cache',
  'public/imports',
  'public/outputs',
  'public/temp',
  'third_party/source-mirrors',
]);

const blockedMainSourcePatterns = [
  { label: 'Shotcut source marker', pattern: /\bShotcut\b/ },
  { label: 'Shotcut upstream URL', pattern: /mltframework\/shotcut/i },
  { label: 'GPL license text', pattern: /GNU General Public License/i },
  { label: 'AGPL license text', pattern: /GNU Affero General Public License/i },
  { label: 'GPL/AGPL SPDX identifier', pattern: /SPDX-License-Identifier:\s*(?:AGPL|GPL)-/i },
  { label: 'GPL/AGPL license identifier', pattern: /\b(?:AGPL|GPL)-\d(?:\.\d)?(?:-(?:only|or-later))?\b/i },
  { label: 'GPL source header', pattern: /This program is free software: you can redistribute it and\/or modify it/i },
  { label: 'Shotcut QML import', pattern: /import\s+Shotcut(?:\.|$|\s)/ },
  { label: 'Shotcut QML namespace', pattern: /Shotcut\./ },
  { label: 'MLT C++ namespace', pattern: /\bMlt::/ },
  { label: 'Shotcut COPYING reference', pattern: /\bCOPYING\b.*\bGPL/i },
  { label: 'Source mirror runtime reference', pattern: /third_party[\\/]+source-mirrors/i },
];

const releaseStandaloneRoots = [
  '.next/standalone',
  'release/electron/win-unpacked/resources/renderer/standalone',
];

const blockedReleaseStandalonePaths = [
  '.env',
  '.git',
  '.logs',
  '.next/cache',
  '.next/dev',
  '.next/diagnostics',
  '.next/types',
  '.next-dev.err.log',
  '.next-dev.out.log',
  '.danbi',
  'coverage',
  'dev-server.combined.log',
  'dev-server.err.log',
  'dev-server.out.log',
  'dist-electron',
  'electron-builder.yml',
  'next-env.d.ts',
  'package-lock.json',
  'plan-template.md',
  'playwright-report',
  'release',
  'scripts',
  'src',
  'test-results',
  'tests',
  'third_party',
];

const allowedAdaptedSources = [
  {
    source: 'OpenCut Classic',
    commit: 'cf5e79e919144200294fb9fed22a222592a0aeea',
    license: 'MIT',
  },
  {
    source: 'OpenCut',
    commit: 'a5888e2087c125767a394dc7fe5b919ba503ae57',
    license: 'MIT',
  },
];

const failures = [];
const warnings = [];

function toPosix(relativePath) {
  return relativePath.split(path.sep).join('/');
}

function readText(relativePath) {
  return readFileSync(path.join(rootDir, relativePath), 'utf8');
}

function loadSourceMirrorLock() {
  const lock = JSON.parse(readText(sourceMirrorLockPath));
  if (!Array.isArray(lock.mirrors)) {
    throw new Error(`${sourceMirrorLockPath} must contain a mirrors array.`);
  }

  return lock.mirrors.map((mirror) => ({
    name: mirror.name,
    path: mirror.localPath,
    remoteUrl: mirror.remoteUrl,
    commit: mirror.auditCommit,
    license: mirror.license,
    licenseFile: mirror.licenseFile,
    licenseTerms: mirror.requiredLicenseTerms,
    allowedUse: mirror.allowedUse,
    distributionBoundary: mirror.distributionBoundary,
  }));
}

function assert(condition, message) {
  if (!condition) {
    failures.push(message);
  }
}

function warn(message) {
  warnings.push(message);
}

function isSkippedDirectory(relativePath) {
  const normalized = toPosix(relativePath);
  return skippedDirectories.has(normalized);
}

function walkFiles(relativeRoot) {
  const absoluteRoot = path.join(rootDir, relativeRoot);
  if (!existsSync(absoluteRoot)) {
    return [];
  }

  const results = [];
  const stack = [absoluteRoot];

  while (stack.length > 0) {
    const current = stack.pop();
    const currentRelative = path.relative(rootDir, current);

    if (currentRelative && isSkippedDirectory(currentRelative)) {
      continue;
    }

    for (const entry of readdirSync(current)) {
      const absoluteEntry = path.join(current, entry);
      const relativeEntry = path.relative(rootDir, absoluteEntry);
      const stats = statSync(absoluteEntry);

      if (stats.isDirectory()) {
        if (!isSkippedDirectory(relativeEntry)) {
          stack.push(absoluteEntry);
        }
        continue;
      }

      if (stats.isFile()) {
        results.push(relativeEntry);
      }
    }
  }

  return results;
}

function findFiles(directory, predicate) {
  const files = [];
  const stack = [directory];

  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules') {
          stack.push(entryPath);
        }
        continue;
      }
      if (entry.isFile() && predicate(entryPath)) {
        files.push(entryPath);
      }
    }
  }

  return files;
}

function git(args, options = {}) {
  return spawnSync('git', args, {
    cwd: options.cwd ?? rootDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function checkRequiredDocuments() {
  for (const relativePath of requiredDocs) {
    assert(existsSync(path.join(rootDir, relativePath)), `Missing required license document: ${relativePath}`);
  }
}

function checkSourceMirrorLock() {
  const lock = JSON.parse(readText(sourceMirrorLockPath));
  const requiredIds = new Set(['opencut', 'opencut-classic', 'shotcut']);

  assert(lock.schemaVersion === 1, `${sourceMirrorLockPath} must use schemaVersion 1.`);
  assert(
    typeof lock.verifiedAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(lock.verifiedAt),
    `${sourceMirrorLockPath} must record a YYYY-MM-DD verifiedAt date.`,
  );
  assert(
    typeof lock.purpose === 'string' && lock.purpose.includes('not Danbi runtime'),
    `${sourceMirrorLockPath} must state that mirrors are not runtime/build/package inputs.`,
  );
  assert(
    Array.isArray(lock.mirrors) && lock.mirrors.length === requiredIds.size,
    `${sourceMirrorLockPath} must list the expected OpenCut, OpenCut Classic, and Shotcut mirrors.`,
  );

  for (const mirror of lock.mirrors ?? []) {
    assert(requiredIds.has(mirror.id), `${sourceMirrorLockPath} contains unexpected mirror id: ${mirror.id}`);
    requiredIds.delete(mirror.id);

    assert(typeof mirror.name === 'string' && mirror.name.length > 0, `${mirror.id} mirror is missing a name.`);
    assert(
      typeof mirror.remoteUrl === 'string' && /^https:\/\/github\.com\/.+\.git$/.test(mirror.remoteUrl),
      `${mirror.id} mirror must use an https GitHub .git remote URL.`,
    );
    assert(
      typeof mirror.officialLicenseUrl === 'string' && mirror.officialLicenseUrl.startsWith('https://github.com/'),
      `${mirror.id} mirror must record the official GitHub license URL.`,
    );
    assert(
      typeof mirror.localPath === 'string' && mirror.localPath.startsWith('third_party/source-mirrors/'),
      `${mirror.id} mirror must stay under third_party/source-mirrors/.`,
    );
    assert(
      typeof mirror.auditCommit === 'string' && /^[0-9a-f]{40}$/i.test(mirror.auditCommit),
      `${mirror.id} mirror must pin a 40-character audit commit.`,
    );
    assert(typeof mirror.license === 'string' && mirror.license.length > 0, `${mirror.id} mirror is missing license.`);
    assert(
      typeof mirror.licenseFile === 'string' && mirror.licenseFile.length > 0,
      `${mirror.id} mirror is missing licenseFile.`,
    );
    assert(
      Array.isArray(mirror.requiredLicenseTerms) && mirror.requiredLicenseTerms.length > 0,
      `${mirror.id} mirror must include requiredLicenseTerms.`,
    );
    assert(
      Array.isArray(mirror.allowedUse) && mirror.allowedUse.length > 0,
      `${mirror.id} mirror must include allowedUse.`,
    );
    assert(
      Array.isArray(mirror.requiredDanbiRecords) && mirror.requiredDanbiRecords.length > 0,
      `${mirror.id} mirror must include requiredDanbiRecords.`,
    );
    assert(
      typeof mirror.distributionBoundary === 'string' && mirror.distributionBoundary.length > 0,
      `${mirror.id} mirror must describe its distributionBoundary.`,
    );

    if (mirror.license === 'MIT') {
      assert(
        mirror.allowedUse.includes('Direct Copy') && mirror.allowedUse.includes('Adapted Copy'),
        `${mirror.id} MIT mirror must allow Direct Copy and Adapted Copy with records.`,
      );
      assert(
        mirror.requiredDanbiRecords.includes('docs/THIRD_PARTY_SOURCE_REGISTER_KR.md') &&
          mirror.requiredDanbiRecords.includes('third_party/NOTICE.md'),
        `${mirror.id} MIT mirror must require source register and NOTICE records.`,
      );
      assert(
        mirror.distributionBoundary.includes('MIT notice'),
        `${mirror.id} MIT mirror boundary must require MIT notice preservation.`,
      );
    }

    if (/GPL/i.test(mirror.license)) {
      assert(
        !mirror.allowedUse.includes('Direct Copy') && !mirror.allowedUse.includes('Adapted Copy'),
        `${mirror.id} GPL mirror cannot allow Direct Copy or Adapted Copy into Danbi main source.`,
      );
      assert(
        mirror.allowedUse.includes('Reference Only') &&
          mirror.allowedUse.includes('Clean-room Reimplementation') &&
          mirror.allowedUse.includes('External GPL Process'),
        `${mirror.id} GPL mirror must be limited to reference-only, clean-room, or external GPL process usage.`,
      );
      assert(
        mirror.distributionBoundary.includes('Do not copy'),
        `${mirror.id} GPL mirror boundary must explicitly prohibit direct source copying.`,
      );
    }
  }

  assert(requiredIds.size === 0, `${sourceMirrorLockPath} is missing mirrors: ${Array.from(requiredIds).join(', ')}`);
}

function checkRootPackagePublishBoundary() {
  const packageJson = JSON.parse(readText('package.json'));
  assert(packageJson.private === true, 'package.json must keep Danbi Studio private until a distribution license is chosen.');
  assert(
    packageJson.license === 'UNLICENSED',
    'package.json license must stay UNLICENSED until the Danbi Studio distribution license is chosen.',
  );

  const packageLock = JSON.parse(readText('package-lock.json'));
  const rootPackage = packageLock.packages?.[''];
  assert(rootPackage?.private === true, 'package-lock.json root package must keep private: true.');
  assert(rootPackage?.license === 'UNLICENSED', 'package-lock.json root package must keep license: UNLICENSED.');

  const scriptText = Object.values(packageJson.scripts ?? {}).join('\n');
  assert(
    !/third_party[\\/]+source-mirrors/i.test(scriptText),
    'package.json scripts must not build, run, import, or bundle third_party/source-mirrors directly.',
  );
}

function checkSourceMirrorGitBoundary() {
  const ignoreFile = readText('.gitignore');
  assert(
    ignoreFile.includes('third_party/source-mirrors/'),
    '.gitignore must keep third_party/source-mirrors/ out of the Danbi repository.',
  );

  for (const mirror of sourceMirrorCommits) {
    const ignored = git(['check-ignore', '--quiet', mirror.path]);
    assert(
      ignored.status === 0,
      `${mirror.path} must be ignored by Git. Source mirrors are local audit references, not Danbi source.`,
    );
  }

  const trackedMirrors = git(['ls-files', 'third_party/source-mirrors']);
  if (trackedMirrors.status === 0) {
    const tracked = trackedMirrors.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    assert(tracked.length === 0, `Source mirror files are tracked by Git: ${tracked.join(', ')}`);
  } else {
    warn(`Could not verify tracked source mirrors: ${trackedMirrors.stderr.trim()}`);
  }

  if (existsSync(path.join(rootDir, '.gitmodules'))) {
    const gitmodules = readText('.gitmodules');
    assert(
      !/third_party[\\/]+source-mirrors/i.test(gitmodules),
      '.gitmodules must not register third_party/source-mirrors as submodules.',
    );
    assert(
      !/mltframework[\\/]+shotcut|github\.com[:/]+mltframework[\\/]+shotcut/i.test(gitmodules),
      'Shotcut GPL source must not be attached to the main app through .gitmodules without a documented GPL boundary.',
    );
  }
}

function checkMirrorCommitsWhenPresent() {
  for (const mirror of sourceMirrorCommits) {
    const mirrorPath = path.join(rootDir, mirror.path);
    if (!existsSync(mirrorPath)) {
      warn(`${mirror.name} mirror is absent; skipping local commit verification for ${mirror.path}.`);
      continue;
    }

    const head = git(['rev-parse', 'HEAD'], { cwd: mirrorPath });
    assert(head.status === 0, `${mirror.name} mirror is not a valid git repository at ${mirror.path}.`);
    if (head.status !== 0) {
      continue;
    }

    const actualCommit = head.stdout.trim();
    assert(
      actualCommit === mirror.commit,
      `${mirror.name} mirror commit mismatch. Expected ${mirror.commit}, got ${actualCommit}.`,
    );

    const remote = git(['remote', 'get-url', 'origin'], { cwd: mirrorPath });
    assert(remote.status === 0, `${mirror.name} mirror is missing an origin remote.`);
    if (remote.status === 0) {
      assert(
        remote.stdout.trim() === mirror.remoteUrl,
        `${mirror.name} mirror origin mismatch. Expected ${mirror.remoteUrl}, got ${remote.stdout.trim()}.`,
      );
    }

    const licensePath = path.join(mirrorPath, mirror.licenseFile);
    assert(existsSync(licensePath), `${mirror.name} mirror is missing license file ${mirror.licenseFile}.`);
    if (existsSync(licensePath)) {
      const licenseText = readFileSync(licensePath, 'utf8');
      for (const term of mirror.licenseTerms) {
        assert(
          licenseText.includes(term),
          `${mirror.name} mirror license file ${mirror.licenseFile} is missing required term: ${term}`,
        );
      }
    }
  }
}

function checkCompilerAndTestExcludes() {
  const tsconfig = readText('tsconfig.json');
  const vitestConfig = readText('vitest.config.ts');
  const eslintConfig = readText('eslint.config.mjs');

  assert(
    tsconfig.includes('"third_party/source-mirrors"'),
    'tsconfig.json must exclude third_party/source-mirrors.',
  );
  assert(
    vitestConfig.includes('**/third_party/source-mirrors/**'),
    'vitest.config.ts must exclude third_party/source-mirrors.',
  );
  assert(
    eslintConfig.includes('third_party/source-mirrors/**'),
    'eslint.config.mjs must ignore third_party/source-mirrors.',
  );
}

function checkElectronPackagingBoundary() {
  const electronBuilderConfig = readText('electron-builder.yml');
  const requiredPackageInputs = [
    'dist-electron/**/*',
    'package.json',
    '.next/standalone',
    'renderer/standalone',
    '.danbi/electron-release/samples',
    'samples',
  ];

  for (const term of requiredPackageInputs) {
    assert(electronBuilderConfig.includes(term), `electron-builder.yml is missing expected package input: ${term}`);
  }

  assert(
    !/\bthird_party\b|source-mirrors/i.test(electronBuilderConfig),
    'electron-builder.yml must not package third_party/source-mirrors or other source mirror paths.',
  );
}

function checkRegisterAndNotice() {
  const register = readText('docs/THIRD_PARTY_SOURCE_REGISTER_KR.md');
  const notice = readText('third_party/NOTICE.md');

  for (const id of expectedRegisterIds) {
    assert(register.includes(id), `Missing third-party source register entry: ${id}`);
  }

  for (const term of expectedNoticeTerms) {
    assert(notice.includes(term), `third_party/NOTICE.md is missing required term: ${term}`);
  }

  for (const importedFile of requiredImportedFiles) {
    assert(register.includes(importedFile), `Source register is missing imported file: ${importedFile}`);
    assert(notice.includes(importedFile), `third_party/NOTICE.md is missing imported file: ${importedFile}`);
  }
}

function checkShotcutBoundaryDecision() {
  const register = readText('docs/THIRD_PARTY_SOURCE_REGISTER_KR.md');
  const boundary = readText('docs/SHOTCUT_GPL_BOUNDARY_KR.md');
  const compliance = readText('docs/THIRD_PARTY_LICENSE_COMPLIANCE_KR.md');
  const decisionLog = readText('docs/THIRD_PARTY_LICENSE_DECISION_LOG_KR.md');
  const guardrails = readText('docs/LICENSE_GUARDRAILS_KR.md');

  const requiredBoundaryTerms = [
    'Reference Only',
    'Clean-room Reimplementation',
    'External GPL Process',
    'third_party/source-mirrors/shotcut',
    'Import mode',
    'Direct Copy',
    'Adapted Copy',
    'Submodule/Package',
  ];

  for (const term of requiredBoundaryTerms) {
    assert(boundary.includes(term), `Shotcut GPL boundary document is missing required term: ${term}`);
  }

  assert(
    compliance.includes('docs/SHOTCUT_GPL_BOUNDARY_KR.md'),
    'License compliance document must link to docs/SHOTCUT_GPL_BOUNDARY_KR.md.',
  );
  assert(
    guardrails.includes('OpenCut / OpenCut Classic: MIT') &&
      guardrails.includes('Shotcut: GPLv3') &&
      guardrails.includes('Reference Only') &&
      guardrails.includes('Clean-room') &&
      guardrails.includes('External GPL Process') &&
      guardrails.includes('third_party/source-mirrors.lock.json') &&
      guardrails.includes('npm run license:check'),
    'License guardrails document must record MIT reuse, Shotcut GPL handling, and the license check command.',
  );
  assert(
    decisionLog.includes('Shotcut') &&
      decisionLog.includes('GPLv3') &&
      decisionLog.includes('Reference Only') &&
      decisionLog.includes('Clean-room Reimplementation') &&
      decisionLog.includes('External GPL Process'),
    'Third-party license decision log must record the Shotcut GPL boundary decision.',
  );
  assert(
    decisionLog.includes('OpenCut') &&
      decisionLog.includes('OpenCut Classic') &&
      decisionLog.includes('MIT') &&
      decisionLog.includes('third_party/source-mirrors/opencut') &&
      decisionLog.includes('third_party/source-mirrors/shotcut'),
    'Third-party license decision log must record OpenCut/OpenCut Classic MIT handling and local mirror paths.',
  );

  const prohibitedShotcutRegisterModes =
    /Source:\s*Shotcut[\s\S]{0,900}Import mode:\s*(Direct Copy|Adapted Copy|Submodule\/Package)/i;
  assert(
    !prohibitedShotcutRegisterModes.test(register),
    'Shotcut register entry cannot use Direct Copy, Adapted Copy, or Submodule/Package in the main app.',
  );
}

function checkCurrentLicensePolicyDocument() {
  const policy = readText('docs/THIRD_PARTY_LICENSE_POLICY_KR.md');
  const requiredTerms = [
    'OpenCut',
    'OpenCut Classic',
    'Shotcut',
    'MIT',
    'GPLv3',
    'Reference Only',
    'Clean-room Reimplementation',
    'External GPL Process',
    'third_party/source-mirrors/opencut',
    'third_party/source-mirrors/opencut-classic',
    'third_party/source-mirrors/shotcut',
    'third_party/source-mirrors.lock.json',
    'npm run license:check',
    'a5888e2087c125767a394dc7fe5b919ba503ae57',
    'cf5e79e919144200294fb9fed22a222592a0aeea',
    '9516f143e5c1e432d2088e91d2657c75bf6710e7',
  ];

  for (const term of requiredTerms) {
    assert(policy.includes(term), `Current license policy document is missing required term: ${term}`);
  }
}

function checkOfficialLicenseSourcesDocument() {
  const sources = readText('docs/THIRD_PARTY_LICENSE_SOURCES_KR.md');
  const requiredTerms = [
    '2026-06-15',
    'https://github.com/opencut-app/opencut',
    'https://github.com/opencut-app/opencut/blob/main/LICENSE',
    'https://github.com/opencut-app/opencut-classic',
    'https://github.com/opencut-app/opencut-classic/blob/main/LICENSE',
    'https://github.com/mltframework/shotcut',
    'https://github.com/mltframework/shotcut/blob/master/COPYING',
    'MIT',
    'GPLv3',
    'Reference Only',
    'Clean-room Reimplementation',
    'External GPL Process',
    'third_party/source-mirrors/opencut',
    'third_party/source-mirrors/opencut-classic',
    'third_party/source-mirrors/shotcut',
    'third_party/source-mirrors.lock.json',
    'a5888e2087c125767a394dc7fe5b919ba503ae57',
    'cf5e79e919144200294fb9fed22a222592a0aeea',
    '9516f143e5c1e432d2088e91d2657c75bf6710e7',
    'npm run license:check',
  ];

  for (const term of requiredTerms) {
    assert(sources.includes(term), `Official license sources document is missing required term: ${term}`);
  }
}

function checkSourceReuseIntakeChecklist() {
  const checklist = readText('docs/SOURCE_REUSE_INTAKE_CHECKLIST_KR.md');
  const requiredTerms = [
    'OpenCut',
    'OpenCut Classic',
    'Shotcut',
    'MIT',
    'GPLv3',
    'Direct Copy',
    'Adapted Copy',
    'Reference Only',
    'Clean-room Reimplementation',
    'External GPL Process',
    'third_party/source-mirrors.lock.json',
    'docs/THIRD_PARTY_SOURCE_REGISTER_KR.md',
    'third_party/NOTICE.md',
    'npm run license:check',
    'git diff --check',
  ];

  for (const term of requiredTerms) {
    assert(checklist.includes(term), `Source reuse intake checklist is missing required term: ${term}`);
  }
}

function collectFfmpegBinaryFiles() {
  return ffmpegBinarySearchRoots
    .flatMap((root) => walkFiles(root))
    .filter((relativePath) => /(?:^|[\\/])ff(?:mpeg|probe)(?:\.exe)?$/i.test(relativePath));
}

function checkFfmpegBinaryBoundary() {
  const boundary = readText('docs/FFMPEG_BINARY_LICENSE_BOUNDARY_KR.md');
  const notice = readText('third_party/FFMPEG_BINARY_NOTICE.md');
  const compliance = readText('docs/THIRD_PARTY_LICENSE_COMPLIANCE_KR.md');
  const decisionLog = readText('docs/THIRD_PARTY_LICENSE_DECISION_LOG_KR.md');

  const requiredBoundaryTerms = [
    'FFmpeg',
    'FFprobe',
    'https://ffmpeg.org/legal.html',
    'LGPL',
    'GPL',
    '--enable-gpl',
    '--enable-nonfree',
    'third_party/FFMPEG_BINARY_NOTICE.md',
    'npm run license:check',
  ];

  for (const term of requiredBoundaryTerms) {
    assert(boundary.includes(term), `FFmpeg binary boundary document is missing required term: ${term}`);
  }

  assert(
    compliance.includes('docs/FFMPEG_BINARY_LICENSE_BOUNDARY_KR.md') &&
      compliance.includes('third_party/FFMPEG_BINARY_NOTICE.md'),
    'License compliance document must link to the FFmpeg binary boundary and notice files.',
  );
  assert(
    decisionLog.includes('FFmpeg') &&
      decisionLog.includes('FFprobe') &&
      decisionLog.includes('Bundled status: none') &&
      decisionLog.includes('--enable-nonfree'),
    'Third-party license decision log must record the FFmpeg binary bundling decision.',
  );

  const bundledFfmpegFiles = collectFfmpegBinaryFiles();
  if (bundledFfmpegFiles.length > 0) {
    const requiredNoticeTerms = [
      'Bundled status: present',
      'FFmpeg version',
      'checksum',
      'configure line',
      'license mode',
      'source offer',
    ];

    for (const term of requiredNoticeTerms) {
      assert(
        notice.includes(term),
        `Bundled FFmpeg/FFprobe binaries were found (${bundledFfmpegFiles.join(', ')}), but ${term} is missing from third_party/FFMPEG_BINARY_NOTICE.md.`,
      );
    }
    assert(
      !/--enable-nonfree\s*:\s*(yes|true|present|included)/i.test(notice),
      'Bundled FFmpeg notice cannot mark --enable-nonfree as included.',
    );
    return;
  }

  assert(
    notice.includes('Bundled status: none'),
    'third_party/FFMPEG_BINARY_NOTICE.md must state Bundled status: none when no FFmpeg/FFprobe binary is bundled.',
  );
}

function checkAdaptedSourceHeaders() {
  const sourceFiles = runtimeSourceRoots.flatMap((root) => walkFiles(root));
  const register = readText('docs/THIRD_PARTY_SOURCE_REGISTER_KR.md');
  const notice = readText('third_party/NOTICE.md');

  for (const relativePath of requiredAdaptedSourceHeaderFiles) {
    assert(existsSync(path.join(rootDir, relativePath)), `Missing declared adapted-source file: ${relativePath}`);
    if (!existsSync(path.join(rootDir, relativePath))) {
      continue;
    }

    const text = readText(relativePath);
    assert(
      text.includes('Adapted from'),
      `${toPosix(relativePath)} is a declared MIT adapted-source file but is missing an Adapted from header.`,
    );
  }

  for (const relativePath of sourceFiles) {
    if (!/\.(cjs|cts|js|jsx|mjs|mts|ts|tsx)$/.test(relativePath)) {
      continue;
    }

    const text = readText(relativePath);
    if (!text.includes('Adapted from')) {
      continue;
    }

    const source = allowedAdaptedSources.find((candidate) => text.includes(candidate.source));
    assert(source, `${toPosix(relativePath)} has an Adapted from header with an unapproved source.`);
    if (!source) {
      continue;
    }

    assert(text.includes(`Commit: ${source.commit}`), `${toPosix(relativePath)} is missing source commit header.`);
    assert(text.includes(`License: ${source.license}`), `${toPosix(relativePath)} is missing source license header.`);
    assert(
      text.includes('third_party/NOTICE.md') && text.includes('docs/THIRD_PARTY_SOURCE_REGISTER_KR.md'),
      `${toPosix(relativePath)} must point to NOTICE and the source register.`,
    );
    assert(register.includes(toPosix(relativePath)), `${toPosix(relativePath)} is missing from source register.`);
    assert(notice.includes(toPosix(relativePath)), `${toPosix(relativePath)} is missing from third_party/NOTICE.md.`);
  }
}

function checkOpenCutReferencesAreRegistered() {
  const sourceFiles = runtimeSourceRoots.flatMap((root) => walkFiles(root));

  for (const relativePath of sourceFiles) {
    if (!/\.(cjs|cts|js|jsx|mjs|mts|ts|tsx)$/.test(relativePath)) {
      continue;
    }

    const text = readText(relativePath);
    if (!/\bOpenCut\b/.test(text)) {
      continue;
    }

    assert(
      text.includes('Adapted from') &&
        text.includes('Commit:') &&
        text.includes('License: MIT') &&
        text.includes('third_party/NOTICE.md') &&
        text.includes('docs/THIRD_PARTY_SOURCE_REGISTER_KR.md'),
      `${toPosix(relativePath)} references OpenCut but is missing the required adapted-source license header.`,
    );
  }
}

function checkNoGPLSourceInMainCode() {
  const sourceFiles = runtimeSourceRoots.flatMap((root) => walkFiles(root));

  for (const relativePath of sourceFiles) {
    if (!/\.(c|cc|cpp|cxx|h|hpp|js|jsx|mjs|mts|qml|rs|ts|tsx)$/.test(relativePath)) {
      continue;
    }

    const text = readText(relativePath);
    for (const blocked of blockedMainSourcePatterns) {
      const match = text.match(blocked.pattern);
      if (match) {
        failures.push(
          `${blocked.label} found in main source ${toPosix(relativePath)}. ` +
            'Shotcut/GPL code must stay reference-only, clean-room, or behind a separate GPL boundary.',
        );
      }
    }
  }
}

function checkReleaseStandaloneArtifactBoundary() {
  for (const relativeRoot of releaseStandaloneRoots) {
    const standaloneRoot = path.join(rootDir, relativeRoot);
    if (!existsSync(standaloneRoot)) {
      continue;
    }

    for (const blockedPath of blockedReleaseStandalonePaths) {
      const target = path.join(standaloneRoot, blockedPath);
      assert(
        !existsSync(target),
        `Development or source artifact leaked into release standalone output: ${toPosix(path.relative(rootDir, target))}`,
      );
    }

    checkReleaseStandalonePackageMetadata(relativeRoot, standaloneRoot);
    checkReleaseStandaloneServerBundle(relativeRoot, standaloneRoot);
    checkReleaseStandaloneTraceFiles(relativeRoot, standaloneRoot);
  }
}

function checkReleaseStandalonePackageMetadata(relativeRoot, standaloneRoot) {
  const packageJsonPath = path.join(standaloneRoot, 'package.json');
  if (!existsSync(packageJsonPath)) {
    return;
  }

  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  assert(
    packageJson.main === 'server.js',
    `${relativeRoot}/package.json must use server.js as the runtime main entry.`,
  );
  assert(
    !packageJson.devDependencies,
    `${relativeRoot}/package.json must not include devDependencies in release output.`,
  );
  assert(
    JSON.stringify(packageJson.scripts ?? {}) === JSON.stringify({ start: 'node server.js' }),
    `${relativeRoot}/package.json must expose only the runtime start script.`,
  );
}

function checkReleaseStandaloneServerBundle(relativeRoot, standaloneRoot) {
  const serverPath = path.join(standaloneRoot, 'server.js');
  if (!existsSync(serverPath)) {
    return;
  }

  const serverBundle = readFileSync(serverPath, 'utf8');
  const buildRootMarkers = [
    rootDir,
    rootDir.replace(/\\/g, '\\\\'),
    rootDir.replace(/\\/g, '/'),
  ];

  for (const marker of buildRootMarkers) {
    assert(
      !marker || !serverBundle.includes(marker),
      `${relativeRoot}/server.js leaked build root marker: ${marker}`,
    );
  }
}

function checkReleaseStandaloneTraceFiles(relativeRoot, standaloneRoot) {
  const traceFiles = findFiles(standaloneRoot, (filePath) => filePath.endsWith('.nft.json'));
  for (const traceFile of traceFiles) {
    const trace = JSON.parse(readFileSync(traceFile, 'utf8'));
    if (!Array.isArray(trace.files)) {
      continue;
    }

    for (const entry of trace.files) {
      if (typeof entry !== 'string') {
        continue;
      }

      const blockedReason = describeBlockedReleaseTraceEntry(entry, traceFile, standaloneRoot);
      assert(
        !blockedReason,
        `${relativeRoot} trace ${toPosix(path.relative(standaloneRoot, traceFile))} includes ${blockedReason}: ${entry}`,
      );
    }
  }
}

function describeBlockedReleaseTraceEntry(entry, traceFile, standaloneRoot) {
  if (/\.private\.pem(?:$|[\\/])/i.test(entry)) {
    return 'a private key path';
  }

  const resolvedEntryPath = path.resolve(path.dirname(traceFile), entry);
  const relativeToStandalone = path.relative(standaloneRoot, resolvedEntryPath);
  const candidates = [
    stripParentSegmentsForRelease(normalizeSlashPath(entry)),
    normalizeSlashPath(relativeToStandalone),
  ];
  if (relativeToStandalone.startsWith('..') || path.isAbsolute(relativeToStandalone)) {
    candidates.push(normalizeSlashPath(path.relative(rootDir, resolvedEntryPath)));
  }

  for (const candidate of candidates) {
    if (isBlockedReleaseStandalonePath(candidate)) {
      return `blocked release path ${candidate}`;
    }
  }

  return '';
}

function isBlockedReleaseStandalonePath(relativePath) {
  if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    return false;
  }
  return blockedReleaseStandalonePaths.some((blockedPath) => {
    const normalizedBlockedPath = normalizeSlashPath(blockedPath);
    return relativePath === normalizedBlockedPath || relativePath.startsWith(`${normalizedBlockedPath}/`);
  });
}

function stripParentSegmentsForRelease(filePath) {
  return filePath.replace(/^(?:\.\.\/)+/, '');
}

function normalizeSlashPath(filePath) {
  return filePath.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
}

checkRequiredDocuments();
checkSourceMirrorLock();
checkRootPackagePublishBoundary();
checkSourceMirrorGitBoundary();
checkMirrorCommitsWhenPresent();
checkCompilerAndTestExcludes();
checkElectronPackagingBoundary();
checkRegisterAndNotice();
checkShotcutBoundaryDecision();
checkCurrentLicensePolicyDocument();
checkOfficialLicenseSourcesDocument();
checkSourceReuseIntakeChecklist();
checkFfmpegBinaryBoundary();
checkAdaptedSourceHeaders();
checkOpenCutReferencesAreRegistered();
checkNoGPLSourceInMainCode();
checkReleaseStandaloneArtifactBoundary();

if (warnings.length > 0) {
  console.warn('Third-party compliance warnings:');
  for (const warning of warnings) {
    console.warn(`- ${warning}`);
  }
}

if (failures.length > 0) {
  console.error('Third-party compliance check failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Third-party compliance check passed.');
