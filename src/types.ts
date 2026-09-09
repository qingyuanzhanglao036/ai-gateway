/**
 * 版本号: v1.0.12
 * 模块: AI Gateway 核心类型定义与模型智能分类辅助函数
 */

// 模型智能分类类型：文本、绘图、多模态、其他
export type ModelCategory = 'text' | 'image' | 'multimodal' | 'other'

// 模型健康标记状态：healthy（正常）、cooling（冷却中，标黄）、dead（永久失效，标红）
export type ModelStatus = 'healthy' | 'cooling' | 'dead'

// ===== 会话调度粘性数据结构（同一会话优先复用历史成功模型） =====
export interface SessionStickinessItem {
  providerId: string
  modelId: string
  lastSuccessAt: number
}

export interface SessionStickinessRecord {
  sessionId: string
  // 单会话最多保存最近 5 条成功模型（滑动窗口）
  history: SessionStickinessItem[]
  updatedAt: number
}

export interface Model {
  id: string
  enabled: boolean
  // 模型健康标记状态：healthy（正常）、cooling（冷却中，标黄）、dead（永久失效，标红）
  status?: ModelStatus
  // 冷却截止时间戳（毫秒），存入 KV，Worker 重启不丢失
  cooldownUntil?: number
  // 连续失败/探测失败累计计数器（冷却结束不重置，累计3次探测失败则永久失效）
  failCount?: number
  // 失效原因描述（如鉴权失败、模型不存在、探测超限等）
  deadReason?: string
  // 智能自动或手动分类：text（文本）、image（绘图）、multimodal（多模态）、other（其他）
  category?: ModelCategory
  // 管理员是否手动指定了分类（手动分类优先级高于自动关键词识别）
  isManualCategory?: boolean
  // 模型特征标签数组（如 ['openclaw']），支持探测自动打标与管理员手动增删修改
  tags?: string[]
}

/**
 * 判断模型是否具备 OpenClaw 专属支持标签
 */
export function isModelOpenClawSupported(model: Model): boolean {
  if (!model) return false
  if (Array.isArray(model.tags) && model.tags.includes('openclaw')) return true
  // 兼容 ID 显式包含 openclaw 特征
  if (typeof model.id === 'string' && /openclaw/i.test(model.id)) return true
  return false
}

// ===== 三套隔离数据结构定义（海选探测、OpenClaw专属探测、真实业务延迟） =====

// 1. 海选轮询游标（持久化存入 KV: probe:audition:cursor，实例重启不丢失）
export interface AuditionCursor {
  providerIndex: number // 上次探测到的提供商索引
  modelIndex: number    // 上次探测到的模型索引
  lastProbedAt?: number // 上次探测的时间戳
  lastModelId?: string  // 上次探测的模型 ID
}

// 探测结果明细（海选探测与 OpenClaw 探测通用结果对象，完全隔离存储）
export interface ProbeResult {
  providerId: string
  modelId: string
  type: 'audition' | 'openclaw' // 探测类型
  success: boolean
  statusCode: number
  latencyMs: number
  message: string
  timestamp: number
  details?: Record<string, unknown>
}

// 2. 真实业务延迟样本（单条）
export interface BusinessLatencySample {
  timestamp: number
  latencyMs: number
  statusCode: number
  success: boolean
}

// 2.1 每个模型保留最近 50 条业务延迟样本（独立存储，梯队动态淘汰仅采信此数据）
export interface ModelBusinessLatencyStats {
  providerId: string
  modelId: string
  samples: BusinessLatencySample[] // 最多 50 条（滑动窗口，旧样本丢弃）
  averageLatencyMs: number         // 最近有效样本的平均延迟
  lastUpdated: number
}

/**
 * 根据模型名称关键词自动识别模型分类
 * 规则：
 * 1. 绘图关键词: draw、image、flux、sd、绘画
 * 2. 多模态关键词: vision、vl
 * 3. 其余默认文本，匹配不到归为其他
 */
export function detectModelCategory(modelId: string): ModelCategory {
  if (!modelId || typeof modelId !== 'string') return 'other'
  const lower = modelId.toLowerCase()
  // 优先匹配绘图关键词
  if (/draw|image|flux|sd|绘画/.test(lower)) {
    return 'image'
  }
  // 匹配多模态关键词
  if (/vision|vl/.test(lower)) {
    return 'multimodal'
  }
  // 默认归为文本模型
  return 'text'
}

export interface ApiKeyEntry {
  key: string
  enabled: boolean
}

export interface Provider {
  id: string
  name: string
  baseUrl: string
  apiType?: 'openai' | 'anthropic'
  apiKeys: ApiKeyEntry[]
  models: Model[]
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export interface ProxyKey {
  id: string
  key: string
  name: string
  enabled: boolean
  createdAt: string
  expiresAt?: string | null
}

export interface Session {
  username: string
  expiresAt: number
}

export interface ProxyRequestBody {
  model?: string
  messages?: Array<{ role: string; content: string }>
  [key: string]: unknown
}

export interface TestModelRequest {
  modelId: string
}

export interface CreateProviderRequest {
  id: string
  name: string
  baseUrl: string
  apiType?: 'openai' | 'anthropic'
  apiKeys?: Array<{ key: string; enabled: boolean }>
  models?: Array<{ id: string; enabled: boolean }> | string[]
  enabled?: boolean
}

export interface UpdateProviderRequest {
  name?: string
  baseUrl?: string
  apiType?: 'openai' | 'anthropic'
  apiKeys?: Array<{ key: string; enabled: boolean }>
  models?: Array<{ id: string; enabled: boolean }> | string[]
  enabled?: boolean
}

export interface CreateProxyKeyRequest {
  name?: string
  expiresIn?: string // '30d' | '90d' | '180d' | '1y' | 'forever'
}

export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  message?: string
}

export interface LogEntry {
  id: string
  timestamp: string
  model: string
  key: string
  durationMs: number
  statusCode: number
  failReason: string
  ip: string
}

export interface DebugConfig {
  debugMode: boolean
  maxCacheItems: number
  flushIntervalSec: number
}

// ===== 梯队池数据结构定义 =====
// 梯队内模型的关联引用（指向供应商及其模型ID）
export interface TierModelEntry {
  providerId: string    // 归属的供应商 ID
  modelId: string       // 模型 ID
  category?: 'text' | 'image' | 'multimodal' | 'other' // 分类（可选）
  addedAt?: number      // 加入梯队的时间戳
}

// 梯队标识 Key: tier1, tier2, tier3
export type TierKey = 'tier1' | 'tier2' | 'tier3'

// 单个梯队池配置
export interface TierPoolConfig {
  id: TierKey                     // 梯队标识
  name: string                    // 梯队名称（如第一梯队旗舰模型池）
  alias: string                   // 外部调用别名（如 flagship/auto）
  maxSeats: number                // 最大席位数（默认 9 / 6 / 6）
  models: TierModelEntry[]        // 在席模型列表
}

// 三大梯队池聚合结构
export interface TierConfig {
  tier1: TierPoolConfig           // 第一梯队(Tier1)旗舰模型池 flagship/auto（默认9席）
  tier2: TierPoolConfig           // 第二梯队(Tier2)openclaw模型池 openclaw/auto（默认6席）
  tier3: TierPoolConfig           // 第三梯队(Tier3)绘图专属池 drawing/auto（默认6席）
}

// 自定义路由规则接口（最高优先级：匹配指定的调用别名直接定向到具体模型或梯队池）
export interface CustomRouteRule {
  id: string              // 规则唯一标识 ID
  alias: string           // 匹配调用的模型别名/请求名（如 my-gpt4 或 gpt-4）
  target: string          // 目标对象：提供商模型（如 openai/gpt-4o）或梯队池（如 tier1/auto）
  enabled: boolean        // 是否启用规则
  description?: string    // 描述说明
  createdAt?: string      // 创建时间
}

export interface BatchSaveRequest {
  providers?: Provider[]
  proxyKeys?: ProxyKey[]
  debugConfig?: Partial<DebugConfig>
  tiers?: TierConfig              // 顺风车合并保存梯队配置
  customRoutes?: CustomRouteRule[] // 顺风车合并保存自定义路由规则
}

export interface Env {
  KV: KVNamespace
  ADMIN_USERNAME?: string
  ADMIN_PASSWORD?: string
  OPENCODE_MIRRORS_URL?: string
}
