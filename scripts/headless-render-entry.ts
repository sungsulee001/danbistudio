import {
  buildHeadlessRenderHandoffManifest,
  buildHeadlessRenderRequests,
  formatHeadlessRenderBatchResult,
  formatHeadlessRenderHandoffResult,
  formatHeadlessRenderHelp,
  loadHeadlessRenderProject,
  parseHeadlessRenderCliArgs,
  runHeadlessRenderBatch,
  writeHeadlessRenderHandoffManifest,
} from '../src/electron/main/headless-render-engine';

async function main() {
  const options = parseHeadlessRenderCliArgs(process.argv.slice(2));

  if (options.help) {
    console.log(formatHeadlessRenderHelp());
    return;
  }

  if (!options.projectPath) {
    throw new Error('Missing required --project <project.json>.');
  }

  const project = await loadHeadlessRenderProject(options.projectPath);
  const requests = buildHeadlessRenderRequests({
    project,
    profileIds: options.profileIds,
    allProfiles: options.allProfiles,
    outputDir: options.outputDir,
    batchId: options.batchId,
    exportRange: options.exportRange,
    encoderPreference: options.encoderPreference,
  });

  if (options.handoffPath) {
    const manifest = await buildHeadlessRenderHandoffManifest({
      project,
      requests,
      projectPath: options.projectPath,
      batchId: options.batchId,
    });
    await writeHeadlessRenderHandoffManifest({
      manifest,
      outputPath: options.handoffPath,
    });
    console.log(formatHeadlessRenderHandoffResult(manifest, options.handoffPath));
    return;
  }

  const result = await runHeadlessRenderBatch({
    requests,
    dryRun: options.dryRun,
  });

  console.log(formatHeadlessRenderBatchResult(result));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
