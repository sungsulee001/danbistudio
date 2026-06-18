import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '../../src/app/api/workflows/route';

const mocks = vi.hoisted(() => ({
  listWorkflowSummaries: vi.fn(),
}));

vi.mock('@/lib/workflow-loader', () => ({
  listWorkflowSummaries: mocks.listWorkflowSummaries,
}));

describe('GET /api/workflows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listWorkflowSummaries.mockReturnValue([
      {
        name: 'broll_i2v',
        label: 'B-roll I2V',
        nodeCount: 7,
        parameters: ['cfg', 'height', 'seed', 'steps', 'text', 'width'],
        updatedAt: '2026-06-17T00:00:00.000Z',
      },
    ]);
  });

  it('returns local workflow summaries', async () => {
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({
      workflows: [
        {
          name: 'broll_i2v',
          label: 'B-roll I2V',
          nodeCount: 7,
          parameters: ['cfg', 'height', 'seed', 'steps', 'text', 'width'],
          updatedAt: '2026-06-17T00:00:00.000Z',
        },
      ],
    });
  });

  it('returns 500 when workflow scanning fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.listWorkflowSummaries.mockImplementationOnce(() => {
      throw new Error('bad workflow json');
    });

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('bad workflow json');
    consoleError.mockRestore();
  });
});
