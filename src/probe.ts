/**
 * 版本号: v1.0.28
 * 模块: 自动择优探测调度框架与梯队智能补位迭代引擎
 * 
 * 核心设计准则：
 * 1. 海选延迟探测：使用全局游标持久化在 KV，遍历全部提供商全部模型，固定使用 prompt: "hi", max_tokens: 1。
 * 2. 梯队补位迭代引擎：当梯队出现空缺时触发。
 *    - 跨提供商雨露均沾发牌机制：多提供商交错选取，彻底杜绝单一大户垄断候选队列。
 *    - 传送带轮转游标：记忆提供商出场顺序，确保几十个提供商全部获得平等亮相机会。
 *    - 防抖控制：同一个梯队 5 秒内最多触发一次探测。
 *    - 轮数与数量约束：单次补位最多连续 3 轮海选，每轮最多补位 2 个模型。
 *    - 终止退出条件：梯队席位填满 / 所有可用模型遍历完成 / 到达最大 3 轮 / 无可用候选直接退出。
 *    - 故障熔断：探测遇到 401/403/404 或累计 3 次失败直接标红永久失效 (dead)；其它失败标黄冷却 10 分钟。
 * 3. OpenClaw 专属探测：用于测试模型是否具备 OpenClaw Agent 指令遵循能力，测试通过打上 openclaw 专属标签。
 * 4. KV 配额严格保护：探测过程中的状态变更与梯队变动在内存中计算，完成后搭顺风车一次性批量写入 KV。
 */
import type { Env, Provider, ProbeResult, Model, TierConfig, TierKey } from './types'
import { isModelOpenClawSupported } from './types'
import {
  getProviders,
  setProviders,
  getAuditionCursor,
  saveAuditionCursor,
  recordProbeLog,
  getTierConfig,
  setTierConfig,
} from './storage'
import { isOpenCodeProvider, testOpenCodeModel, resolveOpenCodeUrls } from './opencode'
import {
  MODEL_COOLDOWN_DURATION_MS,
  PROBE_DEBOUNCE_INTERVAL_MS,
  MAX_REFILL_PROBE_ROUNDS,
  MAX_REFILL_PER_ROUND,
  MODEL_MAX_PROBE_FAILURES,
} from './config'

/**
 * 扁平化模型项引用
 */
interface FlatModelItem {
  providerIndex: number
  modelIndex: number
  provider: Provider
  model: Model
}

// 梯队探测防抖时间戳记录（单 Worker 实例内存生效，单位毫秒）
const lastTierProbeTime: Record<string, number> = {
  tier1: 0,
  tier2: 0,
  tier3: 0,
}

// 梯队补位提供商轮转游标（内存轮转传送带，实现多提供商平等轮流出场）
const tierRefillProviderOffset: Record<string, number> = {
  tier1: 0,
  tier2: 0,
  tier3: 0,
}

/**
 * 辅助函数：收集所有已启用的提供商与已启用的模型列表（按顺序扁平排列）
 */
function getFlatModelList(providers: Provider[]): FlatModelItem[] {
  const list: FlatModelItem[] = []
  for (let pIdx = 0; pIdx < providers.length; pIdx++) {
    const p = providers[pIdx]
    if (!p.enabled) continue
    for (let mIdx = 0; mIdx < p.models.length; mIdx++) {
      const m = p.models[mIdx]
      if (!m.enabled) continue
      list.push({
        providerIndex: pIdx,
        modelIndex: mIdx,
        provider: p,
        model: m,
      })
    }
  }
  return list
}

/**
 * 构建鉴权请求头
 */
function buildProbeHeaders(apiKey: string, apiType?: string): Record<string, string> {
  if (apiType === 'anthropic') {
    return {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    }
  }
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
  }
}

/**
 * 探测单个模型（极简短 prompt: "hi", max_tokens: 1，低 token 消耗）
 */
export async function probeSingleModel(
  env: Env,
  provider: Provider,
  model: Model,
  isExclusiveOpenClaw: boolean = false
): Promise<{ success: boolean; statusCode: number; latencyMs: number; message: string }> {
  const startTime = Date.now()
  const enabledKeys = provider.apiKeys.filter((k) => k.enabled)
  const isOpCode = isOpenCodeProvider(provider.id)

  if (!isOpCode && enabledKeys.length === 0) {
    return {
      success: false,
      statusCode: 401,
      latencyMs: 0,
      message: '未配置可用 API Key',
    }
  }

  try {
    if (isOpCode) {
      const opRes = await testOpenCodeModel(
        provider.baseUrl,
        enabledKeys,
        model.id,
        resolveOpenCodeUrls(env)
      )
      const durationMs = Date.now() - startTime
      return {
        success: opRes.success,
        statusCode: opRes.statusCode || (opRes.success ? 200 : 502),
        latencyMs: durationMs,
        message: opRes.message || (opRes.success ? '探测成功' : '探测失败'),
      }
    }

    const cleanBase = provider.baseUrl.replace(/\/$/, '')
    const endpoint = provider.apiType === 'anthropic' ? 'messages' : 'chat/completions'
    const url = `${cleanBase}/${endpoint}`
    const headers = buildProbeHeaders(enabledKeys[0].key, provider.apiType)

    // 若是 OpenClaw 专属探测，附带结构化指令测试
    let payload: Record<string, unknown>
    if (isExclusiveOpenClaw) {
      payload = provider.apiType === 'anthropic'
        ? {
            model: model.id,
            system: 'You are an OpenClaw AI assistant. Follow instructions strictly.',
            messages: [{ role: 'user', content: 'Respond ONLY with JSON: {"openclaw":true}' }],
            max_tokens: 10,
            temperature: 0.1,
          }
        : {
            model: model.id,
            messages: [
              { role: 'system', content: 'You are an OpenClaw AI assistant. Follow instructions strictly.' },
              { role: 'user', content: 'Respond ONLY with JSON: {"openclaw":true}' },
            ],
            max_tokens: 10,
            temperature: 0.1,
          }
    } else {
      payload = {
        model: model.id,
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 1,
      }
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    })

    const durationMs = Date.now() - startTime
    const statusCode = response.status

    if (response.ok) {
      if (isExclusiveOpenClaw) {
        const text = await response.text()
        const passed = /openclaw|true|\{/i.test(text)
        return {
          success: passed,
          statusCode,
          latencyMs: durationMs,
          message: passed ? 'OpenClaw 指令测试通过' : '未遵循 OpenClaw 格式',
        }
      }
      return {
        success: true,
        statusCode,
        latencyMs: durationMs,
        message: 'HTTP 200 OK',
      }
    }

    return {
      success: false,
      statusCode,
      latencyMs: durationMs,
      message: `HTTP 状态码 ${statusCode}`,
    }
  } catch (err) {
    const error = err as Error
    return {
      success: false,
      statusCode: 0,
      latencyMs: Date.now() - startTime,
      message: error.message || '网络连接超时',
    }
  }
}

/**
 * 1. 海选延迟探测框架 (Audition Probe)
 */
export async function runAuditionProbeRound(env: Env): Promise<{
  success: boolean
  message: string
  probed?: ProbeResult
  cursor?: { nextIndex: number; total: number }
}> {
  const providers = await getProviders(env)
  const flatModels = getFlatModelList(providers)

  if (flatModels.length === 0) {
    return {
      success: false,
      message: '当前无任何已启用的可用模型，无法执行海选探测',
    }
  }

  // 1. 获取持久化游标
  const savedCursor = await getAuditionCursor(env)
  let targetIndex = 0

  const lastIndex = flatModels.findIndex(
    (item) => item.provider.id === providers[savedCursor.providerIndex]?.id &&
              item.model.id === savedCursor.lastModelId
  )

  if (lastIndex >= 0) {
    targetIndex = (lastIndex + 1) % flatModels.length
  } else {
    targetIndex = (savedCursor.modelIndex || 0) % flatModels.length
  }

  const target = flatModels[targetIndex]
  const probeRes = await probeSingleModel(env, target.provider, target.model, false)

  const result: ProbeResult = {
    providerId: target.provider.id,
    modelId: target.model.id,
    type: 'audition',
    success: probeRes.success,
    statusCode: probeRes.statusCode,
    latencyMs: probeRes.latencyMs,
    message: probeRes.message,
    timestamp: Date.now(),
  }

  // 记录探测日志
  await recordProbeLog(env, result)

  // 更新游标并持久化保存至 KV
  const nextCursor = {
    providerIndex: target.providerIndex,
    modelIndex: (targetIndex + 1) % flatModels.length,
    lastProbedAt: Date.now(),
    lastModelId: target.model.id,
  }
  await saveAuditionCursor(env, nextCursor)

  return {
    success: true,
    message: `已完成模型【${target.provider.name}/${target.model.id}】海选探测: ${probeRes.success ? '正常' : '异常'} (${probeRes.latencyMs}ms)`,
    probed: result,
    cursor: {
      nextIndex: nextCursor.modelIndex,
      total: flatModels.length,
    },
  }
}

/**
 * 2. OpenClaw 专属探测框架
 */
export async function runOpenClawProbe(
  env: Env,
  targetProviderId?: string,
  targetModelId?: string
): Promise<{
  success: boolean
  message: string
  probed?: ProbeResult
  assignedTag?: boolean
}> {
  const providers = await getProviders(env)

  let candidateProvider: Provider | null = null
  let candidateModel: Model | null = null

  if (targetProviderId && targetModelId) {
    candidateProvider = providers.find((p) => p.id === targetProviderId) || null
    candidateModel = candidateProvider?.models.find((m) => m.id === targetModelId) || null
  } else {
    for (const p of providers) {
      if (!p.enabled) continue
      for (const m of p.models) {
        if (!m.enabled) continue
        const hasTag = Array.isArray(m.tags) && m.tags.includes('openclaw')
        if (!hasTag) {
          candidateProvider = p
          candidateModel = m
          break
        }
      }
      if (candidateModel) break
    }
  }

  if (!candidateProvider || !candidateModel) {
    return {
      success: false,
      message: '无待探测的 OpenClaw 候选模型（所有模型已具备标签或无可用模型），已安全终止探测',
    }
  }

  const probeRes = await probeSingleModel(env, candidateProvider, candidateModel, true)

  const result: ProbeResult = {
    providerId: candidateProvider.id,
    modelId: candidateModel.id,
    type: 'openclaw',
    success: probeRes.success,
    statusCode: probeRes.statusCode,
    latencyMs: probeRes.latencyMs,
    message: probeRes.message,
    timestamp: Date.now(),
  }
  await recordProbeLog(env, result)

  let assignedTag = false
  if (probeRes.success) {
    if (!Array.isArray(candidateModel.tags)) {
      candidateModel.tags = []
    }
    if (!candidateModel.tags.includes('openclaw')) {
      candidateModel.tags.push('openclaw')
      assignedTag = true
      await setProviders(env, providers)
    }
  }

  return {
    success: probeRes.success,
    message: probeRes.success
      ? `模型【${candidateModel.id}】通过 OpenClaw 专属测试，已成功赋予 openclaw 标签`
      : `模型【${candidateModel.id}】未通过 OpenClaw 专属测试: ${probeRes.message}`,
    probed: result,
    assignedTag,
  }
}

/**
 * 3. 核心补位迭代引擎 (Refill Iteration Engine)
 * 
 * 触发时机：
 * - 真实业务请求失败导致模型冷却移出梯队，席位出现空缺时调用
 * 
 * 约束与规则：
 * 1. 防抖限制：同一个梯队 5 秒内最多触发一次补位探测，防止高并发失败引发探测风暴。
 * 2. 统计有效可探测模型数，无可用候选直接退出。
 * 3. 单次补位最多连续 3 轮完整海选；每轮探测完毕后最多补位入梯队 2 个模型；
 * 4. 退出条件：梯队席位填满 / 全部模型遍历完成 / 到达最大 3 轮 / 无可用候选。
 * 5. 第二梯队 (tier2) 启用 OpenClaw 专属探测，其余启用海选延迟探测。
 * 6. 探测结果择优：筛选出延迟最低的合格模型加入本梯队池。
 * 7. 故障标记：探测失败 401/403/404 或累计失败 3 次直接标红永久失效 (dead)；普通失败标黄冷却 10 分钟。
 * 8. 内存聚合打包一次性写入 KV，严格节约 KV 写次数。
 */
export async function triggerTierRefill(
  env: Env,
  tierKey: TierKey
): Promise<{ success: boolean; message: string; refilledCount: number }> {
  const now = Date.now()

  // 1. 防抖检查：同一个梯队 5 秒内最多触发一次补位探测
  const lastTime = lastTierProbeTime[tierKey] || 0
  if (now - lastTime < PROBE_DEBOUNCE_INTERVAL_MS) {
    return {
      success: false,
      message: `梯队【${tierKey}】处于 5 秒防抖冷却期中，跳过本次并发补位探测`,
      refilledCount: 0,
    }
  }
  lastTierProbeTime[tierKey] = now

  // 2. 获取当前全部提供商配置与梯队配置
  const [providers, tiers] = await Promise.all([
    getProviders(env),
    getTierConfig(env),
  ])

  const targetTier = tiers[tierKey]
  if (!targetTier) {
    return { success: false, message: `梯队 ${tierKey} 不存在`, refilledCount: 0 }
  }

  // 检查当前梯队是否已有空缺
  const currentSeatCount = targetTier.models ? targetTier.models.length : 0
  if (currentSeatCount >= targetTier.maxSeats) {
    return {
      success: true,
      message: `梯队【${targetTier.name}】席位已满 (${currentSeatCount}/${targetTier.maxSeats})，无需补位`,
      refilledCount: 0,
    }
  }

  // 3. 统计有效可探测候选模型（按提供商分组，准备雨露均沾交叉抽选）
  // 排除：未启用的提供商、未启用的模型、当前已处于 cooling 冷却中或 dead 永久失效的模型、已在该梯队中的模型
  interface Candidate {
    provider: Provider
    model: Model
  }

  const existingKeys = new Set(
    (targetTier.models || []).map((m: import('./types').TierModelEntry) => `${m.providerId}:::${m.modelId}`)
  )

  const isTier2 = tierKey === 'tier2'
  const isTier3 = tierKey === 'tier3'

  // 按提供商收集有效候选模型，准备多提供商交错抽取
  const providerCandidatesMap = new Map<string, Candidate[]>()
  const validProviders: Provider[] = []

  // 传送带机制：获取并轮转提供商起点，确保每次补位时不同的提供商轮流排在最前面
  const currentOffset = tierRefillProviderOffset[tierKey] || 0
  const enabledProviders = providers.filter((p) => p.enabled)
  
  // 旋转提供商顺序，避免头部提供商永远垄断优先权
  const rotatedProviders = enabledProviders.length > 0
    ? [
        ...enabledProviders.slice(currentOffset % enabledProviders.length),
        ...enabledProviders.slice(0, currentOffset % enabledProviders.length),
      ]
    : []

  // 记录下一次的轮转游标偏移
  if (enabledProviders.length > 0) {
    tierRefillProviderOffset[tierKey] = (currentOffset + 1) % enabledProviders.length
  }

  // 遍历所有已启用的提供商，整理可用候选
  for (const p of rotatedProviders) {
    const pCandidates: Candidate[] = []
    for (const m of p.models) {
      if (!m.enabled) continue
      // 检查模型健康状态：冷却中或永久失效均跳过
      const isDead = m.status === 'dead'
      const isCooling = !isDead && (m.status === 'cooling' || (m.cooldownUntil && m.cooldownUntil > now))
      if (isDead || isCooling) continue

      // 检查是否已经在当前梯队中
      if (existingKeys.has(`${p.id}:::${m.id}`)) continue

      // 核心准入约束：若是第二梯队（OpenClaw 专属模型池），必须具备 openclaw 专属标签，严禁普通模型或手动取消的模型进入
      if (isTier2) {
        if (!isModelOpenClawSupported(m)) continue
      }

      // 若是第三梯队（绘图专属），优先筛选绘图分类或全部可用候选
      if (isTier3 && m.category && m.category !== 'image' && m.category !== 'other') {
        // 允许候选进入
      }

      pCandidates.push({ provider: p, model: m })
    }

    if (pCandidates.length > 0) {
      providerCandidatesMap.set(p.id, pCandidates)
      validProviders.push(p)
    }
  }

  // 4. “雨露均沾发牌式”交错组合候选名单
  // 无论有多少个提供商，每轮轮流从各提供商抽取 1 个模型，彻底杜绝单一大户垄断
  const candidates: Candidate[] = []
  let hasMore = true
  let modelIndexInProvider = 0

  while (hasMore) {
    hasMore = false
    for (const p of validProviders) {
      const list = providerCandidatesMap.get(p.id)
      if (list && modelIndexInProvider < list.length) {
        candidates.push(list[modelIndexInProvider])
        hasMore = true
      }
    }
    modelIndexInProvider++
  }

  // 约束：无可用候选直接退出，禁止空循环
  if (candidates.length === 0) {
    return {
      success: true,
      message: '无可用候选模型（所有模型均在席位、冷却中或已失效），补位探测安全退出',
      refilledCount: 0,
    }
  }

  let totalRefilled = 0
  let round = 0
  let candidateIndex = 0
  let stateModified = false

  // 5. 补位主循环：最多连续 3 轮完整海选
  while (
    round < MAX_REFILL_PROBE_ROUNDS &&
    targetTier.models.length < targetTier.maxSeats &&
    candidateIndex < candidates.length
  ) {
    round++
    const roundProbeResults: Array<{
      candidate: Candidate
      latencyMs: number
      success: boolean
    }> = []

    // 本轮从候选列表中抽取模型（每次抽取至多 4 个不同来源的候选进行极低消耗并发探测）
    const batchSize = Math.min(4, candidates.length - candidateIndex)
    const currentBatch = candidates.slice(candidateIndex, candidateIndex + batchSize)
    candidateIndex += batchSize

    // 并行探测本批次候选模型（因为来自不同提供商，并行探测不超频、不触发单平台限流，速度大幅提升）
    const probeResults = await Promise.all(
      currentBatch.map(async (cand) => {
        const probeRes = await probeSingleModel(env, cand.provider, cand.model, isTier2)
        return { cand, probeRes }
      })
    )

    // 收集处理本批次探测结果
    for (const { cand, probeRes } of probeResults) {
      if (probeRes.success) {
        // 探测成功，重置失败计数器，并记录延迟样本
        cand.model.status = 'healthy'
        delete cand.model.cooldownUntil
        roundProbeResults.push({
          candidate: cand,
          latencyMs: probeRes.latencyMs,
          success: true,
        })
      } else {
        // 探测失败判定：
        stateModified = true
        cand.model.failCount = (cand.model.failCount || 0) + 1

        // 约束：如果遇到 401/403/404 或累计失败达到 3 次，标红永久失效
        const isAuthOrNotFound =
          probeRes.statusCode === 401 || probeRes.statusCode === 403 || probeRes.statusCode === 404
        if (isAuthOrNotFound || cand.model.failCount >= MODEL_MAX_PROBE_FAILURES) {
          cand.model.status = 'dead'
          cand.model.deadReason = isAuthOrNotFound
            ? `探测鉴权或端点失效 (HTTP ${probeRes.statusCode})`
            : `累计探测失败 ${cand.model.failCount} 次熔断`
        } else {
          // 否则标黄冷却 10 分钟
          cand.model.status = 'cooling'
          cand.model.cooldownUntil = now + MODEL_COOLDOWN_DURATION_MS
        }
      }
    }

    // 筛选本轮探测成功的模型，并按延迟由低到高排序择优
    const successfulCandidates = roundProbeResults
      .filter((r) => r.success)
      .sort((a, b) => a.latencyMs - b.latencyMs)

    // 约束：每轮探测完毕后最多补位入梯队 2 个模型
    const toAddThisRound = successfulCandidates.slice(0, MAX_REFILL_PER_ROUND)

    for (const item of toAddThisRound) {
      if (targetTier.models.length >= targetTier.maxSeats) break
      targetTier.models.push({
        providerId: item.candidate.provider.id,
        modelId: item.candidate.model.id,
        category: item.candidate.model.category || 'text',
        addedAt: Date.now(),
      })
      totalRefilled++
      stateModified = true
    }

    // 退出条件：若梯队已满，提前终止
    if (targetTier.models.length >= targetTier.maxSeats) {
      break
    }
  }

  // 5. 内存顺风车一次性批量写入 KV
  if (stateModified || totalRefilled > 0) {
    await Promise.all([
      setProviders(env, providers),
      setTierConfig(env, tiers),
    ])
  }

  return {
    success: true,
    message: `梯队【${targetTier.name}】补位探测完成：历经 ${round} 轮海选，成功择优补位 ${totalRefilled} 个模型（当前席位 ${targetTier.models.length}/${targetTier.maxSeats}）`,
    refilledCount: totalRefilled,
  }
}

