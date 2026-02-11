const assert = require('node:assert/strict')
const test = require('node:test')

const { buildChainFromCandidates, validateChain } = require('../src/chain')

test('buildChainFromCandidates mines deterministic lucky blocks', () => {
  const candidates = Array.from({ length: 250 }, (_, index) => ({
    source: 'synthetic',
    repo: 'demo/repo',
    sha: `commit-${index.toString(16).padStart(6, '0')}`,
    timestamp: 1700000000 + (index * 60),
    authorName: `author-${index}`,
  }))

  const { chain, stats } = buildChainFromCandidates(candidates, {
    powLimitBits: 0x207fffff,
    difficultyAdjustmentInterval: 20,
    targetSpacingSeconds: 600,
  })

  assert.equal(stats.candidates, 250)
  assert.ok(stats.blocks > 25)
  assert.equal(chain.length, stats.blocks + 1)

  const validation = validateChain(chain, {
    powLimitBits: 0x207fffff,
    difficultyAdjustmentInterval: 20,
    targetSpacingSeconds: 600,
  })

  assert.deepEqual(validation, { ok: true })
})
