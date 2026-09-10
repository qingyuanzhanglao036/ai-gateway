/**
 * 版本号: v1.0.43
 * 模块: 系统常量、KV键名及三大梯队默认配置
 */
import type { Provider, TierConfig } from './types'

// 系统基础配置项
export const SITE_CONFIG = {
  title: 'AI Gateway',
  subtitle: '统一的 AI 管理平台',
  version: 'v1.0.43', // 主页显示的最新系统版本号
  author: 'QingYun',
  authorUrl: 'https://github.com/yutian81/ai-gateway',
  blogUrl: 'https://blog.notett.com',
  description: 'AI 提供商 API 代理网关 — 统一 /v1 接口转发',
  favicon: 'https://pan.811520.xyz/icon/ai.webp',
  faCdn: 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.7.2/css/all.min.css',
}

export const SESSION_TTL = 7 * 24 * 60 * 60

export const PROXY_KEY_PREFIX = 'sk_cf_'

export const OPENCODE_DEFAULT_URL = 'https://opencode.ai/zen/v1'

// Key 降权后自动恢复的冷却时间 (毫秒)
export const KEY_HEALTH_COOLDOWN_MS = 5 * 60 * 1000

// 连续失败多少次后降权 Key
export const KEY_HEALTH_MAX_FAILURES = 5

// ===== 梯队补位、冷却与失效规则常量定义 =====
// 1. 业务请求失败模型冷却时间：10 分钟 (毫秒)
export const MODEL_COOLDOWN_DURATION_MS = 10 * 60 * 1000

// 2. 补位探测防抖时间：同一个梯队 5 秒内最多触发一次补位探测 (毫秒)
export const PROBE_DEBOUNCE_INTERVAL_MS = 5 * 1000

// 3. 单次补位连续海选最大轮数：3 轮
export const MAX_REFILL_PROBE_ROUNDS = 3

// 4. 每轮探测完毕后最多补位入梯队的模型数量：2 个
export const MAX_REFILL_PER_ROUND = 2

// 5. 累计海选延迟探测失败多少次直接标红永久失效：3 次
export const MODEL_MAX_PROBE_FAILURES = 3

// ===== 会话专属调度粘性策略常量 =====
// 1. 单会话最多保存最近成功模型记录数：5 条
export const MAX_SESSION_STICKINESS_HISTORY = 5

// 2. 会话成功模型记录在 KV 中的过期时间 (TTL)：1 小时 (秒)
export const SESSION_STICKINESS_TTL_SECONDS = 60 * 60

export const KV_KEYS = {
  PROVIDERS: 'providers',
  PROXY_KEYS: 'proxy:keys',
  TIERS: 'tier:pools', // 三大梯队持久化键
  CUSTOM_ROUTES: 'routes:custom', // 自定义路由规则持久化键
  PROBE_AUDITION_CURSOR: 'probe:audition:cursor', // 海选探测轮询游标持久化键
  PROBE_AUDITION_LOGS: 'probe:audition:logs',     // 海选探测记录（隔离存储，不作为业务淘汰依据）
  PROBE_OPENCLAW_LOGS: 'probe:openclaw:logs',     // OpenClaw专属探测记录（隔离存储）
  BUSINESS_LATENCY_PREFIX: 'stats:latency:model:',// 真实业务延迟样本（前缀，每个模型最近50条）
  SESSION_STICKINESS_PREFIX: 'session:sticky:',   // 会话粘性调度记录前缀
  SESSION_PREFIX: 'admin:session:',
  KEY_HEALTH_PREFIX: 'key:health:',
  OPENCODE_MIGRATION: 'migration:opencode-default:v1',
  SYSTEM_RECENT_LOGS: 'logs:recent',              // 顺风车持久化日志（最多保留最近50条，跨节点共享）
} as const

// 默认三大梯队池配置（默认所有模型均不入池，席位数严格为 9 / 6 / 6）
export const DEFAULT_TIER_CONFIG: TierConfig = {
  // 1. 第一梯队(Tier1)旗舰模型池 flagship/auto（9席位）
  tier1: {
    id: 'tier1',
    name: '第一梯队 (Tier1) 旗舰模型池',
    alias: 'flagship/auto',
    maxSeats: 9,
    models: [],
  },
  // 2. 第二梯队(Tier2)openclaw模型池 openclaw/auto（6席位）
  tier2: {
    id: 'tier2',
    name: '第二梯队 (Tier2) OpenClaw 模型池',
    alias: 'openclaw/auto',
    maxSeats: 6,
    models: [],
  },
  // 3. 第三梯队(Tier3)绘图专属池 drawing/auto（6席位）
  tier3: {
    id: 'tier3',
    name: '第三梯队 (Tier3) 绘图专属池',
    alias: 'drawing/auto',
    maxSeats: 6,
    models: [],
  },
}

// 有效期选项（秒）
export const EXPIRY_OPTIONS: Record<string, number | null> = {
  '30d': 30 * 24 * 60 * 60,
  '90d': 90 * 24 * 60 * 60,
  '180d': 180 * 24 * 60 * 60,
  '1y': 365 * 24 * 60 * 60,
  'forever': null,
}

export const DEFAULT_PROVIDERS: Provider[] = [
  {
    id: 'opencode',
    name: 'OpenCode',
    baseUrl: 'https://opencode.ai/zen/v1',
    apiType: 'openai',
    apiKeys: [],
    models: [
      { id: 'deepseek-v4-flash-free', enabled: true },
      { id: 'mimo-v2.5-free', enabled: true },
      { id: 'nemotron-3-ultra-free', enabled: true },
      { id: 'hy3-free', enabled: true },
    ],
    enabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
]
