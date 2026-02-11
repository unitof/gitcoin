const assert = require('node:assert/strict')
const test = require('node:test')

const {
  TARGET_TIMESPAN_SECONDS,
  bitsToTarget,
  calculateNextWorkRequired,
  targetToBits,
} = require('../src/difficulty')

test('compact bits roundtrip on canonical vectors', () => {
  const vectors = [
    0x1d00ffff,
    0x1b0404cb,
    0x1f00ffff,
    0x1e0fffff,
  ]

  for (const bits of vectors) {
    const roundtrip = targetToBits(bitsToTarget(bits))
    assert.equal(roundtrip, bits)
  }
})

test('difficulty retarget clamps to 4x faster', () => {
  const previousBits = 0x1e0fffff
  const powLimitTarget = bitsToTarget(0x1f00ffff)

  const nextBits = calculateNextWorkRequired({
    previousBits,
    actualTimespanSeconds: Math.floor(TARGET_TIMESPAN_SECONDS / 20),
    targetTimespanSeconds: TARGET_TIMESPAN_SECONDS,
    powLimitTarget,
  })

  const nextTarget = bitsToTarget(nextBits)
  const previousTarget = bitsToTarget(previousBits)
  const expectedQuantizedTarget = bitsToTarget(targetToBits(previousTarget / 4n))

  assert.equal(nextTarget, expectedQuantizedTarget)
})

test('difficulty retarget clamps to 4x slower', () => {
  const previousBits = 0x1e0fffff
  const powLimitTarget = bitsToTarget(0x1f00ffff)

  const nextBits = calculateNextWorkRequired({
    previousBits,
    actualTimespanSeconds: TARGET_TIMESPAN_SECONDS * 20,
    targetTimespanSeconds: TARGET_TIMESPAN_SECONDS,
    powLimitTarget,
  })

  const nextTarget = bitsToTarget(nextBits)
  const previousTarget = bitsToTarget(previousBits)
  const expectedQuantizedTarget = bitsToTarget(targetToBits(previousTarget * 4n))

  assert.equal(nextTarget, expectedQuantizedTarget)
})
