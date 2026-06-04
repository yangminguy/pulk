import { runDelegationLoop, type VerifyVerdict } from '../loop';

describe('runDelegationLoop', () => {
  it('resolves on the first round when verify passes', async () => {
    const runWork = jest.fn(async () => ({ output: { v: 1 } }));
    const verify = jest.fn(async (): Promise<VerifyVerdict> => ({ pass: true, feedback: '' }));

    const res = await runDelegationLoop(3, { runWork, verify });

    expect(res.status).toBe('resolved');
    expect(res.rounds).toBe(1);
    expect(res.output).toEqual({ v: 1 });
    expect(runWork).toHaveBeenCalledTimes(1);
    expect(runWork).toHaveBeenCalledWith(1, null); // first round: no feedback
  });

  it('feeds the previous verdict feedback into the next round, then resolves', async () => {
    const runWork = jest.fn(async (round: number) => ({ output: { round } }));
    const verify = jest
      .fn<Promise<VerifyVerdict>, [unknown]>()
      .mockResolvedValueOnce({ pass: false, feedback: '9:16 아님' })
      .mockResolvedValueOnce({ pass: true, feedback: '' });

    const res = await runDelegationLoop(3, { runWork, verify });

    expect(res.status).toBe('resolved');
    expect(res.rounds).toBe(2);
    expect(runWork).toHaveBeenNthCalledWith(1, 1, null);
    expect(runWork).toHaveBeenNthCalledWith(2, 2, '9:16 아님'); // feedback threaded
  });

  it('escalates when the budget is exhausted without a pass', async () => {
    const runWork = jest.fn(async (round: number) => ({ output: { round } }));
    const verify = jest.fn(async (): Promise<VerifyVerdict> => ({ pass: false, feedback: 'still no' }));

    const res = await runDelegationLoop(2, { runWork, verify });

    expect(res.status).toBe('escalated');
    expect(res.rounds).toBe(2);
    expect(res.output).toEqual({ round: 2 }); // last attempt preserved
    if (res.status === 'escalated') expect(res.reason).toContain('max_rounds');
    expect(runWork).toHaveBeenCalledTimes(2);
  });

  it('invokes onRound for each round with the verdict', async () => {
    const seen: Array<{ round: number; pass: boolean }> = [];
    const runWork = jest.fn(async () => ({ output: {} }));
    const verify = jest
      .fn<Promise<VerifyVerdict>, [unknown]>()
      .mockResolvedValueOnce({ pass: false, feedback: 'f' })
      .mockResolvedValueOnce({ pass: true, feedback: '' });

    await runDelegationLoop(3, {
      runWork,
      verify,
      onRound: (round, verdict) => seen.push({ round, pass: verdict.pass }),
    });

    expect(seen).toEqual([
      { round: 1, pass: false },
      { round: 2, pass: true },
    ]);
  });
});
