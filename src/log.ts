/**
 * 版本号: v1.0.55
 * 模块: 内存日志管理、错误直接落盘、顺风车打包落盘与跨节点日志读取
 */
import type { Env, LogEntry, DebugConfig } from './types'
import { KV_KEYS } from './config'

// 内存日志最大缓存条数，保留最新 50 条，控制体积
const MAX_MEMORY_LOGS = 50

// 内存日志列表（当前 Worker 实例局部队列）
const memoryLogs: LogEntry[] = []

// 未落盘内存日志条数计数器
let unflushedLogsCount = 0

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
 * 记录一次代理请求日志（普通存入当前实例内存）
 */
export function recordLog(data: Omit<LogEntry, 'id'>): LogEntry {
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
  unflushedLogsCount++
  return entry
}

/**
 * 记录错误/超时等异常请求日志（直接强制写入 KV，确保故障排查 100% 不丢失）
 */
export async function recordErrorLogDirect(env: Env, data: Omit<LogEntry, 'id'>): Promise<LogEntry> {
  // 1. 先记录到内存队列
  const entry = recordLog(data)

  // 2. 强制触发一次 KV 顺风车落盘合并写入（把积存的内存日志与该错误日志打包写入）
  try {
    await flushLogsToKv(env, true)
  } catch (err) {
    console.error('[log] 错误日志直接写入 KV 失败:', err)
  }

  return entry
}

/**
 * 顺风车打包落盘：将内存中积攒的日志与 KV 中的日志合并写入（最多保留最近50条）
 * 严格控制 KV 写入次数：
 * 1. 若 force = true (如发生报错或有其它数据写 KV 顺风车)，只要有未落盘日志就立刻合并写入；
 * 2. 正常成功请求仅当未落盘条数达到阈值 (maxCacheItems，默认 10~20) 时才触发 1 次写入，极大节省配额。
 */
export async function flushLogsToKv(env: Env, force = false): Promise<void> {
  if (memoryLogs.length === 0) return

  // 非强制状态下，若未落盘条数尚未达到自定义打包阈值，留在内存暂不消耗 KV 写配额
  const threshold = debugConfig.maxCacheItems || 10
  if (!force && unflushedLogsCount < threshold) {
    return
  }

  try {
    // 1. 读取 KV 中现存的历史日志
    const raw = await env.KV.get(KV_KEYS.SYSTEM_RECENT_LOGS)
    let kvLogs: LogEntry[] = []
    if (raw) {
      try {
        kvLogs = JSON.parse(raw) as LogEntry[]
      } catch {
        kvLogs = []
      }
    }

    // 2. 合并当前内存日志与 KV 历史日志，按 id 去重
    const logMap = new Map<string, LogEntry>()
    for (const item of kvLogs) {
      if (item && item.id) logMap.set(item.id, item)
    }
    for (const item of memoryLogs) {
      if (item && item.id) logMap.set(item.id, item)
    }

    // 3. 转换为数组，按时间倒序排序，最多保留 50 条
    const merged = Array.from(logMap.values())
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, MAX_MEMORY_LOGS)

    // 4. 一次性打包写入 KV，重置未落盘计数器
    await env.KV.put(KV_KEYS.SYSTEM_RECENT_LOGS, JSON.stringify(merged))
    unflushedLogsCount = 0
  } catch (err) {
    console.error('[log] 顺风车落盘日志至 KV 异常:', err)
  }
}

/**
 * 获取跨节点合并后的所有最新日志（合并 KV 存储与当前内存）
 */
export async function getCombinedLogs(env: Env): Promise<LogEntry[]> {
  try {
    // 1. 从 KV 中读取持久化的日志
    const raw = await env.KV.get(KV_KEYS.SYSTEM_RECENT_LOGS)
    let kvLogs: LogEntry[] = []
    if (raw) {
      try {
        kvLogs = JSON.parse(raw) as LogEntry[]
      } catch {
        kvLogs = []
      }
    }

    // 2. 与当前内存日志合并去重
    const logMap = new Map<string, LogEntry>()
    for (const item of kvLogs) {
      if (item && item.id) logMap.set(item.id, item)
    }
    for (const item of memoryLogs) {
      if (item && item.id) logMap.set(item.id, item)
    }

    // 3. 倒序排列返回最新的日志
    return Array.from(logMap.values())
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, MAX_MEMORY_LOGS)
  } catch (err) {
    // 若读取 KV 失败，降级返回内存日志
    return [...memoryLogs].reverse()
  }
}

/**
 * 清空所有日志（同时清空内存与 KV）
 */
export async function clearAllLogs(env: Env): Promise<void> {
  memoryLogs.length = 0
  unflushedLogsCount = 0
  try {
    await env.KV.delete(KV_KEYS.SYSTEM_RECENT_LOGS)
  } catch (err) {
    console.error('[log] 清空 KV 日志异常:', err)
  }
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

  // 顺风车一起打包刷写日志
  await flushLogsToKv(env)

  // 如果没有积压的健康缓存，直接退出
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
