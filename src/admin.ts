/**
 * 版本号: v1.0.12
 * 模块: 管理后台核心 API 处理函数（提供商/Key管理、梯队池、统一批量保存与日志调试）
 */
import { Context } from 'hono'
import {
  getProviders,
  setProviders,
  getProvider,
  addProvider,
  updateProvider,
  deleteProvider,
  getProxyKeys,
  setProxyKeys,
  addProxyKey,
  updateProxyKey,
  deleteProxyKey,
  getTierConfig,
  setTierConfig,
  getCustomRoutes,
  setCustomRoutes,
} from './storage'
import { testModelConnection } from './proxy'
import { fetchOpenCodeModels, isOpenCodeProvider, resolveOpenCodeUrls, testOpenCodeModel } from './opencode'
import { PROXY_KEY_PREFIX, EXPIRY_OPTIONS, OPENCODE_DEFAULT_URL } from './config'
import { getMemoryLogs, clearMemoryLogs, getDebugConfig, updateDebugConfig } from './log'
import type {
  Env,
  ApiResponse,
  Provider,
  CreateProviderRequest,
  UpdateProviderRequest,
  CreateProxyKeyRequest,
  TestModelRequest,
  BatchSaveRequest,
  DebugConfig,
} from './types'

// ===== 系统状态 =====

/**
 * 将 string[] 或正规对象数组统一转换为正规对象数组
 * 例: ["k1","k2"] → [{key:"k1",enabled:true},{key:"k2",enabled:true}]
 */
function normalizeArray<T>(
  items: unknown,
  mapFn: (val: string) => T
): T[] {
  if (!Array.isArray(items)) return []
  if (items.length === 0 || typeof items[0] === 'string') {
    return (items as string[]).map(mapFn)
  }
  return items as T[]
}

export async function handleStatus(c: Context<{ Bindings: Env }>) {
  const providers = await getProviders(c.env)
  const proxyKeys = await getProxyKeys(c.env)

  const totalModels = providers.reduce((sum, p) => sum + p.models.length, 0)
  const enabledModels = providers.reduce(
    (sum, p) => sum + p.models.filter((m) => m.enabled).length,
    0
  )

  return c.json<ApiResponse>({
    success: true,
    data: {
      providersCount: providers.length,
      enabledProvidersCount: providers.filter((p) => p.enabled).length,
      modelsCount: totalModels,
      enabledModelsCount: enabledModels,
      proxyKeysCount: proxyKeys.filter((k) => k.enabled).length,
      adminConfigured: !!(c.env.ADMIN_USERNAME && c.env.ADMIN_PASSWORD),
      baseUrl: new URL(c.req.url).origin,
    },
  })
}

// ===== 提供商 CRUD =====

export async function handleGetProviders(c: Context<{ Bindings: Env }>) {
  const providers = await getProviders(c.env)
  return c.json<ApiResponse<Provider[]>>({ success: true, data: providers })
}

export async function handleCreateProvider(c: Context<{ Bindings: Env }>) {
  const body = await c.req.json<CreateProviderRequest>()
  // opencode 未传地址时自动填充
  if (body.id === 'opencode' && !body.baseUrl) {
    body.baseUrl = OPENCODE_DEFAULT_URL
  }

  if (!body.id || !body.name || !body.baseUrl) {
    return c.json<ApiResponse>({ success: false, message: 'id、name、baseUrl 为必填项' }, 400)
  }

  const providers = await getProviders(c.env)
  if (providers.some((p) => p.id === body.id)) {
    return c.json<ApiResponse>({ success: false, message: `提供商 id "${body.id}" 已存在` }, 409)
  }

  const now = new Date().toISOString()
  const provider: Provider = {
    id: body.id,
    name: body.name,
    baseUrl: body.baseUrl.replace(/\/$/, ''),
    apiType: body.apiType || 'openai',
apiKeys: normalizeArray(body.apiKeys, (k) => ({ key: k, enabled: true })),
    models: body.models
      ? normalizeArray(body.models, (m) => ({ id: m, enabled: true }))
      : [],
    enabled: body.enabled !== undefined ? body.enabled : true,
    createdAt: now,
    updatedAt: now,
  }

  await addProvider(c.env, provider)
  return c.json<ApiResponse<Provider>>({ success: true, data: provider }, 201)
}

export async function handleUpdateProvider(c: Context<{ Bindings: Env }>) {
  const id = c.req.param('id')
  if (!id) return c.json<ApiResponse>({ success: false, message: '缺少 id 参数' }, 400)
  const body = await c.req.json<UpdateProviderRequest>()

  const updates: Partial<Provider> = {}
  if (body.name !== undefined) updates.name = body.name
  if (body.baseUrl !== undefined) updates.baseUrl = body.baseUrl.replace(/\/$/, '')
  if (body.apiType !== undefined) updates.apiType = body.apiType
if (body.apiKeys !== undefined) {
    updates.apiKeys = normalizeArray(body.apiKeys, (k) => ({ key: k, enabled: true }))
  }
  if (body.enabled !== undefined) updates.enabled = body.enabled
  if (body.models !== undefined) {
    updates.models = normalizeArray(body.models, (m) => ({ id: m, enabled: true }))
  }

  const updated = await updateProvider(c.env, id, updates)
  if (!updated) {
    return c.json<ApiResponse>({ success: false, message: '提供商不存在' }, 404)
  }

  return c.json<ApiResponse<Provider>>({ success: true, data: updated })
}

export async function handleDeleteProvider(c: Context<{ Bindings: Env }>) {
  const id = c.req.param('id')
  if (!id) return c.json<ApiResponse>({ success: false, message: '缺少 id 参数' }, 400)
  const deleted = await deleteProvider(c.env, id)
  if (!deleted) {
    return c.json<ApiResponse>({ success: false, message: '提供商不存在' }, 404)
  }
  return c.json<ApiResponse>({ success: true, message: '提供商已删除' })
}

export async function handleTestModel(c: Context<{ Bindings: Env }>) {
  const id = c.req.param('id')
  if (!id) return c.json<ApiResponse>({ success: false, message: '缺少 id 参数' }, 400)
  const { modelId } = await c.req.json<TestModelRequest>()

  if (!modelId) {
    return c.json<ApiResponse>({ success: false, message: 'modelId 为必填项' }, 400)
  }

  const provider = await getProvider(c.env, id)
  if (!provider) {
    return c.json<ApiResponse>({ success: false, message: '提供商不存在' }, 404)
  }

  const modelConfig = provider.models.find((m) => m.id === modelId)
  if (!modelConfig) {
    return c.json<ApiResponse>({ success: false, message: `模型 "${modelId}" 不存在于提供商 "${provider.name}"` }, 404)
  }

  const enabledKeys = provider.apiKeys.filter(k => k.enabled)
  if (!isOpenCodeProvider(provider.id) && enabledKeys.length === 0) {
    return c.json<ApiResponse>({ success: false, message: '该提供商未配置可用的 API Key' }, 400)
  }

  const result = isOpenCodeProvider(provider.id)
    ? await testOpenCodeModel(provider.baseUrl, enabledKeys, modelId, resolveOpenCodeUrls(c.env))
    : await testModelConnection(provider.baseUrl, enabledKeys[0].key, modelId, provider.apiType)

  return c.json<ApiResponse>({
    success: true,
    data: result,
  })
}

// ===== Key / 模型连通性测试（通过服务端代理，避免 CORS） =====

function buildAuthHeaders(apiKey: string, apiType?: string): Record<string, string> {
  if (apiType === 'anthropic') {
    return { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }
  }
  return { 'Authorization': `Bearer ${apiKey}` }
}

export async function handleTestKeyNew(c: Context<{ Bindings: Env }>) {
  const { url, apiKey, apiType, providerId } = await c.req.json<{
    url: string
    apiKey: string
    apiType?: string
    providerId?: string
  }>()
  if (!url || (!apiKey && !(providerId && isOpenCodeProvider(providerId)))) {
    return c.json<ApiResponse>({ success: false, message: 'url 和 apiKey 为必填项' }, 400)
  }

  if (providerId && isOpenCodeProvider(providerId)) {
    // 没填 key 时检查是否配了镜像，避免迷惑性报错
    if (!apiKey) {
      const mirrors = resolveOpenCodeUrls(c.env)
      if (mirrors.length === 0) {
        return c.json<ApiResponse>({
          success: true,
          data: { success: false, statusCode: 0, message: '请先填写 API Key 或配置 OPENCODE_MIRRORS_URL 环境变量' },
        })
      }
    }
    const result = await fetchOpenCodeModels(url, [{ key: apiKey, enabled: true }], resolveOpenCodeUrls(c.env))
    return c.json<ApiResponse>({
      success: true,
      data: {
        success: result.success,
        statusCode: result.statusCode || 0,
        message: result.message,
        data: result.data,
      },
    })
  }

  const cleanBase = url.replace(/\/$/, '')
  try {
    const response = await fetch(`${cleanBase}/models`, {
      method: 'GET', headers: buildAuthHeaders(apiKey, apiType), signal: AbortSignal.timeout(15000),
    })

    let data: unknown = null
    if (response.ok) {
      try { data = await response.json() } catch { /* ignore */ }
    }

    return c.json<ApiResponse>({
      success: true,
      data: { success: response.ok, statusCode: response.status, data },
    })
  } catch (err) {
    return c.json<ApiResponse>({
      success: true,
      data: { success: false, statusCode: 0, message: (err as Error).message || '连接失败' },
    })
  }
}

export async function handleTestModelNew(c: Context<{ Bindings: Env }>) {
  const { url, apiKey, apiType, model, providerId } = await c.req.json<{
    url: string
    apiKey: string
    apiType?: string
    model: string
    providerId?: string
  }>()
  if (!url || !model || (!apiKey && !isOpenCodeProvider(providerId || ''))) {
    return c.json<ApiResponse>({ success: false, message: 'url、apiKey、model 为必填项' }, 400)
  }

  if (providerId && isOpenCodeProvider(providerId)) {
    const apiKeys = apiKey ? [{ key: apiKey, enabled: true }] : []
    const result = await testOpenCodeModel(url, apiKeys, model, resolveOpenCodeUrls(c.env))
    return c.json<ApiResponse>({
      success: true,
      data: { success: result.success, statusCode: result.statusCode || 0, message: result.message },
    })
  }

  const cleanBase = url.replace(/\/$/, '')
  const endpoint = apiType === 'anthropic' ? 'messages' : 'chat/completions'

  try {
    const response = await fetch(`${cleanBase}/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...buildAuthHeaders(apiKey, apiType) },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: 'hi' }], max_tokens: 1 }),
      signal: AbortSignal.timeout(15000),
    })

    return c.json<ApiResponse>({
      success: true,
      data: { success: response.ok, statusCode: response.status },
    })
  } catch (err) {
    return c.json<ApiResponse>({
      success: true,
      data: { success: false, statusCode: 0, message: (err as Error).message || '连接失败' },
    })
  }
}

// ===== 转发 Key 管理 =====

export async function handleGetProxyKeys(c: Context<{ Bindings: Env }>) {
  const keys = await getProxyKeys(c.env)
  const maskedKeys = keys.map((k) => ({
    ...k,
    key: k.key.length > 12
      ? k.key.substring(0, 8) + '****' + k.key.substring(k.key.length - 4)
      : k.key,
  }))
  return c.json<ApiResponse>({ success: true, data: maskedKeys })
}

export async function handleCreateProxyKey(c: Context<{ Bindings: Env }>) {
  const body = await c.req.json<CreateProxyKeyRequest>()
  const id = crypto.randomUUID()
  const randomPart = crypto.randomUUID().replace(/-/g, '')
  const key = `${PROXY_KEY_PREFIX}${randomPart}`

  // 计算过期时间
  let expiresAt: string | null = null
  if (body.expiresIn && body.expiresIn !== 'forever') {
    const ttl = EXPIRY_OPTIONS[body.expiresIn]
    if (ttl) {
      expiresAt = new Date(Date.now() + ttl * 1000).toISOString()
    }
  }

  const proxyKey = {
    id,
    key,
    name: body.name || `Key-${new Date().toLocaleDateString()}`,
    enabled: true,
    createdAt: new Date().toISOString(),
    expiresAt,
  }

  await addProxyKey(c.env, proxyKey)
  return c.json<ApiResponse>({
    success: true,
    data: proxyKey,
    message: '请立即保存此 Key，关闭后将不再显示',
  }, 201)
}

export async function handleDeleteProxyKey(c: Context<{ Bindings: Env }>) {
  const id = c.req.param('id')
  if (!id) return c.json<ApiResponse>({ success: false, message: '缺少 id 参数' }, 400)
  const deleted = await deleteProxyKey(c.env, id)
  if (!deleted) {
    return c.json<ApiResponse>({ success: false, message: '转发 Key 不存在' }, 404)
  }
  return c.json<ApiResponse>({ success: true, message: '转发 Key 已删除' })
}

export async function handleUpdateProxyKey(c: Context<{ Bindings: Env }>) {
  const id = c.req.param('id')
  if (!id) return c.json<ApiResponse>({ success: false, message: '缺少 id 参数' }, 400)
  const body = await c.req.json<{ enabled?: boolean }>()
  const updates: Partial<import('./types').ProxyKey> = {}
  if (body.enabled !== undefined) updates.enabled = body.enabled
  const updated = await updateProxyKey(c.env, id, updates)
  if (!updated) {
    return c.json<ApiResponse>({ success: false, message: '转发 Key 不存在' }, 404)
  }
  return c.json<ApiResponse>({ success: true, data: updated })
}

// ===== 统一批量保存与日志调试接口 =====

/**
 * 统一批量保存处理函数
 * 将前端汇总的所有提供商、转发 Key 及调试配置一次性打包写入 KV，减少写入频次
 * 若 KV 写入失败，返回友好错误提示，以便前端完整保留临时草稿供用户重试
 */
export async function handleBatchSave(c: Context<{ Bindings: Env }>) {
  try {
    const body = await c.req.json<BatchSaveRequest>()

    // 1. 若提交了提供商数组，批量持久化写入 KV
    if (body.providers && Array.isArray(body.providers)) {
      await setProviders(c.env, body.providers)
    }

    // 2. 若提交了转发 Key 数组，批量持久化写入 KV
    if (body.proxyKeys && Array.isArray(body.proxyKeys)) {
      await setProxyKeys(c.env, body.proxyKeys)
    }

    // 3. 若提交了三大梯队配置，搭顺风车批量持久化写入 KV（节省免费 KV 写次数）
    if (body.tiers && typeof body.tiers === 'object') {
      await setTierConfig(c.env, body.tiers)
    }

    // 4. 若提交了自定义路由规则，搭顺风车批量持久化写入 KV
    if (body.customRoutes && Array.isArray(body.customRoutes)) {
      await setCustomRoutes(c.env, body.customRoutes)
    }

    // 5. 若提交了调试模式与缓存配置，同步更新并执行可能需要的即时落盘
    if (body.debugConfig) {
      await updateDebugConfig(c.env, body.debugConfig)
    }

    return c.json<ApiResponse>({
      success: true,
      message: '所有配置已统一保存并写入 Cloudflare KV',
    })
  } catch (err) {
    // 捕获异常，明确提示错误，不丢弃前端数据
    const error = err as Error
    return c.json<ApiResponse>({
      success: false,
      message: `KV 写入失败: ${error.message || '网络异常'}。暂存数据已完整保留，请重试保存。`,
    }, 500)
  }
}

/**
 * 获取内存日志及当前调试与缓存配置
 */
export async function handleGetLogs(c: Context<{ Bindings: Env }>) {
  // 从内存中读取最新日志列表与配置
  const logs = getMemoryLogs()
  const debugConfig = getDebugConfig()

  return c.json<ApiResponse<{ logs: typeof logs; debugConfig: DebugConfig }>>({
    success: true,
    data: {
      logs,
      debugConfig,
    },
  })
}

/**
 * 清空内存中的日志列表
 */
export async function handleClearLogs(c: Context<{ Bindings: Env }>) {
  clearMemoryLogs()
  return c.json<ApiResponse>({
    success: true,
    message: '内存日志已清空',
  })
}

/**
 * 更新调试与缓存策略配置
 * 切换为调试模式瞬间，强制将内存中未落盘的缓存数据统一刷入 KV
 */
export async function handleUpdateDebugConfig(c: Context<{ Bindings: Env }>) {
  try {
    const body = await c.req.json<Partial<DebugConfig>>()
    const updated = await updateDebugConfig(c.env, body)

    return c.json<ApiResponse<DebugConfig>>({
      success: true,
      data: updated,
      message: updated.debugMode
        ? '已开启调试模式（仅记录报错与超时，内存未落地缓存已统一落盘）'
        : '已切换为正式模式（已启用内存缓存与 30 秒定时落盘）',
    })
  } catch (err) {
    const error = err as Error
    return c.json<ApiResponse>({
      success: false,
      message: `更新配置失败: ${error.message || '未知错误'}`,
    }, 500)
  }
}

/**
 * 一键拉取上游模型列表
 * 支持从 OpenAI 兼容 / Anthropic 兼容上游服务或 OpenCode 镜像拉取可用模型
 */
export async function handleFetchUpstreamModels(c: Context<{ Bindings: Env }>) {
  try {
    const body = await c.req.json<{
      providerId?: string
      baseUrl?: string
      apiType?: 'openai' | 'anthropic'
      apiKey?: string
    }>()

    const { providerId, baseUrl, apiType = 'openai', apiKey } = body

    // 针对 OpenCode 供应商特殊处理
    if (providerId === 'opencode' || isOpenCodeProvider(providerId || '')) {
      const mirrorUrls = resolveOpenCodeUrls(c.env)
      const testRes = await fetchOpenCodeModels(baseUrl || '', apiKey ? [{ key: apiKey, enabled: true }] : [], mirrorUrls)
      const resPayload = testRes.data as { data?: Array<{ id?: string }> } | undefined
      const list = resPayload?.data || []
      const modelIds: string[] = Array.from(new Set(list.map((m) => String(m.id || '')).filter(Boolean)))
      return c.json<ApiResponse<{ models: string[] }>>({
        success: true,
        data: { models: modelIds },
        message: `成功拉取到 ${modelIds.length} 个模型`,
      })
    }

    if (!baseUrl) {
      return c.json<ApiResponse>({
        success: false,
        message: '请提供上游 API 地址 (baseUrl)',
      }, 400)
    }

    // 规范化 URL 地址，拼接 /models 路径
    let targetUrl = baseUrl.trim().replace(/\/+$/, '')
    if (!targetUrl.endsWith('/models')) {
      if (targetUrl.endsWith('/v1')) {
        targetUrl += '/models'
      } else {
        targetUrl += '/v1/models'
      }
    }

    const headers: Record<string, string> = {
      'User-Agent': 'Cloudflare-Worker-AI-Gateway/1.0',
    }

    if (apiKey) {
      if (apiType === 'anthropic') {
        headers['x-api-key'] = apiKey
        headers['anthropic-version'] = '2023-06-01'
      } else {
        headers['Authorization'] = `Bearer ${apiKey}`
      }
    }

    // 设置 10 秒超时
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000)

    try {
      const resp = await fetch(targetUrl, {
        method: 'GET',
        headers,
        signal: controller.signal,
      })
      clearTimeout(timeoutId)

      if (!resp.ok) {
        return c.json<ApiResponse>({
          success: false,
          message: `上游返回 HTTP ${resp.status} ${resp.statusText}`,
        }, 400)
      }

      const data = await resp.json() as { data?: Array<{ id?: string }>; models?: Array<{ id?: string }> } | Array<{ id?: string } | string>
      let rawList: string[] = []

      if (Array.isArray(data)) {
        rawList = data.map((item) => (typeof item === 'string' ? item : item?.id || '')).filter(Boolean)
      } else if (data && typeof data === 'object') {
        if (Array.isArray(data.data)) {
          rawList = data.data.map((item) => item?.id || '').filter(Boolean)
        } else if (Array.isArray(data.models)) {
          rawList = data.models.map((item) => item?.id || '').filter(Boolean)
        }
      }

      // 剔除空项、全局去重并按字母排序
      const uniqueModels = Array.from(new Set(rawList)).filter(Boolean).sort()

      return c.json<ApiResponse<{ models: string[] }>>({
        success: true,
        data: { models: uniqueModels },
        message: `成功拉取到 ${uniqueModels.length} 个模型`,
      })
    } catch (fetchErr) {
      clearTimeout(timeoutId)
      const isAbort = (fetchErr as Error).name === 'AbortError'
      return c.json<ApiResponse>({
        success: false,
        message: isAbort ? '拉取上游模型请求超时 (10秒)' : `连接上游失败: ${(fetchErr as Error).message}`,
      }, 502)
    }
  } catch (err) {
    return c.json<ApiResponse>({
      success: false,
      message: `处理请求失败: ${(err as Error).message}`,
    }, 500)
  }
}

// ===== 探测调度框架 API（海选探测、OpenClaw专属探测、探测日志查询、梯队补位） =====

import { runAuditionProbeRound, runOpenClawProbe, triggerTierRefill } from './probe'
import { getProbeLogs, getAuditionCursor } from './storage'
import type { TierKey } from './types'

/**
 * 手动/自动触发指定梯队的智能补位迭代
 */
export async function handleTriggerTierRefill(c: Context<{ Bindings: Env }>) {
  try {
    const body = await c.req.json<{ tierKey: TierKey }>()
    if (!body.tierKey || !['tier1', 'tier2', 'tier3'].includes(body.tierKey)) {
      return c.json<ApiResponse>({ success: false, message: '无效的 tierKey 参数，仅支持 tier1 / tier2 / tier3' }, 400)
    }
    const result = await triggerTierRefill(c.env, body.tierKey)
    return c.json<ApiResponse<typeof result>>({
      success: result.success,
      data: result,
      message: result.message,
    })
  } catch (err) {
    return c.json<ApiResponse>({
      success: false,
      message: `梯队补位执行异常: ${(err as Error).message}`,
    }, 500)
  }
}

/**
 * 触发单轮海选探测（游标轮询探测 1 个模型，严格隔离数据，不影响业务淘汰）
 */
export async function handleRunAuditionProbe(c: Context<{ Bindings: Env }>) {
  try {
    const result = await runAuditionProbeRound(c.env)
    return c.json<ApiResponse<typeof result>>({
      success: result.success,
      data: result,
      message: result.message,
    })
  } catch (err) {
    return c.json<ApiResponse>({
      success: false,
      message: `海选探测执行异常: ${(err as Error).message}`,
    }, 500)
  }
}

/**
 * 触发 OpenClaw 专属指令测试（验证候选模型是否支持 OpenClaw，成功后打标）
 */
export async function handleRunOpenClawProbe(c: Context<{ Bindings: Env }>) {
  try {
    const body = await c.req.json<{ providerId?: string; modelId?: string }>().catch(() => ({} as { providerId?: string; modelId?: string }))
    const result = await runOpenClawProbe(c.env, body.providerId, body.modelId)
    return c.json<ApiResponse<typeof result>>({
      success: result.success,
      data: result,
      message: result.message,
    })
  } catch (err) {
    return c.json<ApiResponse>({
      success: false,
      message: `OpenClaw 专属探测异常: ${(err as Error).message}`,
    }, 500)
  }
}

/**
 * 获取探测状态、游标位置及隔离的探测日志
 */
export async function handleGetProbeStatus(c: Context<{ Bindings: Env }>) {
  try {
    const [cursor, auditionLogs, openclawLogs] = await Promise.all([
      getAuditionCursor(c.env),
      getProbeLogs(c.env, 'audition'),
      getProbeLogs(c.env, 'openclaw'),
    ])

    return c.json<ApiResponse>({
      success: true,
      data: {
        cursor,
        auditionLogs,
        openclawLogs,
      },
    })
  } catch (err) {
    return c.json<ApiResponse>({
      success: false,
      message: `获取探测状态失败: ${(err as Error).message}`,
    }, 500)
  }
}

/**
 * 获取自定义路由规则配置
 */
export async function handleGetCustomRoutes(c: Context<{ Bindings: Env }>) {
  try {
    const routes = await getCustomRoutes(c.env)
    return c.json<ApiResponse<typeof routes>>({ success: true, data: routes })
  } catch (err) {
    return c.json<ApiResponse>({
      success: false,
      message: `获取自定义路由失败: ${(err as Error).message}`,
    }, 500)
  }
}

