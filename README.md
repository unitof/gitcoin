# Gitcoin: Lucky Commit Chain

A playful, Bitcoin-inspired blockchain where the "proof-of-work" candidate is a public Git commit.

## Core idea

- Input: a stream of commits (from one very active repo, or a public GitHub push-event firehose).
- Candidate hash: `SHA256(SHA256(prev_block_hash || repo || commit_sha || commit_time))`.
- Win rule: candidate hash must be `<= target` (same target-style comparison as Bitcoin).
- Block interval target: ~10 minutes.
- Difficulty retarget: every 2016 blocks (roughly 14 days at 10 min/block), clamped to 4x adjustment bounds.

This is not money and not secure consensus. It is a deterministic game using Bitcoin-like mechanics.

## Why this shape

Bitcoin miners search nonces. Here we treat each commit as a "lottery ticket". The chain is still hash-linked and difficulty-adjusted, but the entropy source is public commit flow.

## Usage

Mine from public firehose events:

```bash
node main.js mine \
  --source public-events \
  --pages 3 \
  --per-page 100 \
  --pow-limit-bits 207fffff \
  --out chain.json
```

Mine from one active repo:

```bash
node main.js mine \
  --source repo \
  --repo torvalds/linux \
  --pages 10 \
  --per-page 100 \
  --pow-limit-bits 1f00ffff \
  --out chain.json
```

Validate an exported chain:

```bash
node main.js validate --in chain.json
```

With npm scripts:

```bash
npm run mine -- --source public-events --pow-limit-bits 207fffff
npm run validate -- --in chain.json
```

## Caveats

- GitHub APIs are rate-limited.
- For `GET /events`, `PushEvent` payloads can omit `payload.commits`. This implementation falls back to `payload.head` so firehose mode still works.
- Commit timestamps can be odd; ordering is canonicalized by `(timestamp, repo, sha)`.
- Low-throughput repos may need an easier `powLimit` than Bitcoin mainnet.

## Auth

Set `GITHUB_TOKEN` to increase API limits. It can be a PAT or GitHub App installation token.
