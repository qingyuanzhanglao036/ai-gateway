/**
 * 版本号: v1.0.59
 * 模块: API 代理请求转发、健康探测、梯队路由调度与会话专属调度粘性策略
 */
import { Context } from 'hono'
import {
  getProvider,
  getProviders,
  setProviders,
  getTierConfig,
  setTierConfig,
  getCustomRoutes,
  recordBusinessLatency,
  getSessionStickiness,
  recordSessionSuccessModel,
  getModelBusinessLatency,
} from './storage'
import { triggerTierRefill } from './probe'
import {
  KV_KEYS,
  KEY_HEALTH_COOLDOWN_MS,
  KEY_HEALTH_MAX_FAILURES,
  MODEL_COOLDOWN_DURATION_MS,
  MODEL_MAX_PROBE_FAILURES,
} from './config'
import type { Env, ProxyRequestBody, TierKey, Provider, TierConfig } from './types'
import { isOpenCodeProvider, proxyOpenCodeRequest, resolveOpenCodeUrls } from './opencode'
import { recordLog, recordErrorLogDirect, queueHealthUpdate, checkAndFlushOnRequest, flushLogsToKv } from './log'

// 内存中记录各梯队池上次调用的模型标识，用于检测是否发生模型切换并提醒用户
const lastActiveModelByTier: Record<string, string> = {}

// ===== Key 健康状态类型和辅助函数 =====

interface KeyHealth {
  failures: number
  lastFailed: boolean
  demotedAt?: number  // 首次达到降权阈值的时间戳 (Date.now())
}
type HealthMap = Record<string, KeyHealth>

const HEALTH_KEY = (providerId: string) => KV_KEYS.KEY_HEALTH_PREFIX + providerId

async function readHealth(env: Env, providerId: string): Promise<HealthMap> {
  const raw = await env.KV.get(HEALTH_KEY(providerId))
  return raw ? JSON.parse(raw) : {}
}

/**
 * 写入/更新 Key 健康状态
 * 正式模式下走内存缓存批量聚合，达到条数或 30 秒定时落盘，避免频繁写入 KV
 */
async function writeHealth(env: Env, providerId: string, health: HealthMap): Promise<void> {
  await queueHealthUpdate(env, providerId, health)
}

/** 提取客户端会话 ID（支持 header 和 key 指纹） */
function extractSessionId(c: Context<{ Bindings: Env }>, body: ProxyRequestBody, rawKey: string): string {
  // 1. 优先从常用会话 Header 中获取
  const headerSessionId = c.req.header('x-session-id') ||
    c.req.header('x-conversation-id') ||
    c.req.header('session-id') ||
    c.req.header('conversation-id')
  if (headerSessionId) return headerSessionId.trim()

  // 2. 从 body 的 user 字段提取
  if (body && typeof body.user === 'string' && body.user.trim()) {
    return `user:${body.user.trim()}`
  }

  // 3. 基于 client Key 生成会话指纹
  return `key:${rawKey}`
}

/** 解析模型 ID，如 "deepseek/deepseek-chat" → { providerId, modelId } */
function parseModelId(model: string): { providerId: string; modelId: string } | null {
  const slashIndex = model.indexOf('/')
  if (slashIndex === -1) return null
  return {
    providerId: model.substring(0, slashIndex),
    modelId: model.substring(slashIndex + 1),
  }
}

/**
 * 根据请求模型字符串智能解析实际调度的模型
 * 支持：
 * 1. 梯队自动路由别名（如 flagship/auto、openclaw/auto、drawing/auto）
 * 2. 同一会话优先复用历史成功模型（前提是模型仍处于当前梯队在席且健康）
 * 3. 降级策略：梯队内在席模型按历史业务延迟择优调度
 */
async function resolveScheduledModel(
  env: Env,
  requestedModel: string,
  sessionId: string,
  providers: Provider[],
  tiers: TierConfig
): Promise<{ providerId: string; modelId: string; tierKey?: TierKey; matchedBySession?: boolean } | null> {
  const lower = requestedModel.toLowerCase()

  // ===== 自定义指定路由规则（最高优先级） =====
  const customRoutes = await getCustomRoutes(env)
  const matchedRule = customRoutes.find(
    r => r.enabled && r.alias.toLowerCase() === lower
  )

  if (matchedRule) {
    const targetLower = matchedRule.target.toLowerCase()
    // 检查目标是否指向某个梯队别名
    if (
      targetLower === 'flagship/auto' || targetLower === 'tier1/auto' || targetLower === 'tier1' ||
      targetLower === 'openclaw/auto' || targetLower === 'tier2/auto' || targetLower === 'tier2' ||
      targetLower === 'drawing/auto' || targetLower === 'tier3/auto' || targetLower === 'tier3'
    ) {
      // 递归通过梯队算法解析目标梯队
      return resolveScheduledModel(env, matchedRule.target, sessionId, providers, tiers)
    }

    // 目标是具体的 providerId/modelId
    const parsed = parseModelId(matchedRule.target)
    if (parsed) {
      return { providerId: parsed.providerId, modelId: parsed.modelId }
    }
  }

  let targetTierKey: TierKey | null = null

  // 匹配三大梯队别名或标识
  if (lower === 'flagship/auto' || lower === 'tier1/auto' || lower === 'tier1') {
    targetTierKey = 'tier1'
  } else if (lower === 'openclaw/auto' || lower === 'tier2/auto' || lower === 'tier2') {
    targetTierKey = 'tier2'
  } else if (lower === 'drawing/auto' || lower === 'tier3/auto' || lower === 'tier3') {
    targetTierKey = 'tier3'
  }

  if (targetTierKey) {
    const tierPool = tiers[targetTierKey]
    if (!tierPool || !tierPool.models || tierPool.models.length === 0) {
      return null
    }

    // 过滤出当前梯队中属于启用提供商、启用模型且未失效/未冷却的模型集合
    const now = Date.now()
    const validInTier = tierPool.models.filter(m => {
      const p = providers.find(prov => prov.id === m.providerId)
      if (!p || !p.enabled) return false
      const mod = p.models.find(item => item.id === m.modelId)
      if (!mod || !mod.enabled) return false
      if (mod.status === 'dead') return false
      if (mod.status === 'cooling' && mod.cooldownUntil && mod.cooldownUntil > now) return false
      return true
    })

    if (validInTier.length === 0) {
      return null
    }

    // ===== 六、请求专属调度粘性策略 =====
    // 1. 同一会话优先复用历史成功模型，前提是模型仍处于当前梯队且健康
    if (sessionId) {
      const stickinessRecord = await getSessionStickiness(env, sessionId)
      if (stickinessRecord && Array.isArray(stickinessRecord.history)) {
        for (const historyItem of stickinessRecord.history) {
          const matched = validInTier.find(
            m => m.providerId === historyItem.providerId && m.modelId === historyItem.modelId
          )
          if (matched) {
            return {
              providerId: matched.providerId,
              modelId: matched.modelId,
              tierKey: targetTierKey,
              matchedBySession: true,
            }
          }
        }
      }
    }

    // 2. 降级回退：按真实业务平均延迟从低到高择优调度
    let bestModel = validInTier[0]
    let lowestLatency = Infinity

    for (const m of validInTier) {
      const stats = await getModelBusinessLatency(env, m.providerId, m.modelId)
      const latency = stats.averageLatencyMs > 0 ? stats.averageLatencyMs : 9999
      if (latency < lowestLatency) {
        lowestLatency = latency
        bestModel = m
      }
    }

    return {
      providerId: bestModel.providerId,
      modelId: bestModel.modelId,
      tierKey: targetTierKey,
      matchedBySession: false,
    }
  }

  // 常规直接指定的 Provider/Model 格式
  const parsed = parseModelId(requestedModel)
  return parsed ? { providerId: parsed.providerId, modelId: parsed.modelId } : null
}

/**
 * 真实业务请求失败模型冷却、移出梯队并触发异步补位
 * 规则：
 * 1. 失败 1 次标记，模型标黄，冷却 10 分钟；如果是 401/403/404 或累计达到 3 次失败，标红永久失效 (dead)
 * 2. 检查该模型是否在任何梯队席位中，若在席位中，立即移出该梯队席位
 * 3. 顺风车一次性批量写入 KV
 * 4. 触发异步海选探测补位（5秒防抖、最多3轮、每轮最多补位2个）
 */
async function handleBusinessModelFailure(
  env: Env,
  providerId: string,
  modelId: string,
  statusCode: number,
  failReason: string
): Promise<void> {
  const now = Date.now()
  const [providers, tiers] = await Promise.all([
    getProviders(env),
    getTierConfig(env),
  ])

  let providersModified = false
  let tiersModified = false
  const affectedTiers: TierKey[] = []

  // 1. 更新提供商中的模型健康状态
  const targetProvider = providers.find((p) => p.id === providerId)
  if (targetProvider && targetProvider.models) {
    const targetModel = targetProvider.models.find((m) => m.id === modelId)
    if (targetModel) {
      targetModel.failCount = (targetModel.failCount || 0) + 1
      const isAuthOrNotFound = statusCode === 401 || statusCode === 403 || statusCode === 404
      if (isAuthOrNotFound || targetModel.failCount >= MODEL_MAX_PROBE_FAILURES) {
        targetModel.status = 'dead'
        targetModel.deadReason = isAuthOrNotFound
          ? `真实业务请求鉴权或端点失效 (HTTP ${statusCode})`
          : `真实业务累计失败 ${targetModel.failCount} 次熔断`
      } else {
        targetModel.status = 'cooling'
        targetModel.cooldownUntil = now + MODEL_COOLDOWN_DURATION_MS
      }
      providersModified = true
    }
  }

  // 2. 检查并从三大梯队席位中移出该故障模型
  const tierKeys: TierKey[] = ['tier1', 'tier2', 'tier3']
  for (const tKey of tierKeys) {
    const t = tiers[tKey]
    if (t && t.models && Array.isArray(t.models)) {
      const origLen = t.models.length
      t.models = t.models.filter((m: import('./types').TierModelEntry) => !(m.providerId === providerId && m.modelId === modelId))
      if (t.models.length < origLen) {
        tiersModified = true
        affectedTiers.push(tKey)
      }
    }
  }

  // 3. 顺风车打包一次性持久化至 KV
  if (providersModified || tiersModified) {
    await Promise.all([
      providersModified ? setProviders(env, providers) : Promise.resolve(),
      tiersModified ? setTierConfig(env, tiers) : Promise.resolve(),
    ])
  }

  // 4. 对发生席位空缺的梯队触发自动补位探测（内存防抖 5 秒）
  for (const tKey of affectedTiers) {
    try {
      await triggerTierRefill(env, tKey)
    } catch (e) {
      console.error(`[proxy] 触发梯队【${tKey}】补位探测异常:`, e)
    }
  }
}

/** 测试模型连接，发送最小请求验证 */
export async function testModelConnection(
  baseUrl: string,
  apiKey: string,
  modelId: string,
  apiType?: 'openai' | 'anthropic'
): Promise<{ success: boolean; message: string; statusCode?: number }> {
  try {
    const cleanBase = baseUrl.replace(/\/$/, '')
    const endpoint = apiType === 'anthropic' ? 'messages' : 'chat/completions'
    const url = `${cleanBase}/${endpoint}`

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (apiType === 'anthropic') {
      headers['x-api-key'] = apiKey
      headers['anthropic-version'] = '2023-06-01'
    } else {
      headers['Authorization'] = `Bearer ${apiKey}`
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: modelId,
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 1,
      }),
      signal: AbortSignal.timeout(15000),
    })

    if (response.ok) {
      return { success: true, message: '连接成功', statusCode: response.status }
    }

    let errorBody = ''
    try {
      const errorData = await response.json() as { error?: { message?: string } }
      errorBody = errorData?.error?.message || JSON.stringify(errorData)
    } catch {
      errorBody = await response.text()
    }

    return {
      success: false,
      message: `HTTP ${response.status}: ${errorBody.substring(0, 200)}`,
      statusCode: response.status,
    }
  } catch (err) {
    const error = err as Error
    return {
      success: false,
      message: `连接失败: ${error.message?.substring(0, 200) || '未知错误'}`,
    }
  }
}

/** 处理 /v1/chat/completions 等 API 转发 */
export async function handleProxy(c: Context<{ Bindings: Env }>) {
  const startTime = Date.now()
  // 获取客户端真实 IP
  const clientIp = c.req.header('cf-connecting-ip') || c.req.header('x-real-ip') || c.req.header('x-forwarded-for') || '127.0.0.1'
  // 提取并脱敏当前请求使用的客户端 Key
  const authHeader = c.req.header('Authorization') || ''
  const rawKey = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : 'anonymous'
  const maskedKey = rawKey.length > 10 ? rawKey.slice(0, 6) + '...' + rawKey.slice(-4) : rawKey
  let selectedModel = 'unknown'
  let isModelSwitched = false

  // 辅助函数：统一记录日志（报错与超时直接写入 KV，正常成功存入内存并触发后置落盘与顺风车）
  const finishAndLog = async (statusCode: number, failReason: string = '-') => {
    const isErrorOrTimeout = statusCode >= 400 || (failReason && failReason !== '-')
    const logData = {
      timestamp: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
      model: selectedModel,
      key: maskedKey,
      durationMs: Date.now() - startTime,
      statusCode,
      failReason,
      ip: clientIp,
    }

    if (isErrorOrTimeout) {
      // 错误、超时等连接异常日志：直接写入/立即持久化至 KV
      await recordErrorLogDirect(c.env, logData)
    } else {
      // 正常成功调用日志：记录到当前实例内存
      recordLog(logData)
      // 如果该请求触发了模型切换，即刻强制合并落盘写 KV，确保控制台日志第一时间内展示该切换日志
      if (isModelSwitched) {
        try {
          await flushLogsToKv(c.env, true)
        } catch (err) {
          console.error('[proxy] 模型切换日志即时落盘失败:', err)
        }
      }
    }

    // 每次请求后置校验落盘条件（解决 Cloudflare Worker 无常驻后台的问题）
    await checkAndFlushOnRequest(c.env)
  }

  try {
    const body = await c.req.json<ProxyRequestBody>()
    const requestedModel = body.model

    if (!requestedModel) {
      await finishAndLog(400, '缺少 model 参数')
      return c.json({ error: { message: '缺少 model 参数', type: 'invalid_request_error' } }, 400)
    }

    // 提取客户端会话 ID（支持 header 和 key 指纹）
    const sessionId = extractSessionId(c, body, rawKey)

    // 并行读取提供商与梯队配置
    const [providers, tiers] = await Promise.all([
      getProviders(c.env),
      getTierConfig(c.env),
    ])

    // 1. 流量到达触发：检测三大梯队池是否有席位空缺，若有则异步启动补位规则（内存防抖 5 秒，保护 KV 写频次）
    const allTierKeys: TierKey[] = ['tier1', 'tier2', 'tier3']
    for (const tk of allTierKeys) {
      const pool = tiers[tk]
      if (pool && pool.models.length < pool.maxSeats) {
        c.executionCtx.waitUntil(
          triggerTierRefill(c.env, tk).catch(e => console.error(`[proxy] 流量触发【${tk}】补位异常:`, e))
        )
      }
    }

    // 智能解析调度模型（梯队别名自动路由 + 会话专属粘性复用 + 真实延迟择优）
    const scheduled = await resolveScheduledModel(c.env, requestedModel, sessionId, providers, tiers)
    if (!scheduled) {
      await finishAndLog(404, `模型或梯队 "${requestedModel}" 无可用健康在席模型`)
      return c.json({
        error: {
          message: `未找到或模型格式错误 "${requestedModel}"，若使用梯队别名请确保梯队内有已启用的健康在席模型`,
          type: 'invalid_request_error',
        },
      }, 404)
    }

    const { providerId, modelId, tierKey, matchedBySession } = scheduled

    // 检测当前梯队池是否发生了模型切换
    if (tierKey) {
      const fullModelKey = `${providerId}/${modelId}`
      const prevModelKey = lastActiveModelByTier[tierKey]
      if (prevModelKey && prevModelKey !== fullModelKey) {
        isModelSwitched = true
      }
      lastActiveModelByTier[tierKey] = fullModelKey
    }

    selectedModel = `${providerId}/${modelId}`
    if (tierKey) {
      selectedModel += ` (${tierKey}${matchedBySession ? ':sticky' : ':auto'}${isModelSwitched ? ':switched' : ''})`
    }

    const provider = providers.find((p) => p.id === providerId)

    if (!provider) {
      await finishAndLog(404, `提供商 "${providerId}" 不存在`)
      return c.json({
        error: { message: `提供商 "${providerId}" 不存在`, type: 'invalid_request_error' },
      }, 404)
    }

    if (!provider.enabled) {
      await finishAndLog(403, `提供商 "${provider.name}" 已禁用`)
      return c.json({
        error: { message: `提供商 "${provider.name}" 已禁用`, type: 'provider_disabled' },
      }, 403)
    }

    const modelConfig = provider.models.find((m) => m.id === modelId)
    if (!modelConfig) {
      await finishAndLog(404, `模型 "${modelId}" 未配置`)
      return c.json({
        error: { message: `模型 "${modelId}" 未在提供商 "${provider.name}" 中配置`, type: 'invalid_request_error' },
      }, 404)
    }
    if (!modelConfig.enabled) {
      await finishAndLog(403, `模型 "${modelId}" 已禁用`)
      return c.json({
        error: { message: `模型 "${modelId}" 已禁用`, type: 'model_disabled' },
      }, 403)
    }

    const enabledKeys = provider.apiKeys.filter(k => k.enabled)
    const forwardBody = { ...body, model: modelId }
    const url = new URL(c.req.url)
    const subPath = url.pathname.replace(/^\/v1\//, '') || 'chat/completions'

    if (isOpenCodeProvider(providerId)) {
      const response = await proxyOpenCodeRequest({
        baseUrl: provider.baseUrl,
        apiKeys: enabledKeys,
        method: c.req.method,
        subPath,
        search: url.search,
        body: JSON.stringify(forwardBody),
        mirrorUrls: resolveOpenCodeUrls(c.env),
      })
      const durationMs = Date.now() - startTime
      await finishAndLog(response.status, response.ok ? '-' : `OpenCode 状态码 ${response.status}`)

      if (response.ok) {
        // 1. 记录真实业务成功延迟样本与会话复用关系
        // 2. 顺风车将最新成功请求日志一次性打包写入 KV，确保网页即时同步最新连接状态
        c.executionCtx.waitUntil(
          Promise.all([
            recordBusinessLatency(c.env, providerId, modelId, {
              timestamp: Date.now(),
              latencyMs: durationMs,
              statusCode: response.status,
              success: true,
            }),
            recordSessionSuccessModel(c.env, sessionId, providerId, modelId),
            flushLogsToKv(c.env),
          ])
        )
      } else {
        // 真实业务请求失败：触发模型标黄冷却 10 分钟、移出梯队与自动补位探测
        c.executionCtx.waitUntil(
          handleBusinessModelFailure(c.env, providerId, modelId, response.status, `OpenCode 状态码 ${response.status}`)
        )
      }
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      })
    }

    if (enabledKeys.length === 0) {
      await finishAndLog(500, '提供商未配置可用的 API Key')
      return c.json({
        error: { message: `提供商 "${provider.name}" 未配置可用的 API Key`, type: 'configuration_error' },
      }, 500)
    }

    const cleanBase = provider.baseUrl.replace(/\/$/, '')
    const forwardUrl = `${cleanBase}/${subPath}${url.search}`

    // 按健康状态排序 key：健康→洗牌，不健康→末尾，冷却到期→试用，连续失败3次→降权排除
    const healthData = await readHealth(c.env, providerId)
    const healthy: number[] = []
    const unhealthy: number[] = []
    const probation: number[] = []
    const demoted: number[] = []

    if (enabledKeys.length === 1) {
      // 只有一个 key，跳过健康检查，直接使用
      healthy.push(0)
    } else {
      for (let i = 0; i < enabledKeys.length; i++) {
        const h = healthData[enabledKeys[i].key]
        if (h && h.failures >= KEY_HEALTH_MAX_FAILURES) {
          // 兼容旧数据：无 demotedAt 视为现在刚降权，统一走冷却逻辑
          if (!h.demotedAt) {
            h.demotedAt = Date.now()
          }
          if (Date.now() - h.demotedAt >= KEY_HEALTH_COOLDOWN_MS) {
            probation.push(i)  // 冷却到期，进入试用组
          } else {
            demoted.push(i)    // 仍在冷却，继续保持降权
          }
        } else if (h && h.lastFailed) {
          unhealthy.push(i)
        } else {
          healthy.push(i)
        }
      }
    }

    // Fisher-Yates 洗牌（仅健康 key）
    for (let i = healthy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [healthy[i], healthy[j]] = [healthy[j], healthy[i]]
    }

    const keyOrder = [...healthy, ...unhealthy, ...probation]

    // 所有 key 都在冷却中时，降级尝试 demoted key（修复旧数据缺失 demotedAt 的死循环）
    if (keyOrder.length === 0 && demoted.length > 0) {
      keyOrder.push(...demoted)
      console.log(`[proxy] ${providerId}: all keys demoted, falling back to ${demoted.length} key(s)`)
    }

    if (demoted.length > 0 || probation.length > 0) {
      console.log(`[proxy] ${providerId}: ${demoted.length} key(s) demoted, ${probation.length} key(s) on probation (cooldown expired)`)
    }

    let lastError: Response | null = null
    let healthUpdated = false

    for (const keyIndex of keyOrder) {
      const apiKey = enabledKeys[keyIndex].key
      try {
        const forwardHeaders: Record<string, string> = {
          'Content-Type': 'application/json',
        }
        if (provider.apiType === 'anthropic') {
          forwardHeaders['x-api-key'] = apiKey
          forwardHeaders['anthropic-version'] = '2023-06-01'
        } else {
          forwardHeaders['Authorization'] = `Bearer ${apiKey}`
        }

        const response = await fetch(forwardUrl, {
          method: c.req.method,
          headers: forwardHeaders,
          body: JSON.stringify(forwardBody),
          signal: AbortSignal.timeout(60000),
        })

        if (response.ok) {
          // 成功：重置健康状态
          if (healthData[apiKey]?.failures > 0) {
            delete healthData[apiKey]
            healthUpdated = true
          }
          if (healthUpdated) await writeHealth(c.env, providerId, healthData)

          const durationMs = Date.now() - startTime
          // 先将成功请求记录到内存日志队列
          await finishAndLog(response.status, '-')

          // 1. 记录真实业务成功延迟样本与会话复用关系
          // 2. 顺风车将最新成功请求日志一次性打包写入 KV，确保网页即时同步最新连接状态
          c.executionCtx.waitUntil(
            Promise.all([
              recordBusinessLatency(c.env, providerId, modelId, {
                timestamp: Date.now(),
                latencyMs: durationMs,
                statusCode: response.status,
                success: true,
              }),
              recordSessionSuccessModel(c.env, sessionId, providerId, modelId),
              flushLogsToKv(c.env),
            ])
          )

          const responseHeaders: Record<string, string> = {
            'Content-Type': response.headers.get('Content-Type') || 'application/json',
            'Cache-Control': 'no-store',
          }
          return new Response(response.body, {
            status: response.status,
            headers: responseHeaders,
          })
        }

        // 429 限流：跳过当前 key，不标记失败
        if (response.status === 429) {
          lastError = response
          continue
        }

        // 401/403/5xx 尝试下一个 key（标记失败）
        if (response.status === 401 || response.status === 403 || response.status >= 500) {
          const h = healthData[apiKey] || { failures: 0, lastFailed: false }
          h.failures++
          h.lastFailed = true
          if (h.failures >= KEY_HEALTH_MAX_FAILURES) {
            h.demotedAt = Date.now()  // 达到降权阈值或试用失败，重置冷却计时
          }
          healthData[apiKey] = h
          healthUpdated = true
          lastError = response
          continue
        }

        // 其他错误（400/404 等）直接返回
        if (response.status === 404) {
          c.executionCtx.waitUntil(
            handleBusinessModelFailure(c.env, providerId, modelId, response.status, `模型端点不存在 HTTP ${response.status}`)
          )
        }
        const errorData = await response.json().catch(async () => ({ error: { message: await response.text() } }))
        await finishAndLog(response.status, `HTTP ${response.status}`)
        return c.json(errorData, response.status as Parameters<typeof c.json>[1])
      } catch (err) {
        const error = err as Error
        // 网络错误也标记为失败
        const h = healthData[apiKey] || { failures: 0, lastFailed: false }
        h.failures++
        h.lastFailed = true
        if (h.failures >= KEY_HEALTH_MAX_FAILURES) {
          h.demotedAt = Date.now()  // 达到降权阈值或试用失败，重置冷却计时
        }
        healthData[apiKey] = h
        healthUpdated = true
        lastError = new Response(JSON.stringify({
          error: { message: error.message || '请求失败', type: 'proxy_error' },
        }), { status: 502 })
        continue
      }
    }

    // 写回健康状态（放入批处理队列或直接写）
    if (healthUpdated) await writeHealth(c.env, providerId, healthData)

    // 所有 key 均失败，触发模型故障冷却与梯队补位
    c.executionCtx.waitUntil(
      handleBusinessModelFailure(
        c.env,
        providerId,
        modelId,
        lastError ? (lastError.status || 502) : 500,
        lastError ? `所有 Key 均请求失败: HTTP ${lastError.status}` : '没有可用的 API Key'
      )
    )

    if (lastError) {
      const errorBody = await lastError.text().catch(() => '所有 API Key 均失败')
      await finishAndLog(lastError.status || 502, `所有 Key 失败: HTTP ${lastError.status}`)
      return c.json({
        error: {
          message: `所有 API Key 已用完，最后一次错误: HTTP ${lastError.status}`,
          type: 'key_exhausted',
          detail: errorBody.substring(0, 500),
        },
      }, (lastError.status || 502) as Parameters<typeof c.json>[1])
    }

    await finishAndLog(500, '没有可用的 API Key')
    return c.json({
      error: { message: '没有可用的 API Key', type: 'configuration_error' },
    }, 500)
  } catch (err) {
    const error = err as Error
    await finishAndLog(500, error.message || '代理转发内部错误')
    return c.json({
      error: { message: error.message || '代理转发内部错误', type: 'server_error' },
    }, 500)
  }
}

/** 处理 /v1/models — 返回所有已启用的模型（含三大梯队别名模型与提供商前缀） */
export async function handleModels(c: Context<{ Bindings: Env }>) {
  const [providers, tiers, customRoutes] = await Promise.all([
    getProviders(c.env),
    getTierConfig(c.env),
    getCustomRoutes(c.env),
  ])

  const models: Array<{
    id: string
    provider: string
    provider_name: string
    object: string
    created: number
    owned_by: string
  }> = []

  // 0. 注入已启用的自定义路由别名 (最高优先级)
  for (const rule of customRoutes) {
    if (rule.enabled && rule.alias) {
      models.push({
        id: rule.alias,
        provider: 'custom_route',
        provider_name: rule.description || `自定义路由 (${rule.target})`,
        object: 'model',
        created: Math.floor(Date.now() / 1000),
        owned_by: 'custom_route',
      })
    }
  }

  // 1. 注入三大梯队智能调度别名
  const tierAliases: Array<{ id: string; name: string; key: TierKey }> = [
    { id: 'flagship/auto', name: tiers.tier1?.name || '第一梯队 (Tier1) 旗舰模型池', key: 'tier1' },
    { id: 'openclaw/auto', name: tiers.tier2?.name || '第二梯队 (Tier2) OpenClaw 模型池', key: 'tier2' },
    { id: 'drawing/auto', name: tiers.tier3?.name || '第三梯队 (Tier3) 绘图专属池', key: 'tier3' },
  ]

  for (const t of tierAliases) {
    const pool = tiers[t.key]
    if (pool && pool.models && pool.models.length > 0) {
      models.push({
        id: t.id,
        provider: 'gateway',
        provider_name: t.name,
        object: 'model',
        created: Math.floor(Date.now() / 1000),
        owned_by: 'gateway',
      })
    }
  }

  // 2. 注入各供应商启用的具体模型
  for (const provider of providers) {
    if (!provider.enabled) continue
    for (const model of provider.models) {
      if (!model.enabled) continue
      models.push({
        id: `${provider.id}/${model.id}`,
        provider: provider.id,
        provider_name: provider.name,
        object: 'model',
        created: Math.floor(Date.now() / 1000),
        owned_by: provider.id,
      })
    }
  }

  return c.json({
    object: 'list',
    data: models,
  })
}
