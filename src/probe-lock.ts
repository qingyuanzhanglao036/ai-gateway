/**
 * 版本号: v1.0.4
 * 模块: 探测任务内存互斥锁
 *
 * 约束说明：
 * 1. 本互斥锁维护在 Worker 单实例运行时的全局内存中，同一时间仅允许执行一轮初始化探测或补位探测，防止并发重复探测造成上游雪崩与资源浪费。
 * 2. 【限制说明】：由于 Cloudflare Workers 为分布式无状态架构，且多实例不共享内存，本锁仅在单 Worker 实例内生效，多实例并发时跨实例失效。
 * 3. 遵照用户指令及严格控制 Cloudflare 免费版 KV 读写配额（每日写上限 1000 次），此处不做分布式锁，不向 KV 写入任何锁数据。
 */

// 内存锁状态标识：true 表示已有探测任务正在执行中，false 表示空闲
let isProbeLocked = false

// 当前执行的探测任务类型（'init' 初始化探测 | 'refill' 补位探测 | null）
let currentProbeType: 'init' | 'refill' | null = null

// 获取锁的时间戳，用于超时自动释放兜底（防止死锁）
let lockAcquiredAt = 0

// 探测超时时间（毫秒），若超过 15 秒未释放则自动解除互斥锁
const PROBE_LOCK_TIMEOUT_MS = 15000

/**
 * 尝试获取探测任务内存互斥锁
 * @param probeType 任务类型：'init'（初始化探测）或 'refill'（补位探测）
 * @returns boolean true 表示成功获取互斥锁；false 表示当前已有任务在执行，应直接跳过
 */
export function tryAcquireProbeLock(probeType: 'init' | 'refill'): boolean {
  const now = Date.now()
  // 超时兜底检查：若上一轮探测超过 15 秒未释放，强制重置互斥锁，避免单实例死锁
  if (isProbeLocked && now - lockAcquiredAt > PROBE_LOCK_TIMEOUT_MS) {
    console.warn(`[探测互斥锁] 上一轮探测任务 (${currentProbeType}) 执行超时，内存互斥锁已自动重置`)
    isProbeLocked = false
    currentProbeType = null
  }

  // 若已被锁定，直接返回 false，拒绝并发重复探测
  if (isProbeLocked) {
    return false
  }

  // 成功获得互斥锁并记录状态
  isProbeLocked = true
  currentProbeType = probeType
  lockAcquiredAt = now
  return true
}

/**
 * 显式释放探测任务内存互斥锁
 */
export function releaseProbeLock(): void {
  isProbeLocked = false
  currentProbeType = null
  lockAcquiredAt = 0
}

/**
 * 检查当前是否有探测任务在运行
 */
export function isProbeRunning(): boolean {
  const now = Date.now()
  if (isProbeLocked && now - lockAcquiredAt > PROBE_LOCK_TIMEOUT_MS) {
    isProbeLocked = false
    currentProbeType = null
  }
  return isProbeLocked
}

/**
 * 获取当前锁信息（用于状态查询与调试）
 */
export function getProbeLockInfo() {
  return {
    isLocked: isProbeRunning(),
    currentType: currentProbeType,
    runningMs: isProbeLocked ? Date.now() - lockAcquiredAt : 0,
  }
}

/**
 * 执行受内存互斥锁保护的探测任务
 * 同一时间只允许单实例内执行一轮探测
 */
export async function runWithProbeLock<T>(
  probeType: 'init' | 'refill',
  task: () => Promise<T>
): Promise<{ executed: boolean; result?: T }> {
  if (!tryAcquireProbeLock(probeType)) {
    return { executed: false }
  }
  try {
    const result = await task()
    return { executed: true, result }
  } finally {
    releaseProbeLock()
  }
}
