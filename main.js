const fs = require('fs')

const {
  DEFAULT_POW_LIMIT_BITS,
  DIFFICULTY_ADJUSTMENT_INTERVAL,
  TARGET_SPACING_SECONDS,
  formatBits,
} = require('./src/difficulty')
const {
  buildChainFromCandidates,
  validateChain,
} = require('./src/chain')
const {
  fetchPublicEventCandidates,
  fetchRepoCommitCandidates,
} = require('./src/sources')

function parseArgs(argv) {
  const parsed = { _: [] }

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]

    if (!value.startsWith('--')) {
      parsed._.push(value)
      continue
    }

    const [key, inlineValue] = value.slice(2).split('=')
    if (inlineValue !== undefined) {
      parsed[key] = inlineValue
      continue
    }

    const next = argv[index + 1]
    if (!next || next.startsWith('--')) {
      parsed[key] = true
      continue
    }

    parsed[key] = next
    index += 1
  }

  return parsed
}

function parseIntegerArg(value, fallback) {
  if (value === undefined) {
    return fallback
  }

  const parsed = Number.parseInt(String(value), 10)
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid integer value: ${value}`)
  }

  return parsed
}

function parseBitsArg(value, fallback) {
  if (value === undefined) {
    return fallback
  }

  const normalized = String(value).startsWith('0x') ? String(value) : `0x${String(value)}`
  const parsed = Number.parseInt(normalized, 16)
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid bits value: ${value}`)
  }

  return parsed >>> 0
}

function printUsage() {
  console.log(`
Usage:
  node main.js mine [--source public-events|repo] [--repo owner/name]
                    [--pages 3] [--per-page 100] [--max-candidates N]
                    [--pow-limit-bits 1f00ffff]
                    [--target-spacing-seconds 600]
                    [--difficulty-adjustment-interval 2016]
                    [--genesis-time ISO8601]
                    [--out chain.json]

  node main.js validate [--in chain.json]

Environment:
  GITHUB_TOKEN    Optional token (PAT or GitHub App installation token)
`) }

async function loadCandidates(args) {
  const token = process.env.GITHUB_TOKEN
  const source = args.source || 'public-events'
  const pages = parseIntegerArg(args.pages, 3)
  const perPage = parseIntegerArg(args['per-page'], 100)

  if (source === 'public-events') {
    const candidates = await fetchPublicEventCandidates({
      token,
      pages,
      perPage,
    })
    return { source, candidates }
  }

  if (source === 'repo') {
    if (!args.repo || !String(args.repo).includes('/')) {
      throw new Error('For --source repo, pass --repo owner/name')
    }

    const [owner, repo] = String(args.repo).split('/')
    const candidates = await fetchRepoCommitCandidates({
      owner,
      repo,
      token,
      pages,
      perPage,
    })
    return {
      source: `repo:${owner}/${repo}`,
      candidates,
    }
  }

  throw new Error(`Unknown source: ${source}`)
}

function printTopWinners(chain, count = 10) {
  const winners = chain.slice(1, count + 1)
  if (winners.length === 0) {
    console.log('No lucky commits found in this sample.')
    return
  }

  console.log('Top lucky commits:')
  for (const block of winners) {
    const winner = block.winner?.login || block.winner?.name || 'unknown'
    console.log(
      `  #${block.height} ${block.repo} ${block.commitSha.slice(0, 12)} ` +
      `winner=${winner} time=${new Date(block.time * 1000).toISOString()} bits=${formatBits(block.bits)}`
    )
  }
}

async function runMine(args) {
  const { source, candidates } = await loadCandidates(args)
  const maxCandidates = parseIntegerArg(args['max-candidates'], candidates.length)

  const powLimitBits = parseBitsArg(args['pow-limit-bits'], DEFAULT_POW_LIMIT_BITS)
  const targetSpacingSeconds = parseIntegerArg(args['target-spacing-seconds'], TARGET_SPACING_SECONDS)
  const difficultyAdjustmentInterval = parseIntegerArg(
    args['difficulty-adjustment-interval'],
    DIFFICULTY_ADJUSTMENT_INTERVAL
  )

  const selected = candidates.slice(0, Math.max(0, maxCandidates))
  const { chain, stats } = buildChainFromCandidates(selected, {
    powLimitBits,
    targetSpacingSeconds,
    difficultyAdjustmentInterval,
    genesisTime: args['genesis-time'],
    maxBlocks: parseIntegerArg(args['max-blocks'], undefined),
  })

  validateChain(chain, {
    powLimitBits,
    targetSpacingSeconds,
    difficultyAdjustmentInterval,
  })

  const output = {
    generatedAt: new Date().toISOString(),
    source,
    config: {
      powLimitBits: formatBits(powLimitBits),
      targetSpacingSeconds,
      difficultyAdjustmentInterval,
    },
    stats,
    chain,
  }

  const outputPath = args.out || 'chain.json'
  fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8')

  console.log(`Candidates considered: ${stats.candidates}`)
  console.log(`Lucky blocks found: ${stats.blocks}`)
  console.log(`Wrote chain to ${outputPath}`)

  printTopWinners(chain)
}

function runValidate(args) {
  const inputPath = args.in || 'chain.json'
  const document = JSON.parse(fs.readFileSync(inputPath, 'utf8'))

  validateChain(document.chain, {
    powLimitBits: parseBitsArg(
      document.config?.powLimitBits,
      DEFAULT_POW_LIMIT_BITS
    ),
    targetSpacingSeconds: parseIntegerArg(
      document.config?.targetSpacingSeconds,
      TARGET_SPACING_SECONDS
    ),
    difficultyAdjustmentInterval: parseIntegerArg(
      document.config?.difficultyAdjustmentInterval,
      DIFFICULTY_ADJUSTMENT_INTERVAL
    ),
  })

  console.log(`Chain is valid: ${inputPath}`)
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const command = args._[0]

  if (!command || args.help || args.h) {
    printUsage()
    return
  }

  if (command === 'mine') {
    await runMine(args)
    return
  }

  if (command === 'validate') {
    runValidate(args)
    return
  }

  throw new Error(`Unknown command: ${command}`)
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
