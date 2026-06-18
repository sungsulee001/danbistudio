import {
  formatExternalExporterHelp,
  formatExternalExporterRunReport,
  loadExternalExporterHandoffManifest,
  parseExternalExporterCliArgs,
  runExternalExporterHandoffManifest,
  writeExternalExporterRunReport,
} from '../src/electron/main/external-exporter-runner';

async function main(): Promise<void> {
  const options = parseExternalExporterCliArgs(process.argv.slice(2));

  if (options.help) {
    console.log(formatExternalExporterHelp());
    return;
  }

  if (!options.handoffPath) {
    throw new Error('Missing required --handoff <danbi-external-export-handoff.json>.');
  }

  if (!options.dryRun && !options.writerExecutable) {
    throw new Error('External exporter execution requires --writer <executable>, or use --dry-run to validate only.');
  }

  const manifest = await loadExternalExporterHandoffManifest(options.handoffPath);
  const writerCommand = options.writerExecutable
    ? {
        executable: options.writerExecutable,
        args: options.writerArgs,
        cwd: options.writerCwd ?? '',
      }
    : undefined;
  const report = await runExternalExporterHandoffManifest({
    manifest,
    handoffPath: options.handoffPath,
    rootDirectory: options.rootDirectory,
    workerId: options.workerId,
    profileIds: options.profileIds,
    dryRun: options.dryRun,
    writerCommand,
    timeoutMs: options.timeoutMs,
  });

  if (options.reportPath) {
    await writeExternalExporterRunReport(report, options.reportPath);
  }

  console.log(formatExternalExporterRunReport(report));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
