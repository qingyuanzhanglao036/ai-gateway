/**
 * 版本号: v1.0.12
 * 模块: 内存日志管理、调试开关控制与正式模式内存缓存顺风车批量落盘（移除 setTimeout 定时器彻底解决 Error 1101）
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

// 上次执行落盘的时间戳，用于 Worker 每次请求后置顺风车校验
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
  // 判断是否处于调试模式
  if (debugConfig.debugMode) {
    // 调试模式仅保留失败或超时日志
    const isErrorOrTimeout = data.statusCode >= 400 || (data.failReason && data.failReason !== '-')
    if (!isErrorOrTimeout) return
  }

  // 构建带 UUID 的日志记录
  const entry: LogEntry = {
    id: crypto.randomUUID(),
    ...data,
  }

  // 超过最大缓存限制则弹出旧日志
  if (memoryLogs.length >= MAX_MEMORY_LOGS) {
    memoryLogs.shift()
  }
  memoryLogs.push(entry)
}

/**
 * 获取当前所有内存日志（倒序）
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
  // 调试模式直接单次写入 KV
  if (debugConfig.debugMode) {
    await writeHealthDirect(env, providerId, health)
    return
  }

  // 写入暂存队列
  pendingHealthCache[providerId] = health
  pendingItemsCount++

  // 达到队列上限立即顺风车落盘
  if (pendingItemsCount >= debugConfig.maxCacheItems) {
    await flushPendingHealthCache(env)
  }
}

/**
 * 清理全局定时器占位函数（兼容保留，防止其他模块调用报错）
 */
export function clearGlobalTimer(): void {
  // Cloudflare Worker 不再使用 setTimeout 定时器
}

/**
 * 直接将单个提供商的健康状态写入 KV（底层封装，带空指针保护）
 */
async function writeHealthDirect(env: Env, providerId: string, health: HealthMap): Promise<void> {
  // 防护：若无 KV 绑定则安全跳过
  if (!env?.KV) return
  try {
    const healthKey = KV_KEYS.KEY_HEALTH_PREFIX + providerId
    const filtered: HealthMap = {}
    // 仅过滤保留存在失败记录的 Key
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
  lastFlushTimestamp = Date.now()

  // 若无积压数据则跳过
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
 * 每次请求后置顺风车校验落盘条件（完全依托请求生命周期，无后台定时器崩溃风险）
 */
export async function checkAndFlushOnRequest(env: Env): Promise<void> {
  if (debugConfig.debugMode) return

  // 计算距离上次落盘时间
  const elapsed = Date.now() - lastFlushTimestamp
  // 超过时间间隔或条数达到上限时顺风车落盘
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

  // 切换调试模式瞬间，先清理并落盘一次
  if (oldMode !== newMode) {
    await flushPendingHealthCache(env)
  }

  debugConfig = {
    ...debugConfig,
    ...updates,
  }

  return { ...debugConfig }
}


