import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { evaluateContentRankingPolicy } from '../src/experimental/contextual-bandit-ope.ts';

const events = Array.from({ length: 200 }, (_, index) => {
  const loggedAction = index % 2 === 0 ? 'content-a' : 'content-b';
  return {
    eventKey: `event-${index}`,
    loggedAction,
    loggingPropensity: 0.5,
    reward: loggedAction === 'content-a' ? 1 : 0,
    targetPolicyProbabilities: { 'content-a': 0.9, 'content-b': 0.1 },
    baselinePolicyProbabilities: { 'content-a': 0.1, 'content-b': 0.9 },
    rewardModel: { 'content-a': 1, 'content-b': 0 },
  };
});

const base = {
  domain: 'content_ranking',
  events,
  policy: {
    minimumEvents: 100,
    minimumEffectiveSampleSize: 100,
    minimumPropensity: 0.05,
    maximumImportanceWeight: 10,
    minimumLiftLowerBound: 0.05,
  },
};

describe('P5-5 contextual bandit content-ranking OPE', () => {
  it('computes IPS, SNIPS, doubly robust lift, ESS, and a confidence gate', () => {
    const result = evaluateContentRankingPolicy(base);
    assert.equal(result.status, 'ok');
    if (result.status !== 'ok') return;
    assert.ok(result.target.ips > result.baseline.ips);
    assert.ok(result.target.snips > result.baseline.snips);
    assert.ok(result.target.doublyRobust > result.baseline.doublyRobust);
    assert.ok(result.lift.lower95 > 0.05);
    assert.ok(result.effectiveSampleSize >= 100);
    assert.equal(result.promotionAllowed, true);
    assert.equal(result.domain, 'content_ranking');
    assert.equal(result.explorationAllowed, false);
    assert.equal(result.orderExecutable, false);
  });

  it('keeps a statistically unsupported policy in shadow', () => {
    const result = evaluateContentRankingPolicy({
      ...base,
      events: events.map((event) => ({
        ...event,
        targetPolicyProbabilities: event.baselinePolicyProbabilities,
      })),
    });
    assert.equal(result.status, 'ok');
    if (result.status === 'ok') {
      assert.equal(result.promotionAllowed, false);
      assert.ok(result.lift.lower95 <= 0.05);
    }
  });

  it('fails closed without overlap, bounded weights, normalized policies, or enough samples', () => {
    for (const input of [
      { ...base, events: events.slice(0, 10) },
      {
        ...base,
        events: events.map((event) => ({ ...event, loggingPropensity: 0.001 })),
      },
      {
        ...base,
        events: events.map((event) => ({
          ...event,
          targetPolicyProbabilities: { 'content-a': 0.9, 'content-b': 0.9 },
        })),
      },
      {
        ...base,
        events: events.filter((event) => event.loggedAction === 'content-a'),
      },
    ]) {
      assert.deepEqual(evaluateContentRankingPolicy(input), {
        status: 'abstained',
        reason: 'INVALID_BANDIT_OPE_INPUT',
        domain: 'content_ranking',
        explorationAllowed: false,
        candidateOnly: true,
        acceptedFactAllowed: false,
        orderExecutable: false,
      });
    }
  });
});
