import { atom, read, update } from 'claude-code'
import type { Register, SessionContextUsage, SessionCost, SessionRateLimit } from 'claude-code'

import type { UsageSnapshot } from '../types'

const snapshot = atom({ plugin: 'usage-band', key: 'snapshot' } as const, null)
const lastTurnMs = atom({ plugin: 'usage-band', key: 'lastTurnMs' } as const, null)
const isHidden = atom({ plugin: 'usage-band', key: 'isHidden' } as const, false)

const LIMIT_LABELS: Record<string, string> = { five_hour: '5h', seven_day: '7d', spend_limit: 'gasto' }

const toSnapshot = (
  startedAt: number | null,
  context: SessionContextUsage,
  rateLimits: SessionRateLimit[],
  cost: SessionCost | undefined,
): UsageSnapshot => ({
  startedAt,
  contextPercent: context.percent ?? null,
  contextTokens: context.tokens ?? null,
  contextWindow: context.window,
  limits: rateLimits.map(l => ({ kind: l.kind, percentUsed: l.percentUsed })),
  costUsd: cost?.usd ?? null,
})

const formatTokens = (n: number): string =>
  n >= 1_000_000 ? `${+(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`

const formatElapsed = (ms: number): string => {
  const min = Math.floor(ms / 60_000)
  return min > 60 ? `${Math.floor(min / 60)}h${`${min % 60}`.padStart(2, '0')}` : `${min}m`
}

const formatTurn = (ms: number): string => {
  const s = Math.round(ms / 1000)
  return `${Math.floor(s / 60)}:${`${s % 60}`.padStart(2, '0')}`
}

export const register: Register = on => {
  let turnStartedAt: number | null = null

  on('session.start', async ($, e, next) => {
    const result = await next(e)
    const u = await $.session.usage()
    await update($, snapshot, () => toSnapshot(u.startedAt, u.context, u.rateLimits, u.cost))
    await $.command.register({ name: 'uso', description: 'Mostra/oculta a barra de uso acima do prompt' })
    return result
  })

  on('session.measure', async ($, e, next) => {
    await update($, snapshot, prev => toSnapshot(prev?.startedAt ?? null, e.context, e.rateLimits, e.cost))
    if (e.changed.includes('rateLimits')) {
      for (const l of e.rateLimits) {
        if (l.percentUsed >= 90) $.ui.toast(`Limite ${LIMIT_LABELS[l.kind] ?? l.kind} em ${l.percentUsed}%`)
      }
    }
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    turnStartedAt = await $.clock.now()
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (turnStartedAt !== null) {
      const ms = (await $.clock.now()) - turnStartedAt
      await update($, lastTurnMs, () => ms)
      turnStartedAt = null
    }
    return next(e)
  })

  on('command.run', { command: 'uso' }, async ($, e) => {
    const hidden = await update($, isHidden, v => !v)
    return { text: hidden ? 'Barra de uso oculta.' : 'Barra de uso visível.' }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const s = await read($, snapshot)
    if (e.props.hasSurvey || s === null || (await read($, isHidden))) {
      return next(e)
    }

    const turn = await read($, lastTurnMs)
    const parts: string[] = []

    if (s.startedAt !== null) parts.push(`⏱ ${formatElapsed((await $.clock.now()) - s.startedAt)}`)
    parts.push(
      s.contextTokens === null
        ? `–/${formatTokens(s.contextWindow)}`
        : `${formatTokens(s.contextTokens)}/${formatTokens(s.contextWindow)} (${s.contextPercent ?? 0}%)`,
    )
    for (const l of s.limits) parts.push(`${LIMIT_LABELS[l.kind] ?? l.kind} ${l.percentUsed}%`)
    if (s.costUsd !== null) parts.push(`US$ ${s.costUsd.toFixed(2)}`)
    if (turn !== null) parts.push(`turno ${formatTurn(turn)}`)

    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box>
        <Text key="usage">{parts.join(' · ')}</Text>
      </Box>
    )
  })
}
