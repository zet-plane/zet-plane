import type { RouteTarget } from '../types'

export const ROUTING_RULES: Record<string, RouteTarget> = {
  'github.push':             'orchestrate',
  'github.pull_request':     'orchestrate',
  'github.issues':           'orchestrate',
  'feishu.message':          'orchestrate',
  'claude_hook.session_end': 'orchestrate',
  'claude_hook.tool_use':    'orchestrate',
  'manual':                  'orchestrate',
}

export const DEFAULT_ROUTE: RouteTarget = 'orchestrate'
