import { describe, it, expect } from 'vitest';
import { loadWorkflow, injectParameters, type Workflow } from '../../src/lib/workflow-loader';

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
  });
});
