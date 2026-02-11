const { toUint32 } = require('./hash')

const TARGET_SPACING_SECONDS = 10 * 60
const DIFFICULTY_ADJUSTMENT_INTERVAL = 2016
const TARGET_TIMESPAN_SECONDS = TARGET_SPACING_SECONDS * DIFFICULTY_ADJUSTMENT_INTERVAL
const DEFAULT_POW_LIMIT_BITS = 0x1f00ffff

function bitsToTarget(bits) {
  const exponent = bits >>> 24
  const mantissa = bits & 0x007fffff

  if (mantissa === 0) {
    return 0n
  }

  if (exponent <= 3) {
    return BigInt(mantissa) >> BigInt(8 * (3 - exponent))
  }

  return BigInt(mantissa) << BigInt(8 * (exponent - 3))
}

function targetToBits(target) {
  if (target <= 0n) {
    return 0
  }

  let hex = target.toString(16)
  if (hex.length % 2 === 1) {
    hex = `0${hex}`
  }

  let size = hex.length / 2
  let mantissa

  if (size <= 3) {
    mantissa = Number(target << BigInt(8 * (3 - size)))
  } else {
    mantissa = Number(target >> BigInt(8 * (size - 3)))
  }

  if (mantissa & 0x00800000) {
    mantissa >>= 8
    size += 1
  }

  const compact = ((size << 24) | (mantissa & 0x007fffff)) >>> 0
  return toUint32(compact)
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function calculateNextWorkRequired({
  previousBits,
  actualTimespanSeconds,
  targetTimespanSeconds = TARGET_TIMESPAN_SECONDS,
  powLimitTarget,
}) {
  const minTimespan = Math.floor(targetTimespanSeconds / 4)
  const maxTimespan = targetTimespanSeconds * 4
  const adjustedTimespan = clamp(actualTimespanSeconds, minTimespan, maxTimespan)

  const previousTarget = bitsToTarget(previousBits)
  let nextTarget = (previousTarget * BigInt(adjustedTimespan)) / BigInt(targetTimespanSeconds)

  if (nextTarget > powLimitTarget) {
    nextTarget = powLimitTarget
  }

  return targetToBits(nextTarget)
}

function getNextWorkRequired(chain, {
  powLimitBits = DEFAULT_POW_LIMIT_BITS,
  difficultyAdjustmentInterval = DIFFICULTY_ADJUSTMENT_INTERVAL,
  targetSpacingSeconds = TARGET_SPACING_SECONDS,
} = {}) {
  if (!Array.isArray(chain) || chain.length === 0) {
    return powLimitBits
  }

  const nextHeight = chain.length
  const previousBlock = chain[chain.length - 1]

  if (nextHeight % difficultyAdjustmentInterval !== 0) {
    return previousBlock.bits
  }

  const firstHeight = nextHeight - difficultyAdjustmentInterval
  const firstBlock = chain[firstHeight]
  const actualTimespanSeconds = Math.max(1, previousBlock.time - firstBlock.time)

  return calculateNextWorkRequired({
    previousBits: previousBlock.bits,
    actualTimespanSeconds,
    targetTimespanSeconds: targetSpacingSeconds * difficultyAdjustmentInterval,
    powLimitTarget: bitsToTarget(powLimitBits),
  })
}

function formatBits(bits) {
  return (bits >>> 0).toString(16).padStart(8, '0')
}

module.exports = {
  calculateNextWorkRequired,
  DEFAULT_POW_LIMIT_BITS,
  DIFFICULTY_ADJUSTMENT_INTERVAL,
  TARGET_SPACING_SECONDS,
  TARGET_TIMESPAN_SECONDS,
  bitsToTarget,
  formatBits,
  getNextWorkRequired,
  targetToBits,
}
