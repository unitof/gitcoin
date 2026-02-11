# AGENTS Notes

## Project conventions
- Make small, traceable commits for major checkpoints (core math, data sources, docs/tests).
- Use `git cic -m "..."` for commits.

## Findings and pitfalls
- `GET /events` `PushEvent` payloads can omit `payload.commits`. Do not assume full commit lists are present.
- In firehose mode, treat `payload.head` as the minimum viable commit candidate and only use `payload.commits` when available.
- Difficulty retarget assertions must account for compact `bits` quantization. Exact bigint arithmetic can differ slightly from round-tripped compact targets.

## Tuning guidance
- Bitcoin-like default retarget cadence is 2016 blocks at 600 seconds/block.
- For demos or low-throughput streams, use an easier `pow-limit-bits` (for example `0x207fffff`) to avoid empty chains.
