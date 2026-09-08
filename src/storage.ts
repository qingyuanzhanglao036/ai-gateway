/**
 * 版本号: v1.0.12
 * 模块: 数据持久化层（KV 存储读写与顺风车打包，全函数增强空指针与异常防护）
 */
import {
  KV_KEYS,
  DEFAULT_TIER_CONFIG,
  DEFAULT_PROVIDERS,
  PROXY_KEY_PREFIX,
  MAX_SESSION_STICKINESS_HISTORY,
  SESSION_STICKINESS_TTL_SECONDS,
} from './config'
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
} from './types'

// ===== 会话专属调度粘性策略 =====

const stickinessMemoryCache: Record<string, SessionStickinessRecord> = {}

export async function getSessionStickiness(env: Env, sessionId: string): Promise<SessionStickinessRecord | null> {
  if (!sessionId || !env?.KV) return null
  if (stickinessMemoryCache[sessionId]) {
    return stickinessMemoryCache[sessionId]
  }
  try {
    const key = `${KV_KEYS.SESSION_STICKINESS_PREFIX}${sessionId}`
    const data = await env.KV.get(key)
    if (data) {
      const parsed = JSON.parse(data) as SessionStickinessRecord
      stickinessMemoryCache[sessionId] = parsed
      return parsed
    }
  } catch (err) {
    console.error('getSessionStickiness 异常:', err)
  }
  return null
}

export async function recordSessionSuccessModel(
  env: Env,
  sessionId: string,
  providerId: string,
  modelId: string
): Promise<void> {
  if (!sessionId || !providerId || !modelId || !env?.KV) return

  const now = Date.now()
  let record = await getSessionStickiness(env, sessionId)
  if (!record) {
    record = {
      sessionId,
      history: [],
      updatedAt: now,
    }
  }

  const top = record.history[0]
  if (top && top.providerId === providerId && top.modelId === modelId && (now - top.lastSuccessAt < 60000)) {
    return
  }

  record.history = record.history.filter(h => !(h.providerId === providerId && h.modelId === modelId))
  record.history.unshift({
    providerId,
    modelId,
    lastSuccessAt: now,
  })

  if (record.history.length > MAX_SESSION_STICKINESS_HISTORY) {
    record.history = record.history.slice(0, MAX_SESSION_STICKINESS_HISTORY)
  }
  record.updatedAt = now

  stickinessMemoryCache[sessionId] = record

  try {
    const key = `${KV_KEYS.SESSION_STICKINESS_PREFIX}${sessionId}`
    await env.KV.put(key, JSON.stringify(record), {
      expirationTtl: SESSION_STICKINESS_TTL_SECONDS,
    })
  } catch (err) {
    console.error('recordSessionSuccessModel 异常:', err)
  }
}

// ===== 游标、探测日志与真实业务延迟持久化 =====

export async function getAuditionCursor(env: Env): Promise<AuditionCursor> {
  if (!env?.KV) return { providerIndex: 0, modelIndex: 0 }
  try {
    const data = await env.KV.get(KV_KEYS.PROBE_AUDITION_CURSOR)
    if (!data) return { providerIndex: 0, modelIndex: 0 }
    return JSON.parse(data) as AuditionCursor
  } catch (err) {
    console.error('getAuditionCursor 异常:', err)
    return { providerIndex: 0, modelIndex: 0 }
  }
}

export async function saveAuditionCursor(env: Env, cursor: AuditionCursor): Promise<void> {
  if (!env?.KV) return
  try {
    await env.KV.put(KV_KEYS.PROBE_AUDITION_CURSOR, JSON.stringify(cursor))
  } catch (err) {
    console.error('saveAuditionCursor 异常:', err)
  }
}

export async function getProbeLogs(env: Env, type: 'audition' | 'openclaw'): Promise<ProbeResult[]> {
  if (!env?.KV) return []
  try {
    const key = type === 'audition' ? KV_KEYS.PROBE_AUDITION_LOGS : KV_KEYS.PROBE_OPENCLAW_LOGS
    const data = await env.KV.get(key)
    return data ? JSON.parse(data) : []
  } catch (err) {
    console.error('getProbeLogs 异常:', err)
    return []
  }
}

export async function recordProbeLog(env: Env, result: ProbeResult): Promise<void> {
  if (!env?.KV) return
  try {
    const key = result.type === 'audition' ? KV_KEYS.PROBE_AUDITION_LOGS : KV_KEYS.PROBE_OPENCLAW_LOGS
    const list = await getProbeLogs(env, result.type)
    list.unshift(result)
    const trimmed = list.slice(0, 20)
    await env.KV.put(key, JSON.stringify(trimmed))
  } catch (err) {
    console.error('recordProbeLog 异常:', err)
  }
}

const MAX_BUSINESS_LATENCY_SAMPLES = 50

export async function getModelBusinessLatency(env: Env, providerId: string, modelId: string): Promise<ModelBusinessLatencyStats> {
  const fallback: ModelBusinessLatencyStats = {
    providerId,
    modelId,
    samples: [],
    averageLatencyMs: 0,
    lastUpdated: Date.now(),
  }
  if (!env?.KV) return fallback
  try {
    const key = `${KV_KEYS.BUSINESS_LATENCY_PREFIX}${providerId}:${modelId}`
    const data = await env.KV.get(key)
    if (data) {
      return JSON.parse(data) as ModelBusinessLatencyStats
    }
  } catch (err) {
    console.error('getModelBusinessLatency 异常:', err)
  }
  return fallback
}

export async function recordBusinessLatency(
  env: Env,
  providerId: string,
  modelId: string,
  sample: BusinessLatencySample
): Promise<void> {
  if (!env?.KV) return
  try {
    const key = `${KV_KEYS.BUSINESS_LATENCY_PREFIX}${providerId}:${modelId}`
    const stats = await getModelBusinessLatency(env, providerId, modelId)

    stats.samples.unshift(sample)
    if (stats.samples.length > MAX_BUSINESS_LATENCY_SAMPLES) {
      stats.samples = stats.samples.slice(0, MAX_BUSINESS_LATENCY_SAMPLES)
    }

    const validSamples = stats.samples.filter(s => s.success && s.latencyMs > 0)
    if (validSamples.length > 0) {
      const total = validSamples.reduce((sum, s) => sum + s.latencyMs, 0)
      stats.averageLatencyMs = Math.round(total / validSamples.length)
    } else {
      stats.averageLatencyMs = sample.latencyMs
    }
    stats.lastUpdated = Date.now()

    await env.KV.put(key, JSON.stringify(stats))
  } catch (err) {
    console.error('recordBusinessLatency 异常:', err)
  }
}

// ===== 梯队池 CRUD =====

export async function getTierConfig(env: Env): Promise<TierConfig> {
  if (!env?.KV) return DEFAULT_TIER_CONFIG
  try {
    const data = await env.KV.get(KV_KEYS.TIERS)
    if (!data) return DEFAULT_TIER_CONFIG
    const parsed = JSON.parse(data) as TierConfig
    return {
      tier1: { ...DEFAULT_TIER_CONFIG.tier1, ...(parsed.tier1 || {}) },
      tier2: { ...DEFAULT_TIER_CONFIG.tier2, ...(parsed.tier2 || {}) },
      tier3: { ...DEFAULT_TIER_CONFIG.tier3, ...(parsed.tier3 || {}) },
    }
  } catch (err) {
    console.error('getTierConfig 异常:', err)
    return DEFAULT_TIER_CONFIG
  }
}

export async function setTierConfig(env: Env, config: TierConfig): Promise<void> {
  if (!env?.KV) return
  try {
    await env.KV.put(KV_KEYS.TIERS, JSON.stringify(config))
  } catch (err) {
    console.error('setTierConfig 异常:', err)
  }
}

// ===== 提供商 CRUD =====

export async function getProviders(env: Env): Promise<Provider[]> {
  if (!env?.KV) return []
  try {
    const data = await env.KV.get(KV_KEYS.PROVIDERS)
    return data ? JSON.parse(data) : []
  } catch (err) {
    console.error('getProviders 异常:', err)
    return []
  }
}

export async function getProvider(env: Env, id: string): Promise<Provider | null> {
  const providers = await getProviders(env)
  return providers.find((p) => p.id === id) ?? null
}

export async function setProviders(env: Env, providers: Provider[]): Promise<void> {
  if (!env?.KV) return
  try {
    await env.KV.put(KV_KEYS.PROVIDERS, JSON.stringify(providers))
  } catch (err) {
    console.error('setProviders 异常:', err)
  }
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
  if (env?.KV) {
    try {
      await env.KV.put(KV_KEYS.SESSION_PREFIX + sessionId, JSON.stringify(session), {
        expirationTtl: ttlSeconds,
      })
    } catch (err) {
      console.error('createSession 写入 KV 异常:', err)
    }
  }
  return sessionId
}

export async function getSession(env: Env, sessionId: string): Promise<Session | null> {
  if (!env?.KV || !sessionId) return null
  try {
    const data = await env.KV.get(KV_KEYS.SESSION_PREFIX + sessionId)
    if (!data) return null
    const session: Session = JSON.parse(data)
    if (session.expiresAt < Date.now()) {
      await deleteSession(env, sessionId)
      return null
    }
    return session
  } catch (err) {
    console.error('getSession 异常:', err)
    return null
  }
}

export async function deleteSession(env: Env, sessionId: string): Promise<void> {
  if (!env?.KV || !sessionId) return
  try {
    await env.KV.delete(KV_KEYS.SESSION_PREFIX + sessionId)
  } catch (err) {
    console.error('deleteSession 异常:', err)
  }
}

// ===== 转发 Key =====

export async function getProxyKeys(env: Env): Promise<ProxyKey[]> {
  if (!env?.KV) return []
  try {
    const data = await env.KV.get(KV_KEYS.PROXY_KEYS)
    return data ? JSON.parse(data) : []
  } catch (err) {
    console.error('getProxyKeys 异常:', err)
    return []
  }
}

export async function setProxyKeys(env: Env, keys: ProxyKey[]): Promise<void> {
  if (!env?.KV) return
  try {
    await env.KV.put(KV_KEYS.PROXY_KEYS, JSON.stringify(keys))
  } catch (err) {
    console.error('setProxyKeys 异常:', err)
  }
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

export async function seedInitialData(env: Env): Promise<void> {
  if (!env?.KV) return
  try {
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
  } catch (err) {
    console.error('seedInitialData 异常:', err)
  }
}

