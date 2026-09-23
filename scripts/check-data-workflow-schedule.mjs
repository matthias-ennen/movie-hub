import { appendFile, mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const defaultOptions = Object.freeze({
  timeZone: 'Europe/Berlin',
  hour: 3,
  minute: 17,
  maximumDelayMinutes: 60,
  workflowName: 'Deploy Firebase',
})

function integer(value, fallback) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback
}

function zonedParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  return Object.fromEntries(parts.filter(({ type }) => type !== 'literal').map(({ type, value }) => [type, Number(value)]))
}

function localTimeToUtc({ year, month, day, hour, minute, second = 0 }, timeZone) {
  const target = Date.UTC(year, month - 1, day, hour, minute, second)
  let candidate = target
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const current = zonedParts(new Date(candidate), timeZone)
    const represented = Date.UTC(current.year, current.month - 1, current.day, current.hour, current.minute, current.second)
    candidate += target - represented
  }
  return new Date(candidate)
}

export function expectedScheduleAt(now = new Date(), options = {}) {
  const settings = { ...defaultOptions, ...options }
  const local = zonedParts(now, settings.timeZone)
  let expected = localTimeToUtc({
    year: local.year,
    month: local.month,
    day: local.day,
    hour: settings.hour,
    minute: settings.minute,
  }, settings.timeZone)
  if (expected.getTime() > now.getTime()) {
    const previousLocalNoon = new Date(expected.getTime() - 24 * 60 * 60 * 1000)
    const previous = zonedParts(previousLocalNoon, settings.timeZone)
    expected = localTimeToUtc({
      year: previous.year,
      month: previous.month,
      day: previous.day,
      hour: settings.hour,
      minute: settings.minute,
    }, settings.timeZone)
  }
  return expected
}

export function scheduledAtForLocalDate(now = new Date(), options = {}) {
  const settings = { ...defaultOptions, ...options }
  const local = zonedParts(now, settings.timeZone)
  return localTimeToUtc({
    year: local.year,
    month: local.month,
    day: local.day,
    hour: settings.hour,
    minute: settings.minute,
  }, settings.timeZone)
}

export function evaluateScheduleGate(runs, {
  now = new Date(),
  currentRunId,
  eventName = '',
  options = {},
} = {}) {
  const settings = { ...defaultOptions, ...options }
  if (eventName !== 'schedule') {
    return {
      shouldRun: true,
      reason: 'not-scheduled',
      event: eventName || 'unknown',
    }
  }

  const scheduledAt = scheduledAtForLocalDate(now, settings)
  const earliestAccepted = scheduledAt.getTime() - 5 * 60_000
  if (now.getTime() < earliestAccepted) {
    return {
      shouldRun: false,
      reason: 'before-daily-window',
      scheduledAt: scheduledAt.toISOString(),
      checkedAt: now.toISOString(),
    }
  }

  const priorRun = (Array.isArray(runs) ? runs : [])
    .filter((entry) => entry?.name === settings.workflowName && entry?.event === 'schedule')
    .filter((entry) => String(entry?.id) !== String(currentRunId || ''))
    .filter((entry) => {
      const createdAt = Date.parse(entry?.created_at)
      return Number.isFinite(createdAt) && createdAt >= earliestAccepted && createdAt <= now.getTime()
    })
    .filter((entry) => entry.status !== 'completed' || entry.conclusion === 'success')
    .sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at))[0]

  if (priorRun) {
    return {
      shouldRun: false,
      reason: 'daily-run-already-started',
      scheduledAt: scheduledAt.toISOString(),
      checkedAt: now.toISOString(),
      run: {
        id: priorRun.id,
        number: priorRun.run_number,
        status: priorRun.status,
        conclusion: priorRun.conclusion,
        url: priorRun.html_url,
      },
    }
  }

  return {
    shouldRun: true,
    reason: 'daily-run-due',
    scheduledAt: scheduledAt.toISOString(),
    checkedAt: now.toISOString(),
  }
}

export function captureWorkflowTiming({ now = new Date(), eventName = '', options = {} } = {}) {
  const settings = { ...defaultOptions, ...options }
  if (eventName !== 'schedule') {
    return {
      status: 'not-scheduled',
      event: eventName || 'unknown',
      timeZone: settings.timeZone,
      scheduledLocalTime: `${String(settings.hour).padStart(2, '0')}:${String(settings.minute).padStart(2, '0')}`,
      actualStartAt: now.toISOString(),
      maximumDelayMinutes: settings.maximumDelayMinutes,
    }
  }
  const scheduledAt = expectedScheduleAt(now, settings)
  const delayMinutes = Math.max(0, Math.floor((now.getTime() - scheduledAt.getTime()) / 60_000))
  return {
    status: delayMinutes > settings.maximumDelayMinutes ? 'delayed' : 'on-time',
    event: eventName,
    timeZone: settings.timeZone,
    scheduledLocalTime: `${String(settings.hour).padStart(2, '0')}:${String(settings.minute).padStart(2, '0')}`,
    scheduledAt: scheduledAt.toISOString(),
    actualStartAt: now.toISOString(),
    delayMinutes,
    maximumDelayMinutes: settings.maximumDelayMinutes,
  }
}

export function evaluateScheduledRuns(runs, { now = new Date(), options = {} } = {}) {
  const settings = { ...defaultOptions, ...options }
  const scheduledAt = expectedScheduleAt(now, settings)
  const earliestAccepted = scheduledAt.getTime() - 5 * 60_000
  const run = (Array.isArray(runs) ? runs : [])
    .filter((entry) => entry?.name === settings.workflowName && entry?.event === 'schedule')
    .filter((entry) => Date.parse(entry.created_at) >= earliestAccepted)
    .sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at))[0]

  if (!run) {
    return {
      status: 'missing',
      scheduledAt: scheduledAt.toISOString(),
      checkedAt: now.toISOString(),
      maximumDelayMinutes: settings.maximumDelayMinutes,
    }
  }

  const delayMinutes = Math.max(0, Math.floor((Date.parse(run.created_at) - scheduledAt.getTime()) / 60_000))
  const failed = run.status === 'completed' && run.conclusion !== 'success'
  return {
    status: failed ? 'failed' : delayMinutes > settings.maximumDelayMinutes ? 'delayed' : 'healthy',
    scheduledAt: scheduledAt.toISOString(),
    checkedAt: now.toISOString(),
    actualStartAt: run.created_at,
    delayMinutes,
    maximumDelayMinutes: settings.maximumDelayMinutes,
    run: {
      id: run.id,
      number: run.run_number,
      status: run.status,
      conclusion: run.conclusion,
      url: run.html_url,
    },
  }
}

function formatBerlin(value) {
  return new Date(value).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })
}

export function scheduleHealthMarkdown(result) {
  const actual = result.actualStartAt ? formatBerlin(result.actualStartAt) : 'kein Lauf gefunden'
  const delay = Number.isFinite(result.delayMinutes) ? `${result.delayMinutes} Minuten` : 'nicht messbar'
  return [
    '## Movie Hub · Nachtlauf-Überwachung',
    '',
    `- Geplanter Start: **${formatBerlin(result.scheduledAt)}**`,
    `- Tatsächlicher Start: **${actual}**`,
    `- Startverzögerung: **${delay}** (Grenze ${result.maximumDelayMinutes} Minuten)`,
    `- Ergebnis: **${result.status}**${result.run?.url ? ` · [Lauf #${result.run.number}](${result.run.url})` : ''}`,
    '',
  ].join('\n')
}

async function captureMain() {
  const output = resolve(process.env.WORKFLOW_TIMING_OUTPUT || 'artifacts/workflow-schedule-timing.json')
  const result = captureWorkflowTiming({
    eventName: process.env.GITHUB_EVENT_NAME,
    options: {
      timeZone: process.env.DATA_WORKFLOW_TIMEZONE || defaultOptions.timeZone,
      hour: integer(process.env.DATA_WORKFLOW_HOUR, defaultOptions.hour),
      minute: integer(process.env.DATA_WORKFLOW_MINUTE, defaultOptions.minute),
      maximumDelayMinutes: integer(process.env.DATA_WORKFLOW_MAX_DELAY_MINUTES, defaultOptions.maximumDelayMinutes),
    },
  })
  await mkdir(dirname(output), { recursive: true })
  await writeFile(output, `${JSON.stringify(result, null, 2)}\n`, 'utf8')
  if (result.status === 'delayed') console.warn(`::warning::Der Nachtlauf startete ${result.delayMinutes} Minuten verspätet.`)
  console.log(`Workflow timing: ${result.status}${Number.isFinite(result.delayMinutes) ? ` (${result.delayMinutes} Minuten)` : ''}`)
}

async function watchdogMain({ fetchImpl = fetch } = {}) {
  const repository = process.env.GITHUB_REPOSITORY
  const token = process.env.GITHUB_TOKEN
  if (!repository || !token) throw new Error('GITHUB_REPOSITORY und GITHUB_TOKEN werden für die Nachtlauf-Überwachung benötigt.')
  const response = await fetchImpl(`https://api.github.com/repos/${repository}/actions/runs?event=schedule&per_page=100`, {
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'x-github-api-version': '2022-11-28',
    },
    signal: AbortSignal.timeout(20_000),
  })
  if (!response.ok) throw new Error(`GitHub Actions API: HTTP ${response.status}`)
  const payload = await response.json()
  const result = evaluateScheduledRuns(payload.workflow_runs, {
    options: {
      timeZone: process.env.DATA_WORKFLOW_TIMEZONE || defaultOptions.timeZone,
      hour: integer(process.env.DATA_WORKFLOW_HOUR, defaultOptions.hour),
      minute: integer(process.env.DATA_WORKFLOW_MINUTE, defaultOptions.minute),
      maximumDelayMinutes: integer(process.env.DATA_WORKFLOW_MAX_DELAY_MINUTES, defaultOptions.maximumDelayMinutes),
      workflowName: process.env.DATA_WORKFLOW_NAME || defaultOptions.workflowName,
    },
  })
  const markdown = scheduleHealthMarkdown(result)
  console.log(markdown)
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, markdown, 'utf8')
  if (result.status !== 'healthy') {
    console.error(`::error::Nachtlauf-Überwachung: ${result.status}.`)
    process.exitCode = 1
  }
}

async function scheduleGateMain({ fetchImpl = fetch } = {}) {
  const eventName = process.env.GITHUB_EVENT_NAME || ''
  const output = process.env.GITHUB_OUTPUT
  const settings = {
    timeZone: process.env.DATA_WORKFLOW_TIMEZONE || defaultOptions.timeZone,
    hour: integer(process.env.DATA_WORKFLOW_HOUR, defaultOptions.hour),
    minute: integer(process.env.DATA_WORKFLOW_MINUTE, defaultOptions.minute),
    workflowName: process.env.DATA_WORKFLOW_NAME || defaultOptions.workflowName,
  }

  let result
  if (eventName !== 'schedule') {
    result = evaluateScheduleGate([], { eventName, options: settings })
  } else {
    const repository = process.env.GITHUB_REPOSITORY
    const token = process.env.GITHUB_TOKEN
    if (!repository || !token) throw new Error('GITHUB_REPOSITORY und GITHUB_TOKEN werden für die Nachtlauf-Sperre benötigt.')
    try {
      const response = await fetchImpl(`https://api.github.com/repos/${repository}/actions/runs?event=schedule&per_page=100`, {
        headers: {
          accept: 'application/vnd.github+json',
          authorization: `Bearer ${token}`,
          'x-github-api-version': '2022-11-28',
        },
        signal: AbortSignal.timeout(20_000),
      })
      if (!response.ok) throw new Error(`GitHub Actions API: HTTP ${response.status}`)
      const payload = await response.json()
      result = evaluateScheduleGate(payload.workflow_runs, {
        currentRunId: process.env.GITHUB_RUN_ID,
        eventName,
        options: settings,
      })
    } catch (error) {
      console.warn(`::warning::Nachtlauf-Sperre nicht prüfbar; der Datenlauf startet sicherheitshalber: ${error instanceof Error ? error.message : String(error)}`)
      result = {
        shouldRun: true,
        reason: 'gate-check-failed-open',
      }
    }
  }

  if (output) {
    await appendFile(output, `should_run=${result.shouldRun ? 'true' : 'false'}\nreason=${result.reason}\n`, 'utf8')
  }
  console.log(`Schedule gate: ${result.shouldRun ? 'run' : 'skip'} (${result.reason})`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const mode = process.argv.includes('--capture') ? 'capture' : process.argv.includes('--gate') ? 'gate' : 'watchdog'
  const main = mode === 'capture' ? captureMain : mode === 'gate' ? scheduleGateMain : watchdogMain
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
