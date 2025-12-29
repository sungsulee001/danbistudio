/**
 * Result Handler
 *
 * Handles copying and managing generated files from ComfyUI output directory
 */

import { copyFileSync, existsSync, mkdirSync } from 'fs';
import { join, basename } from 'path';

export interface ResultInfo {
  originalPath: string;
  savedPath: string;
  filename: string;
}

/**
 * Copy result file from ComfyUI output to public/outputs
 */
export async function saveResultFile(
  comfyuiOutputPath: string,
  jobId: string
): Promise<ResultInfo> {
  // Ensure output directory exists
  const outputDir = join(process.cwd(), 'public', 'outputs');
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  // Check if source file exists
  if (!existsSync(comfyuiOutputPath)) {
    throw new Error(`Source file not found: ${comfyuiOutputPath}`);
  }

  // Generate filename with job ID
  const originalFilename = basename(comfyuiOutputPath);
  const extension = originalFilename.split('.').pop();
  const newFilename = `${jobId}_${Date.now()}.${extension}`;
  const savedPath = join(outputDir, newFilename);

  // Copy file
  copyFileSync(comfyuiOutputPath, savedPath);

  return {
    originalPath: comfyuiOutputPath,
    savedPath: `/outputs/${newFilename}`,
    filename: newFilename
  };
}

/**
 * Extract output file path from ComfyUI prompt outputs
 */
export function extractOutputPath(outputs: any): string | null {
  if (!outputs) return null;

  // ComfyUI outputs structure: { "node_id": { "images": [...], "videos": [...] } }
  for (const nodeId in outputs) {
    const nodeOutput = outputs[nodeId];

    // Check for videos first (for WAN I2V)
    if (nodeOutput.videos && nodeOutput.videos.length > 0) {
      const video = nodeOutput.videos[0];
      // video structure: { filename: "...", subfolder: "...", type: "output" }
      return video.filename;
    }

    // Check for images
    if (nodeOutput.images && nodeOutput.images.length > 0) {
      const image = nodeOutput.images[0];
      return image.filename;
    }
  }

  return null;
}

/**
 * Get full path to ComfyUI output file
 */
export function getComfyUIOutputPath(filename: string): string {
  const comfyuiOutput = process.env.COMFYUI_OUTPUT || 'E:/ai_tool/StabilityMatrix/Data/Packages/DanbiStudio-ComfyUI/output';
  return join(comfyuiOutput, filename);
}
