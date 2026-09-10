/**
 * 版本号: v1.0.48
 * 模块: 数据持久化层（KV 存储读写与顺风车打包）
 */
import {
  KV_KEYS,
  DEFAULT_TIER_CONFIG,
  MAX_SESSION_STICKINESS_HISTORY,
  SESSION_STICKINESS_TTL_SECONDS,
} from './config'
import { flushLogsToKv } from './log'
import type {
  Env,
  Provider,
  ProxyKey,
  Session,
  TierConfig,
  AuditionCursor,
  ProbeResult,
  ModelBusinessLatencyStats,
  BusinessLatencySample,
  SessionStickinessRecord,
  CustomRouteRule,
} from './types'

// ===== 会话专属调度粘性策略（单会话最多保存最近5条成功模型，带过期时间TTL，保护免费版KV每日1000写配额） =====

// 内存暂存缓存，用于同一请求生命周期内快速复用
const stickinessMemoryCache: Record<string, SessionStickinessRecord> = {}

export async function getSessionStickiness(env: Env, sessionId: string): Promise<SessionStickinessRecord | null> {
  if (!sessionId) return null
  // 1. 优先从内存缓存中获取
  if (stickinessMemoryCache[sessionId]) {
    return stickinessMemoryCache[sessionId]
  }
  // 2. 从 KV 读取
  const key = `${KV_KEYS.SESSION_STICKINESS_PREFIX}${sessionId}`
  const data = await env.KV.get(key)
  if (data) {
    try {
      const parsed = JSON.parse(data) as SessionStickinessRecord
      stickinessMemoryCache[sessionId] = parsed
      return parsed
    } catch { /* ignore */ }
  }
  return null
}

export async function recordSessionSuccessModel(
  env: Env,
  sessionId: string,
  providerId: string,
  modelId: string
): Promise<void> {
  if (!sessionId || !providerId || !modelId) return

  const now = Date.now()
  let record = await getSessionStickiness(env, sessionId)
  if (!record) {
    record = {
      sessionId,
      history: [],
      updatedAt: now,
    }
  }

  // 检查是否已经是最近一条，避免频繁写 KV
  const top = record.history[0]
  if (top && top.providerId === providerId && top.modelId === modelId && (now - top.lastSuccessAt < 60000)) {
    // 1 分钟内相同会话同一模型连续调用，不重复触发 KV 写入，节省免费写配额
    return
  }

  // 移出已存在的同模型记录（提到最前）
  record.history = record.history.filter(h => !(h.providerId === providerId && h.modelId === modelId))
  record.history.unshift({
    providerId,
    modelId,
    lastSuccessAt: now,
  })

  // 约束：单会话最多保存最近 5 条成功模型
  if (record.history.length > MAX_SESSION_STICKINESS_HISTORY) {
    record.history = record.history.slice(0, MAX_SESSION_STICKINESS_HISTORY)
  }
  record.updatedAt = now

  // 更新内存缓存
  stickinessMemoryCache[sessionId] = record

  // 写入 KV（设置过期时间 TTL，自动清理不占配额）
  const key = `${KV_KEYS.SESSION_STICKINESS_PREFIX}${sessionId}`
  await env.KV.put(key, JSON.stringify(record), {
    expirationTtl: SESSION_STICKINESS_TTL_SECONDS,
  })

  // 顺风车检查并打包内存中暂存的日志一同持久化至 KV
  await flushLogsToKv(env)
}

// ===== 游标、探测日志与真实业务延迟持久化（三大隔离数据通道） =====

// 1. 海选轮询游标（持久化至 KV，实例重启不丢失）
export async function getAuditionCursor(env: Env): Promise<AuditionCursor> {
  const data = await env.KV.get(KV_KEYS.PROBE_AUDITION_CURSOR)
  if (!data) return { providerIndex: 0, modelIndex: 0 }
  try {
    return JSON.parse(data) as AuditionCursor
  } catch {
    return { providerIndex: 0, modelIndex: 0 }
  }
}

export async function saveAuditionCursor(env: Env, cursor: AuditionCursor): Promise<void> {
  await env.KV.put(KV_KEYS.PROBE_AUDITION_CURSOR, JSON.stringify(cursor))
  // 顺风车落盘
  await flushLogsToKv(env)
}

// 2. 海选探测日志与 OpenClaw 专属探测日志（完全隔离，仅保留最近20条，不参与真实业务淘汰）
export async function getProbeLogs(env: Env, type: 'audition' | 'openclaw'): Promise<ProbeResult[]> {
  const key = type === 'audition' ? KV_KEYS.PROBE_AUDITION_LOGS : KV_KEYS.PROBE_OPENCLAW_LOGS
  const data = await env.KV.get(key)
  return data ? JSON.parse(data) : []
}

export async function recordProbeLog(env: Env, result: ProbeResult): Promise<void> {
  const key = result.type === 'audition' ? KV_KEYS.PROBE_AUDITION_LOGS : KV_KEYS.PROBE_OPENCLAW_LOGS
  const list = await getProbeLogs(env, result.type)
  list.unshift(result)
  // 最多保留最新 20 条探测日志，减少 KV 体积
  const trimmed = list.slice(0, 20)
  await env.KV.put(key, JSON.stringify(trimmed))
  // 顺风车落盘
  await flushLogsToKv(env)
}

// 3. 真实业务延迟样本（每个模型保留最近 50 条，超出丢弃旧样本，梯队动态淘汰仅采信此数据）
const MAX_BUSINESS_LATENCY_SAMPLES = 50

export async function getModelBusinessLatency(env: Env, providerId: string, modelId: string): Promise<ModelBusinessLatencyStats> {
  const key = `${KV_KEYS.BUSINESS_LATENCY_PREFIX}${providerId}:${modelId}`
  const data = await env.KV.get(key)
  if (data) {
    try {
      return JSON.parse(data) as ModelBusinessLatencyStats
    } catch { /* ignore */ }
  }
  return {
    providerId,
    modelId,
    samples: [],
    averageLatencyMs: 0,
    lastUpdated: Date.now(),
  }
}

// 记录单次真实业务延迟（仅限真实业务 API 成功响应时调用）
export async function recordBusinessLatency(
  env: Env,
  providerId: string,
  modelId: string,
  sample: BusinessLatencySample
): Promise<void> {
  const key = `${KV_KEYS.BUSINESS_LATENCY_PREFIX}${providerId}:${modelId}`
  const stats = await getModelBusinessLatency(env, providerId, modelId)

  // 滑动窗口：追加新样本到头部，保留最多 50 条
  stats.samples.unshift(sample)
  if (stats.samples.length > MAX_BUSINESS_LATENCY_SAMPLES) {
    stats.samples = stats.samples.slice(0, MAX_BUSINESS_LATENCY_SAMPLES)
  }

  // 重新计算有效样本的真实平均延迟
  const validSamples = stats.samples.filter(s => s.success && s.latencyMs > 0)
  if (validSamples.length > 0) {
    const total = validSamples.reduce((sum, s) => sum + s.latencyMs, 0)
    stats.averageLatencyMs = Math.round(total / validSamples.length)
  } else {
    stats.averageLatencyMs = sample.latencyMs
  }
  stats.lastUpdated = Date.now()

  await env.KV.put(key, JSON.stringify(stats))

  // 顺风车检查并打包内存中暂存的日志一同持久化至 KV
  await flushLogsToKv(env)
}

// ===== 梯队池 CRUD =====
// 从 KV 中获取三大梯队配置，若不存在则回退至默认配置（保障单次写入）
export async function getTierConfig(env: Env): Promise<TierConfig> {
  const data = await env.KV.get(KV_KEYS.TIERS)
  if (!data) return DEFAULT_TIER_CONFIG
  try {
    const parsed = JSON.parse(data) as TierConfig
    return {
      tier1: { ...DEFAULT_TIER_CONFIG.tier1, ...(parsed.tier1 || {}) },
      tier2: { ...DEFAULT_TIER_CONFIG.tier2, ...(parsed.tier2 || {}) },
      tier3: { ...DEFAULT_TIER_CONFIG.tier3, ...(parsed.tier3 || {}) },
    }
  } catch {
    return DEFAULT_TIER_CONFIG
  }
}

// 将三大梯队配置一次性持久化至 KV
export async function setTierConfig(env: Env, config: TierConfig): Promise<void> {
  await env.KV.put(KV_KEYS.TIERS, JSON.stringify(config))
  // 顺风车落盘
  await flushLogsToKv(env)
}

/**
 * 顺风车批量查询梯队模型双延迟数据（海选探测延迟 + 真实调用平均延迟）
 * 严格遵循 Cloudflare KV 免费配额控制：只读不写
 */
export async function getTierModelLatencies(
  env: Env,
  tierConfig: TierConfig
): Promise<Record<string, { probeLatency: number | null; realLatency: number | null }>> {
  const result: Record<string, { probeLatency: number | null; realLatency: number | null }> = {}

  // 1. 读取海选探测日志列表（仅需 1 次 KV 读取）
  const auditionLogs = await getProbeLogs(env, 'audition')
  const probeMap = new Map<string, number>()
  for (const log of auditionLogs) {
    if (log.success && typeof log.latencyMs === 'number') {
      const key = `${log.providerId}:${log.modelId}`
      if (!probeMap.has(key)) {
        probeMap.set(key, log.latencyMs)
      }
    }
  }

  // 2. 汇总三大梯队当前在席的所有模型标识 (providerId:modelId)
  const modelKeys = new Set<string>()
  const tiers = [tierConfig.tier1, tierConfig.tier2, tierConfig.tier3]
  for (const tier of tiers) {
    if (tier && Array.isArray(tier.models)) {
      for (const m of tier.models) {
        modelKeys.add(`${m.providerId}:${m.modelId}`)
      }
    }
  }

  // 3. 并行并发读取真实业务延迟统计（搭顺风车读，不产生 KV 写入）
  await Promise.all(
    Array.from(modelKeys).map(async (key) => {
      const parts = key.split(':')
      const providerId = parts[0]
      const modelId = parts.slice(1).join(':')
      const probeLat = probeMap.has(key) ? probeMap.get(key)! : null
      let realLat: number | null = null

      try {
        const stats = await getModelBusinessLatency(env, providerId, modelId)
        if (stats && stats.averageLatencyMs > 0) {
          realLat = stats.averageLatencyMs
        }
      } catch {
        /* 错误静默降级，不阻断页面渲染 */
      }

      result[key] = {
        probeLatency: probeLat,
        realLatency: realLat,
      }
    })
  )

  return result
}

// ===== 自定义路由规则 CRUD =====
export async function getCustomRoutes(env: Env): Promise<CustomRouteRule[]> {
  const data = await env.KV.get(KV_KEYS.CUSTOM_ROUTES)
  return data ? JSON.parse(data) : []
}

export async function setCustomRoutes(env: Env, routes: CustomRouteRule[]): Promise<void> {
  await env.KV.put(KV_KEYS.CUSTOM_ROUTES, JSON.stringify(routes))
  // 顺风车落盘
  await flushLogsToKv(env)
}

// ===== 提供商 CRUD =====

export async function getProviders(env: Env): Promise<Provider[]> {
  const data = await env.KV.get(KV_KEYS.PROVIDERS)
  return data ? JSON.parse(data) : []
}

export async function getProvider(env: Env, id: string): Promise<Provider | null> {
  const providers = await getProviders(env)
  return providers.find((p) => p.id === id) ?? null
}

export async function setProviders(env: Env, providers: Provider[]): Promise<void> {
  await env.KV.put(KV_KEYS.PROVIDERS, JSON.stringify(providers))
  // 顺风车落盘
  await flushLogsToKv(env)
}

export async function addProvider(env: Env, provider: Provider): Promise<void> {
  const providers = await getProviders(env)
  providers.push(provider)
  await setProviders(env, providers)
}

export async function updateProvider(env: Env, id: string, updates: Partial<Provider>): Promise<Provider | null> {
  const providers = await getProviders(env)
  const index = providers.findIndex((p) => p.id === id)
  if (index === -1) return null
  providers[index] = { ...providers[index], ...updates, updatedAt: new Date().toISOString() }
  await setProviders(env, providers)
  return providers[index]
}

export async function deleteProvider(env: Env, id: string): Promise<boolean> {
  const providers = await getProviders(env)
  const filtered = providers.filter((p) => p.id !== id)
  if (filtered.length === providers.length) return false
  await setProviders(env, filtered)
  return true
}

// ===== Session 管理 =====

export async function createSession(env: Env, username: string, ttlSeconds: number): Promise<string> {
  const sessionId = crypto.randomUUID()
  const session: Session = {
    username,
    expiresAt: Date.now() + ttlSeconds * 1000,
  }
  await env.KV.put(KV_KEYS.SESSION_PREFIX + sessionId, JSON.stringify(session), {
    expirationTtl: ttlSeconds,
  })
  return sessionId
}

export async function getSession(env: Env, sessionId: string): Promise<Session | null> {
  const data = await env.KV.get(KV_KEYS.SESSION_PREFIX + sessionId)
  if (!data) return null
  const session: Session = JSON.parse(data)
  if (session.expiresAt < Date.now()) {
    await deleteSession(env, sessionId)
    return null
  }
  return session
}

export async function deleteSession(env: Env, sessionId: string): Promise<void> {
  await env.KV.delete(KV_KEYS.SESSION_PREFIX + sessionId)
}

// ===== 转发 Key =====

export async function getProxyKeys(env: Env): Promise<ProxyKey[]> {
  const data = await env.KV.get(KV_KEYS.PROXY_KEYS)
  return data ? JSON.parse(data) : []
}

export async function setProxyKeys(env: Env, keys: ProxyKey[]): Promise<void> {
  await env.KV.put(KV_KEYS.PROXY_KEYS, JSON.stringify(keys))
  // 顺风车落盘
  await flushLogsToKv(env)
}

export async function addProxyKey(env: Env, key: ProxyKey): Promise<void> {
  const keys = await getProxyKeys(env)
  keys.push(key)
  await setProxyKeys(env, keys)
}

export async function deleteProxyKey(env: Env, id: string): Promise<boolean> {
  const keys = await getProxyKeys(env)
  const filtered = keys.filter((k) => k.id !== id)
  if (filtered.length === keys.length) return false
  await setProxyKeys(env, filtered)
  return true
}

export async function updateProxyKey(env: Env, id: string, updates: Partial<ProxyKey>): Promise<ProxyKey | null> {
  const keys = await getProxyKeys(env)
  const idx = keys.findIndex(k => k.id === id)
  if (idx === -1) return null
  keys[idx] = { ...keys[idx], ...updates }
  await setProxyKeys(env, keys)
  return keys[idx]
}

export async function validateProxyKey(env: Env, key: string): Promise<boolean> {
  const keys = await getProxyKeys(env)
  return keys.some((k) => {
    if (k.key !== key || !k.enabled) return false
    if (k.expiresAt) {
      const now = Date.now()
      const expires = new Date(k.expiresAt).getTime()
      if (now >= expires) return false
    }
    return true
  })
}

// ===== 初始数据填充 =====

import { DEFAULT_PROVIDERS, PROXY_KEY_PREFIX } from './config'

export async function seedInitialData(env: Env): Promise<void> {
  const providers = await getProviders(env)
  const migrationCompleted = await env.KV.get(KV_KEYS.OPENCODE_MIGRATION)
  const opencode = DEFAULT_PROVIDERS.find((provider) => provider.id === 'opencode')

  if (!migrationCompleted) {
    if (opencode && !providers.some((provider) => provider.id === opencode.id)) {
      await setProviders(env, [
        ...providers,
        {
          ...opencode,
          apiKeys: opencode.apiKeys.map((key) => ({ ...key })),
          models: opencode.models.map((model) => ({ ...model })),
        },
      ])
    }
    await env.KV.put(KV_KEYS.OPENCODE_MIGRATION, '1')
  }

  // 仅首次运行时创建测试转发 Key
  if (providers.length === 0 && !migrationCompleted) {
    const keys = await getProxyKeys(env)
    if (keys.length === 0) {
      const testKey = {
        id: crypto.randomUUID(),
        key: `${PROXY_KEY_PREFIX}${crypto.randomUUID().replace(/-/g, '').substring(0, 16)}`,
        name: '测试 Key',
        enabled: true,
        createdAt: new Date().toISOString(),
      }
      await addProxyKey(env, testKey)
    }
  }
}
