/**
 * 版本号: v1.0.3
 * 模块: 内存日志管理、调试开关控制与正式模式内存缓存批量落盘
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
  // 判断当前是否处于调试模式
  if (debugConfig.debugMode) {
    // 调试模式只保留报错 (状态码 >= 400) 或有明确失败原因/超时的日志
    const isErrorOrTimeout = data.statusCode >= 400 || (data.failReason && data.failReason !== '-')
    if (!isErrorOrTimeout) return
  }

  // 生成唯一日志项
  const entry: LogEntry = {
    id: crypto.randomUUID(),
    ...data,
  }

  // 内存环形队列存储：若超过最大条数，丢弃最旧日志
  if (memoryLogs.length >= MAX_MEMORY_LOGS) {
    memoryLogs.shift()
  }
  memoryLogs.push(entry)
}

/**
 * 获取当前所有内存日志
 */
export function getMemoryLogs(): LogEntry[] {
  // 按时间倒序返回，最新的在最前面
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
  // 如果开启了调试模式，则直接写入 KV，不启用批处理队列
  if (debugConfig.debugMode) {
    await writeHealthDirect(env, providerId, health)
    return
  }

  // 正式模式：将健康更新暂存在内存缓存中
  pendingHealthCache[providerId] = health
  pendingItemsCount++

  // 检查是否达到队列最大条数，若达到则立即统一写入 KV
  if (pendingItemsCount >= debugConfig.maxCacheItems) {
    await flushPendingHealthCache(env)
    return
  }

  // 若尚未启动定时器，启动 30 秒全局唯一定时器
  ensureGlobalTimer(env)
}

/**
 * 确保启动唯一的全局 30 秒落盘定时器
 */
function ensureGlobalTimer(env: Env): void {
  // 如果已有活跃定时器，不重复创建
  if (globalTimerHandle !== null) return

  // 设定定时器，达到指定秒数强制清空落盘
  globalTimerHandle = setTimeout(async () => {
    globalTimerHandle = null
    await flushPendingHealthCache(env)
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
 * 直接将单个提供商的健康状态写入 KV（底层封装）
 */
async function writeHealthDirect(env: Env, providerId: string, health: HealthMap): Promise<void> {
  const healthKey = KV_KEYS.KEY_HEALTH_PREFIX + providerId
  const filtered: HealthMap = {}
  // 仅保存有失败记录的 key，避免 KV 存储浪费
  for (const [k, v] of Object.entries(health)) {
    if (v.failures > 0) filtered[k] = v
  }
  if (Object.keys(filtered).length > 0) {
    await env.KV.put(healthKey, JSON.stringify(filtered))
  } else {
    await env.KV.delete(healthKey).catch(() => {})
  }
}

/**
 * 强制将内存中未落地的所有缓存数据一次性批量写入 KV
 */
export async function flushPendingHealthCache(env: Env): Promise<void> {
  // 清理现有定时器
  clearGlobalTimer()

  // 更新最后落盘时间戳
  lastFlushTimestamp = Date.now()

  // 如果没有积压的缓存，直接退出
  if (pendingItemsCount === 0 && Object.keys(pendingHealthCache).length === 0) {
    return
  }

  // 批量写入所有积压的提供商健康数据
  const entries = Object.entries(pendingHealthCache)
  for (const [providerId, health] of entries) {
    await writeHealthDirect(env, providerId, health)
    delete pendingHealthCache[providerId]
  }

  // 重置积压计数器
  pendingItemsCount = 0
}

/**
 * 每次请求后置校验落盘条件（解决 Cloudflare Worker 无常驻后台定时器的问题）
 */
export async function checkAndFlushOnRequest(env: Env): Promise<void> {
  // 如果处于调试模式，无需后置落盘检查
  if (debugConfig.debugMode) return

  const elapsed = Date.now() - lastFlushTimestamp
  // 如果达到时间周期或缓存条数已满，触发落盘
  if (elapsed >= debugConfig.flushIntervalSec * 1000 || pendingItemsCount >= debugConfig.maxCacheItems) {
    await flushPendingHealthCache(env)
  }
}

/**
 * 更新调试模式与缓存配置
 * 切换调试模式瞬间，强制统一执行一次落盘，防止数据丢失
 */
export async function updateDebugConfig(env: Env, updates: Partial<DebugConfig>): Promise<DebugConfig> {
  const oldMode = debugConfig.debugMode
  const newMode = updates.debugMode !== undefined ? updates.debugMode : oldMode

  // 切换调试模式瞬间：内存未落地缓存强制统一执行一次落盘，防止数据丢失
  if (oldMode !== newMode) {
    await flushPendingHealthCache(env)
    if (newMode) {
      // 开启调试模式，清理后台定时器
      clearGlobalTimer()
    }
  }

  // 更新配置项
  debugConfig = {
    ...debugConfig,
    ...updates,
  }

  // 如果仍在正式模式且有待写项，重新挂载定时器
  if (!debugConfig.debugMode && pendingItemsCount > 0) {
    ensureGlobalTimer(env)
  }

  return { ...debugConfig }
}
