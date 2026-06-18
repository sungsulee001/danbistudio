import { describe, it, expect } from 'vitest';
import { loadWorkflow, injectParameters, listWorkflowSummaries, type Workflow } from '../../src/lib/workflow-loader';

/**
 * Phase 2 GREEN: Workflow Loader Tests
 *
 * Tests for loading and manipulating ComfyUI workflow JSON files
 */

describe('Phase 2: Workflow Loader', () => {
  describe('loadWorkflow', () => {
    it('should throw error for non-existent workflow', () => {
      expect(() => loadWorkflow('non_existent')).toThrow('Workflow file not found');
    });

    it('rejects unsafe workflow names before resolving a file path', () => {
      expect(() => loadWorkflow('../secret')).toThrow('Workflow name must contain only letters');
      expect(() => loadWorkflow('nested/workflow')).toThrow('Workflow name must contain only letters');
    });

    it('keeps the legacy test workflow loadable for old fixtures', () => {
      expect(loadWorkflow('test_workflow')).toEqual(expect.objectContaining({
        '1': expect.objectContaining({
          class_type: 'TestNode',
        }),
      }));
    });
  });

  describe('listWorkflowSummaries', () => {
    it('lists product workflow json files with available input parameters', () => {
      const summaries = listWorkflowSummaries();

      expect(summaries).toEqual(expect.arrayContaining([
        expect.objectContaining({
          name: 'broll_i2v',
          label: 'B-roll I2V',
          nodeCount: 7,
          parameters: expect.arrayContaining(['cfg', 'height', 'seed', 'steps', 'text', 'width']),
          updatedAt: expect.any(String),
        }),
        expect.objectContaining({
          name: 'broll_reference_i2v',
          label: 'B-roll Reference I2V',
          nodeCount: 9,
          parameters: expect.arrayContaining(['cfg', 'height', 'image', 'seed', 'steps', 'text', 'width']),
          updatedAt: expect.any(String),
        }),
      ]));
      expect(summaries.some((workflow) => workflow.name === 'test_workflow')).toBe(false);
    });
  });

  describe('injectParameters', () => {
    it('should modify workflow nodes with provided parameters', () => {
      const baseWorkflow: Workflow = {
        "1": {
          inputs: {
            seed: 0,
            steps: 20
          },
          class_type: "TestSampler"
        }
      };

      const parameters = {
        seed: 12345,
        steps: 30
      };

      const result = injectParameters(baseWorkflow, parameters);

      expect(result["1"].inputs.seed).toBe(12345);
      expect(result["1"].inputs.steps).toBe(30);
    });

    it('should preserve original workflow structure', () => {
      const baseWorkflow: Workflow = {
        "1": {
          inputs: { value: 100 },
          class_type: "Node1"
        },
        "2": {
          inputs: { value: 200 },
          class_type: "Node2"
        }
      };

      const result = injectParameters(baseWorkflow, { value: 150 });

      // Both nodes should have value updated
      expect(result["1"].inputs.value).toBe(150);
      expect(result["2"].inputs.value).toBe(150);
      // Original should not be mutated
      expect(baseWorkflow["1"].inputs.value).toBe(100);
    });

    it('should handle nested parameter paths', () => {
      const baseWorkflow: Workflow = {
        "1": {
          inputs: {
            config: {
              nested: {
                value: 10
              }
            }
          },
          class_type: "ComplexNode"
        }
      };

      const result = injectParameters(baseWorkflow, { 'config.nested.value': 20 });

      expect(result["1"].inputs.config.nested.value).toBe(20);
    });

    it('maps prompt aliases onto ComfyUI text encode nodes', () => {
      const baseWorkflow: Workflow = {
        "1": {
          inputs: {
            text: "default positive",
            clip: ["4", 1],
          },
          class_type: "CLIPTextEncode",
          _meta: { title: "Positive prompt" },
        },
        "2": {
          inputs: {
            text: "low quality, distorted",
            clip: ["4", 1],
          },
          class_type: "CLIPTextEncode",
          _meta: { title: "Negative prompt" },
        },
      };

      const result = injectParameters(baseWorkflow, {
        prompt: 'editorial desk b-roll',
        negative_prompt: 'flicker, warped text',
      });

      expect(result["1"].inputs.text).toBe('editorial desk b-roll');
      expect(result["2"].inputs.text).toBe('flicker, warped text');
    });

    it('injects uploaded reference images into ComfyUI LoadImage nodes', () => {
      const workflow = loadWorkflow('broll_reference_i2v');
      const result = injectParameters(workflow, {
        image: 'reference-upload.png',
        prompt: 'editorial desk b-roll',
        negative_prompt: 'flicker, warped text',
        width: 1280,
        height: 720,
      });

      expect(result["2"].inputs.image).toBe('reference-upload.png');
      expect(result["3"].inputs).toMatchObject({
        width: 1280,
        height: 720,
      });
      expect(result["6"].inputs.text).toBe('editorial desk b-roll');
      expect(result["7"].inputs.text).toBe('flicker, warped text');
    });
  });
});
