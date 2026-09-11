/**
 * 版本号: v1.0.55
 * 模块: AI Gateway 主应用入口与路由配置
 */
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import type { Env } from './types'
import { adminAuthMiddleware, proxyKeyAuthMiddleware, handleLogin, handleLogout } from './auth'
import { handleProxy, handleModels } from './proxy'
import {
  handleStatus,
  handleGetProviders,
  handleCreateProvider,
  handleUpdateProvider,
  handleDeleteProvider,
  handleTestModel,
  handleTestKeyNew,
  handleTestModelNew,
  handleGetProxyKeys,
  handleCreateProxyKey,
  handleUpdateProxyKey,
  handleDeleteProxyKey,
  handleBatchSave,
  handleGetLogs,
  handleClearLogs,
  handleUpdateDebugConfig,
  handleFetchUpstreamModels,
  handleRunAuditionProbe,
  handleRunOpenClawProbe,
  handleGetProbeStatus,
  handleTriggerTierRefill,
  handleGetCustomRoutes,
} from './admin'
import { renderHomePage, renderLoginPage, renderAdminPage } from './pages'
import { seedInitialData, getSession } from './storage'
// 导入探测任务内存互斥锁（注意：单 Worker 实例内存生效，严格遵循不增加 KV 读写配额设计）
import { isProbeRunning, tryAcquireProbeLock, releaseProbeLock, runWithProbeLock } from './probe-lock'

const app = new Hono<{ Bindings: Env }>()

// ===== 全局中间件 =====
app.use('*', cors())
app.use('*', logger())

// 首次请求时填充虚拟数据
let seeded = false
app.use('*', async (c, next) => {
  if (!seeded) {
    await seedInitialData(c.env)
    seeded = true
  }
  return next()
})

// ===== 首页 =====
app.get('/', async (c) => {
  const { getCookie } = await import('hono/cookie')
  // 兼顾 Cookie 与 URL 携带的会话 ID
  const sessionId = getCookie(c, 'session_id') || c.req.query('session_id')
  let isLoggedIn = false
  if (sessionId) {
    const session = await getSession(c.env, sessionId)
    isLoggedIn = session !== null
  }
  return renderHomePage(c, isLoggedIn)
})

// ===== 登录/退出 =====
app.get('/admin/login', async (c) => {
  const { getCookie } = await import('hono/cookie')
  const sessionId = getCookie(c, 'session_id') || c.req.query('session_id')
  // 若已存在有效登录会话，直接跳转至管理后台，无需重复登录
  if (sessionId) {
    const session = await getSession(c.env, sessionId)
    if (session) {
      return c.redirect(c.req.query('session_id') ? `/admin?session_id=${encodeURIComponent(sessionId)}` : '/admin')
    }
  }
  return renderLoginPage(c)
})
app.post('/admin/login', handleLogin)
app.get('/admin/logout', handleLogout)

// ===== 管理后台（需 Session 验证） =====
app.use('/admin/*', adminAuthMiddleware)

app.get('/admin', async (c) => renderAdminPage(c))

// 系统状态
app.get('/admin/api/status', handleStatus)

// 提供商 CRUD
app.get('/admin/api/providers', handleGetProviders)
app.post('/admin/api/providers', handleCreateProvider)
app.put('/admin/api/providers/:id', handleUpdateProvider)
app.delete('/admin/api/providers/:id', handleDeleteProvider)
app.post('/admin/api/providers/:id/test-model', handleTestModel)
app.post('/admin/api/test-key', handleTestKeyNew)
app.post('/admin/api/test-model', handleTestModelNew)
app.post('/admin/api/fetch-upstream-models', handleFetchUpstreamModels)

// 转发 Key 管理
app.get('/admin/api/proxy-keys', handleGetProxyKeys)
app.post('/admin/api/proxy-keys', handleCreateProxyKey)
app.delete('/admin/api/proxy-keys/:id', handleDeleteProxyKey)
app.patch('/admin/api/proxy-keys/:id', handleUpdateProxyKey)

// 统一批量保存与系统日志管理
app.post('/admin/api/batch-save', handleBatchSave)
app.get('/admin/api/custom-routes', handleGetCustomRoutes)
app.get('/admin/api/logs', handleGetLogs)
app.delete('/admin/api/logs', handleClearLogs)
app.post('/admin/api/debug-config', handleUpdateDebugConfig)

// 自动择优探测调度框架（海选轮询探测、OpenClaw专属测试与探测状态、梯队补位迭代）
app.post('/admin/api/probe/audition', handleRunAuditionProbe)
app.post('/admin/api/probe/openclaw', handleRunOpenClawProbe)
app.post('/admin/api/probe/refill', handleTriggerTierRefill)
app.get('/admin/api/probe/status', handleGetProbeStatus)

// ===== API 转发路由（需转发 Key 验证） =====
app.use('/v1/*', proxyKeyAuthMiddleware)
app.get('/v1/models', handleModels)
app.all('/v1/*', handleProxy)

// ===== 404 处理 =====
app.notFound((c) => {
  return c.json({ error: { message: '接口不存在', type: 'not_found' } }, 404)
})

// ===== 错误处理 =====
app.onError((err, c) => {
  console.error('未捕获的错误:', err)
  return c.json({ error: { message: '服务器内部错误', type: 'server_error' } }, 500)
})

export default app
