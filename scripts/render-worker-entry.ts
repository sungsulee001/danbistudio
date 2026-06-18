import {
  formatRenderWorkerHelp,
  formatRenderWorkerRunReport,
  loadRenderWorkerHandoffManifest,
  parseRenderWorkerCliArgs,
  runRenderWorkerHandoffManifest,
  writeRenderWorkerRunReport,
} from '../src/electron/main/render-worker-runner';

async function main() {
  const options = parseRenderWorkerCliArgs(process.argv.slice(2));

  if (options.help) {
    console.log(formatRenderWorkerHelp());
    return;
  }

  if (!options.manifestPath) {
    throw new Error('Missing required --manifest <handoff.json>.');
  }

  const manifest = await loadRenderWorkerHandoffManifest(options.manifestPath);
  const report = await runRenderWorkerHandoffManifest({
    manifest,
    workerId: options.workerId,
    jobIds: options.jobIds,
    dryRun: options.dryRun,
    executeBlocked: options.executeBlocked,
  });

  if (options.reportPath) {
    await writeRenderWorkerRunReport(report, options.reportPath);
  }

  console.log(formatRenderWorkerRunReport(report));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
