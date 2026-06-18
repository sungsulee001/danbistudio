import {
  formatRenderWorkerDaemonHelp,
  formatRenderWorkerDaemonStarted,
  parseRenderWorkerDaemonCliArgs,
  startRenderWorkerDaemon,
} from '../src/electron/main/render-worker-daemon';

async function main() {
  const options = parseRenderWorkerDaemonCliArgs(process.argv.slice(2));

  if (options.help) {
    console.log(formatRenderWorkerDaemonHelp());
    return;
  }

  const daemon = await startRenderWorkerDaemon({
    host: options.host,
    port: options.port,
    workerId: options.workerId,
    dryRun: options.dryRun,
    executeBlocked: options.executeBlocked,
    maxConcurrentRuns: options.maxConcurrentRuns,
    runLeaseSeconds: options.runLeaseSeconds,
    authToken: options.authToken,
    discovery: options.discovery,
    discoveryPort: options.discoveryPort,
  });

  console.log(formatRenderWorkerDaemonStarted(daemon.snapshot()));

  const close = async () => {
    await daemon.close();
    process.exit(0);
  };

  process.once('SIGINT', () => {
    void close();
  });
  process.once('SIGTERM', () => {
    void close();
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
