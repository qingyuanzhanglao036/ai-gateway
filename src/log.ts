/**
 * 版本号: v1.0.11
 * 模块: 内存日志管理、调试开关控制与正式模式内存缓存批量落盘（增加 Worker 异步定时器与异常防护）
 */
import type { Env, LogEntry, DebugConfig } from './types'
import { KV_KEYS } from './config'

// 内存日志最大缓存条数，避免内存占用过大，超出自动丢弃旧日志
const MAX_MEMORY_LOGS = 100

// 内存日志列表（绝不写入 KV，0 存储成本）
const memoryLogs: LogEntry[] = []

// 调试与缓存配置（默认处于正式模式，支持后台动态自定义）
let debugConfig: DebugConfig = {
  debugMode: false,
  maxCacheItems: 20,
  flushIntervalSec: 30,
}

// 唯一全局定时器句柄，防止重复创建导致内存泄露或并发冲突
let globalTimerHandle: ReturnType<typeof setTimeout> | null = null

// 上次执行落盘的时间戳，用于 Worker 每次请求后置兜底校验
let lastFlushTimestamp = Date.now()

// 正式模式下的内存缓存队列（待落盘的 Key 健康状态变更数据）
type HealthMap = Record<string, { failures: number; lastFailed: boolean; demotedAt?: number }>
const pendingHealthCache: Record<string, HealthMap> = {}
let pendingItemsCount = 0

/**
 * 记录一次代理请求日志
 * 调试模式下：仅记录报错和超时请求，并在前端展示
 */
export function recordLog(data: Omit<LogEntry, 'id'>): void {
  if (debugConfig.debugMode) {
    const isErrorOrTimeout = data.statusCode >= 400 || (data.failReason && data.failReason !== '-')
    if (!isErrorOrTimeout) return
  }

  const entry: LogEntry = {
    id: crypto.randomUUID(),
    ...data,
  }

  if (memoryLogs.length >= MAX_MEMORY_LOGS) {
    memoryLogs.shift()
  }
  memoryLogs.push(entry)
}

/**
 * 获取当前所有内存日志
 */
export function getMemoryLogs(): LogEntry[] {
  return [...memoryLogs].reverse()
}

/**
 * 清空内存日志
 */
export function clearMemoryLogs(): void {
  memoryLogs.length = 0
}

/**
 * 获取当前的调试与缓存配置
 */
export function getDebugConfig(): DebugConfig {
  return { ...debugConfig }
}

/**
 * 将待落盘的 Key 健康数据加入内存缓存队列
 */
export async function queueHealthUpdate(env: Env, providerId: string, health: HealthMap): Promise<void> {
  if (debugConfig.debugMode) {
    await writeHealthDirect(env, providerId, health)
    return
  }

  pendingHealthCache[providerId] = health
  pendingItemsCount++

  if (pendingItemsCount >= debugConfig.maxCacheItems) {
    await flushPendingHealthCache(env)
    return
  }

  ensureGlobalTimer(env)
}

/**
 * 确保启动唯一的全局 30 秒落盘定时器
 */
function ensureGlobalTimer(env: Env): void {
  if (globalTimerHandle !== null) return

  globalTimerHandle = setTimeout(async () => {
    globalTimerHandle = null
    try {
      await flushPendingHealthCache(env)
    } catch (err) {
      console.error('全局落盘定时器异步异常:', err)
    }
  }, debugConfig.flushIntervalSec * 1000)
}

/**
 * 清理全局定时器
 */
export function clearGlobalTimer(): void {
  if (globalTimerHandle !== null) {
    clearTimeout(globalTimerHandle)
    globalTimerHandle = null
  }
}

/**
 * 直接将单个提供商的健康状态写入 KV（底层封装，防崩溃）
 */
async function writeHealthDirect(env: Env, providerId: string, health: HealthMap): Promise<void> {
  if (!env?.KV) return
  try {
    const healthKey = KV_KEYS.KEY_HEALTH_PREFIX + providerId
    const filtered: HealthMap = {}
    for (const [k, v] of Object.entries(health)) {
      if (v.failures > 0) filtered[k] = v
    }
    if (Object.keys(filtered).length > 0) {
      await env.KV.put(healthKey, JSON.stringify(filtered))
    } else {
      await env.KV.delete(healthKey).catch(() => {})
    }
  } catch (err) {
    console.error('writeHealthDirect 写入 KV 异常:', err)
  }
}

/**
 * 强制将内存中未落地的所有缓存数据一次性批量写入 KV
 */
export async function flushPendingHealthCache(env: Env): Promise<void> {
  clearGlobalTimer()
  lastFlushTimestamp = Date.now()

  if (pendingItemsCount === 0 && Object.keys(pendingHealthCache).length === 0) {
    return
  }

  try {
    const entries = Object.entries(pendingHealthCache)
    for (const [providerId, health] of entries) {
      await writeHealthDirect(env, providerId, health)
      delete pendingHealthCache[providerId]
    }
  } catch (err) {
    console.error('flushPendingHealthCache 批量落盘异常:', err)
  } finally {
    pendingItemsCount = 0
  }
}

/**
 * 每次请求后置校验落盘条件（解决 Cloudflare Worker 无常驻后台定时器的问题）
 */
export async function checkAndFlushOnRequest(env: Env): Promise<void> {
  if (debugConfig.debugMode) return

  const elapsed = Date.now() - lastFlushTimestamp
  if (elapsed >= debugConfig.flushIntervalSec * 1000 || pendingItemsCount >= debugConfig.maxCacheItems) {
    await flushPendingHealthCache(env)
  }
}

/**
 * 更新调试模式与缓存配置
 */
export async function updateDebugConfig(env: Env, updates: Partial<DebugConfig>): Promise<DebugConfig> {
  const oldMode = debugConfig.debugMode
  const newMode = updates.debugMode !== undefined ? updates.debugMode : oldMode

  if (oldMode !== newMode) {
    await flushPendingHealthCache(env)
    if (newMode) {
      clearGlobalTimer()
    }
  }

  debugConfig = {
    ...debugConfig,
    ...updates,
  }

  if (!debugConfig.debugMode && pendingItemsCount > 0) {
    ensureGlobalTimer(env)
  }

  return { ...debugConfig }
}

