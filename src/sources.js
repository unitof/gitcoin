const { Octokit } = require('@octokit/core')

function makeClient(token) {
  if (token) {
    return new Octokit({ auth: token })
  }

  return new Octokit()
}

function toUnixSeconds(isoString) {
  return Math.floor(new Date(isoString).getTime() / 1000)
}

function dedupeCandidates(candidates) {
  return Array.from(
    candidates.reduce((accumulator, candidate) => {
      accumulator.set(`${candidate.repo}|${candidate.sha}|${candidate.timestamp}`, candidate)
      return accumulator
    }, new Map()).values()
  )
}

async function fetchPublicEventCandidates({
  token,
  pages = 3,
  perPage = 100,
} = {}) {
  const octokit = makeClient(token)
  const candidates = []

  for (let page = 1; page <= pages; page += 1) {
    const response = await octokit.request('GET /events', {
      page,
      per_page: perPage,
      headers: {
        'X-GitHub-Api-Version': '2022-11-28',
      },
    })

    const events = response.data
    if (!events.length) {
      break
    }

    for (const event of events) {
      if (event.type !== 'PushEvent') {
        continue
      }

      const eventTimestamp = toUnixSeconds(event.created_at)
      const repoName = event.repo?.name
      const payloadCommits = event.payload?.commits

      if (Array.isArray(payloadCommits) && payloadCommits.length > 0) {
        for (const commit of payloadCommits) {
          candidates.push({
            source: 'public-events',
            repo: repoName,
            sha: commit.sha,
            timestamp: eventTimestamp,
            authorName: commit.author?.name || null,
            authorEmail: commit.author?.email || null,
            authorLogin: event.actor?.login || null,
            message: commit.message || null,
            eventId: event.id,
          })
        }
        continue
      }

      if (!event.payload?.head) {
        continue
      }

      candidates.push({
        source: 'public-events',
        repo: repoName,
        sha: event.payload.head,
        timestamp: eventTimestamp,
        authorName: null,
        authorEmail: null,
        authorLogin: event.actor?.login || null,
        message: null,
        eventId: event.id,
      })
    }

    if (events.length < perPage) {
      break
    }
  }

  return dedupeCandidates(candidates)
}

async function fetchRepoCommitCandidates({
  owner,
  repo,
  token,
  pages = 5,
  perPage = 100,
} = {}) {
  if (!owner || !repo) {
    throw new Error('owner and repo are required for repo source')
  }

  const octokit = makeClient(token)
  const candidates = []

  for (let page = 1; page <= pages; page += 1) {
    const response = await octokit.request('GET /repos/{owner}/{repo}/commits', {
      owner,
      repo,
      page,
      per_page: perPage,
      headers: {
        'X-GitHub-Api-Version': '2022-11-28',
      },
    })

    const commits = response.data
    if (!commits.length) {
      break
    }

    for (const commit of commits) {
      const timestamp = commit.commit?.author?.date || commit.commit?.committer?.date
      if (!timestamp) {
        continue
      }

      candidates.push({
        source: `repo:${owner}/${repo}`,
        repo: `${owner}/${repo}`,
        sha: commit.sha,
        timestamp: toUnixSeconds(timestamp),
        authorName: commit.commit?.author?.name || null,
        authorEmail: commit.commit?.author?.email || null,
        authorLogin: commit.author?.login || null,
        message: commit.commit?.message || null,
      })
    }

    if (commits.length < perPage) {
      break
    }
  }

  return dedupeCandidates(candidates)
}

module.exports = {
  fetchPublicEventCandidates,
  fetchRepoCommitCandidates,
}
