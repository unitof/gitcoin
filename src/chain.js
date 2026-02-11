const {
  bitsToTarget,
  DEFAULT_POW_LIMIT_BITS,
  DIFFICULTY_ADJUSTMENT_INTERVAL,
  formatBits,
  getNextWorkRequired,
  TARGET_SPACING_SECONDS,
} = require('./difficulty')
const { doubleSha256Hex, hexToBigInt } = require('./hash')

const ZERO_HASH = '0'.repeat(64)

function toUnixSeconds(value) {
  if (typeof value === 'number') {
    return Math.floor(value)
  }

  const timestamp = Date.parse(value)
  if (Number.isNaN(timestamp)) {
    throw new Error(`Invalid timestamp: ${value}`)
  }

  return Math.floor(timestamp / 1000)
}

function normalizeCandidate(candidate) {
  return {
    source: candidate.source || 'unknown',
    repo: candidate.repo,
    sha: candidate.sha,
    timestamp: toUnixSeconds(candidate.timestamp),
    authorName: candidate.authorName || null,
    authorEmail: candidate.authorEmail || null,
    authorLogin: candidate.authorLogin || null,
    message: candidate.message || null,
  }
}

function compareCandidates(left, right) {
  if (left.timestamp !== right.timestamp) {
    return left.timestamp - right.timestamp
  }

  if (left.repo !== right.repo) {
    return left.repo.localeCompare(right.repo)
  }

  return left.sha.localeCompare(right.sha)
}

function computeCandidateHash(prevHash, candidate) {
  const payload = `${prevHash}|${candidate.repo}|${candidate.sha}|${candidate.timestamp}`
  return doubleSha256Hex(payload)
}

function computeBlockHash({ height, prevHash, candidateHash, bits, time }) {
  const header = `${height}|${prevHash}|${candidateHash}|${formatBits(bits)}|${time}`
  return doubleSha256Hex(header)
}

function createGenesisBlock({ bits, time }) {
  const candidateHash = doubleSha256Hex(`genesis|${time}|${formatBits(bits)}`)

  return {
    height: 0,
    prevHash: ZERO_HASH,
    blockHash: computeBlockHash({
      height: 0,
      prevHash: ZERO_HASH,
      candidateHash,
      bits,
      time,
    }),
    candidateHash,
    bits,
    targetHex: bitsToTarget(bits).toString(16).padStart(64, '0'),
    time,
    source: 'genesis',
    repo: 'genesis',
    commitSha: 'genesis',
    commitTime: time,
    winner: {
      name: null,
      email: null,
      login: null,
    },
    message: null,
  }
}

function tryCreateBlock(prevBlock, candidate, bits) {
  const candidateHash = computeCandidateHash(prevBlock.blockHash, candidate)
  const target = bitsToTarget(bits)

  if (hexToBigInt(candidateHash) > target) {
    return null
  }

  const height = prevBlock.height + 1
  const time = candidate.timestamp

  return {
    height,
    prevHash: prevBlock.blockHash,
    blockHash: computeBlockHash({
      height,
      prevHash: prevBlock.blockHash,
      candidateHash,
      bits,
      time,
    }),
    candidateHash,
    bits,
    targetHex: target.toString(16).padStart(64, '0'),
    time,
    source: candidate.source,
    repo: candidate.repo,
    commitSha: candidate.sha,
    commitTime: candidate.timestamp,
    winner: {
      name: candidate.authorName,
      email: candidate.authorEmail,
      login: candidate.authorLogin,
    },
    message: candidate.message,
  }
}

function buildChainFromCandidates(candidates, {
  powLimitBits = DEFAULT_POW_LIMIT_BITS,
  difficultyAdjustmentInterval = DIFFICULTY_ADJUSTMENT_INTERVAL,
  targetSpacingSeconds = TARGET_SPACING_SECONDS,
  genesisTime,
  maxBlocks,
} = {}) {
  const normalized = candidates
    .map(normalizeCandidate)
    .filter((candidate) => candidate.repo && candidate.sha)
  const deduped = Array.from(
    normalized.reduce((accumulator, candidate) => {
      accumulator.set(`${candidate.repo}|${candidate.sha}|${candidate.timestamp}`, candidate)
      return accumulator
    }, new Map()).values()
  ).sort(compareCandidates)

  const initialGenesisTime = genesisTime
    ? toUnixSeconds(genesisTime)
    : (deduped[0]?.timestamp || Math.floor(Date.now() / 1000)) - targetSpacingSeconds

  const chain = [
    createGenesisBlock({
      bits: powLimitBits,
      time: initialGenesisTime,
    }),
  ]

  for (const candidate of deduped) {
    const bits = getNextWorkRequired(chain, {
      powLimitBits,
      difficultyAdjustmentInterval,
      targetSpacingSeconds,
    })
    const block = tryCreateBlock(chain[chain.length - 1], candidate, bits)

    if (!block) {
      continue
    }

    chain.push(block)

    if (maxBlocks && chain.length - 1 >= maxBlocks) {
      break
    }
  }

  return {
    chain,
    stats: {
      candidates: deduped.length,
      blocks: chain.length - 1,
    },
  }
}

function validateChain(chain, {
  powLimitBits = DEFAULT_POW_LIMIT_BITS,
  difficultyAdjustmentInterval = DIFFICULTY_ADJUSTMENT_INTERVAL,
  targetSpacingSeconds = TARGET_SPACING_SECONDS,
} = {}) {
  if (!Array.isArray(chain) || chain.length === 0) {
    throw new Error('Chain cannot be empty')
  }

  for (let index = 1; index < chain.length; index += 1) {
    const prevBlock = chain[index - 1]
    const block = chain[index]

    if (block.prevHash !== prevBlock.blockHash) {
      throw new Error(`Broken link at height ${block.height}`)
    }

    const expectedBits = getNextWorkRequired(chain.slice(0, index), {
      powLimitBits,
      difficultyAdjustmentInterval,
      targetSpacingSeconds,
    })

    if (block.bits !== expectedBits) {
      throw new Error(`Unexpected bits at height ${block.height}`)
    }

    const candidate = {
      repo: block.repo,
      sha: block.commitSha,
      timestamp: block.commitTime,
    }

    const expectedCandidateHash = computeCandidateHash(prevBlock.blockHash, candidate)
    if (block.candidateHash !== expectedCandidateHash) {
      throw new Error(`Candidate hash mismatch at height ${block.height}`)
    }

    const target = bitsToTarget(block.bits)
    if (hexToBigInt(block.candidateHash) > target) {
      throw new Error(`PoW mismatch at height ${block.height}`)
    }

    const expectedBlockHash = computeBlockHash({
      height: block.height,
      prevHash: block.prevHash,
      candidateHash: block.candidateHash,
      bits: block.bits,
      time: block.time,
    })

    if (block.blockHash !== expectedBlockHash) {
      throw new Error(`Block hash mismatch at height ${block.height}`)
    }
  }

  return { ok: true }
}

module.exports = {
  ZERO_HASH,
  buildChainFromCandidates,
  compareCandidates,
  computeCandidateHash,
  computeBlockHash,
  validateChain,
}
