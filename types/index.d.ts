export type UsageLimit = { kind: string; percentUsed: number }

export type UsageSnapshot = {
  startedAt: number | null
  contextPercent: number | null
  contextTokens: number | null
  contextWindow: number
  limits: UsageLimit[]
  costUsd: number | null
}

declare module 'claude-code' {
  interface PluginState {
    'usage-band': { snapshot: UsageSnapshot | null; lastTurnMs: number | null; isHidden: boolean }
  }
}
