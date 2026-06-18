import { join } from 'node:path';
import {
  createDanbiSampleProjectPack,
  verifyDanbiSampleProjectPack,
} from '../src/electron/main/sample-project-pack';

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const packageDirectory = args.out ?? join(process.cwd(), '.danbi', 'sample-project-pack', 'getting-started');
  const workDir = args.work ?? join(process.cwd(), '.danbi', 'sample-project-pack', 'work');
  const renderOutputPath = args.renderOutput ?? join(process.cwd(), '.danbi', 'sample-project-pack', 'verification', 'getting-started.mp4');

  if (!args.verifyOnly) {
    const result = await createDanbiSampleProjectPack({
      packageDirectory,
      workDir,
    });
    console.log(`Sample project pack generated: ${result.packageDirectory}`);
    console.log(`Sample project package: ${result.projectFilePath}`);
    console.log(`Sample tutorial: ${result.tutorialPath}`);
    console.log(`Sample media references copied: ${result.copiedMediaCount}`);
  }

  if (args.verifyOnly || args.verifyRender) {
    const result = await verifyDanbiSampleProjectPack({
      packageDirectory,
      renderOutputPath,
    });
    console.log(`Sample project pack smoke passed: ${result.renderOutputPath}`);
    console.log(`Sample render output: ${result.outputBytes} bytes from ${result.renderInputCount} packaged inputs`);
  }
}

function parseArgs(args: string[]): {
  out?: string;
  work?: string;
  renderOutput?: string;
  verifyRender: boolean;
  verifyOnly: boolean;
} {
  const parsed = {
    out: undefined as string | undefined,
    work: undefined as string | undefined,
    renderOutput: undefined as string | undefined,
    verifyRender: false,
    verifyOnly: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    switch (arg) {
      case '--out':
        parsed.out = readValue(args, index);
        index += 1;
        break;
      case '--work':
        parsed.work = readValue(args, index);
        index += 1;
        break;
      case '--render-output':
        parsed.renderOutput = readValue(args, index);
        index += 1;
        break;
      case '--verify-render':
        parsed.verifyRender = true;
        break;
      case '--verify-only':
        parsed.verifyOnly = true;
        break;
      default:
        throw new Error(`Unknown sample project pack argument: ${arg}`);
    }
  }

  return parsed;
}

function readValue(args: string[], index: number): string {
  const value = args[index + 1];
  if (!value) {
    throw new Error(`Missing value for ${args[index]}`);
  }

  return value;
}
