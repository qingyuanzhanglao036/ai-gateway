/**
 * 版本号: v1.0.2
 * 模块: 身份验证与管理员权限鉴权中间件（支持 iframe 预览环境与双通道会话凭据）
 */
import { Context, Next } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { createSession, getSession, deleteSession, validateProxyKey } from './storage'
import { SESSION_TTL } from './config'
import type { Env } from './types'

// 默认管理员账号与密码（当 Cloudflare 环境变量未设置时作为安全兜底，避免 500 崩溃）
const DEFAULT_ADMIN_USERNAME = 'admin'
const DEFAULT_ADMIN_PASSWORD = 'admin123456'

/**
 * SHA-256 密码哈希函数
 * 使用 Web Crypto 原生 API 将明文密码转换为 16 进制哈希值，确保密码比对安全
 */
export async function hashPassword(password: string): Promise<string> {
  // 创建文本编码器
  const encoder = new TextEncoder()
  // 转换为二进制字节数组
  const data = encoder.encode(password)
  // 调用浏览器与 Worker 原生加密算法计算 SHA-256
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  // 将每一个字节格式化为 2 位十六进制字符串拼接返回
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * 管理后台 Session 验证中间件
 * 拦截未登录或 Session 过期的后台请求，重定向或返回 401 状态
 * 兼容 Cookie 鉴权与 URL/Header 双通道鉴权（适配嵌入式 iframe 画中画）
 */
export async function adminAuthMiddleware(c: Context<{ Bindings: Env }>, next: Next) {
  // 1. 优先尝试从 Cookie 中读取当前用户的 session_id
  let sessionId = getCookie(c, 'session_id')

  // 2. 若 Cookie 为空（在 iframe 画中画预览环境下浏览器会拦截第三方 Cookie），兼容从 URL 参数或请求头读取
  if (!sessionId) {
    const url = new URL(c.req.url)
    sessionId = url.searchParams.get('session_id') || c.req.header('x-session-id') || undefined
  }

  // 若仍无 session_id，判断是 API 接口调用还是普通页面访问
  if (!sessionId) {
    const url = new URL(c.req.url)
    // 如果正是访问登录页面，直接放行
    if (url.pathname === '/admin/login') return next()
    // 如果是后台管理 API 接口，返回 401 未登录 JSON 提示
    if (url.pathname.startsWith('/admin/api/')) {
      return c.json({ success: false, message: '未登录' }, 401)
    }
    // 页面访问则重定向跳转至登录页
    return c.redirect('/admin/login')
  }

  // 从 KV 中查询 Session 是否有效且未过期
  const session = await getSession(c.env, sessionId)
  if (!session) {
    // Session 失效，清理客户端无效的 Cookie
    deleteCookie(c, 'session_id')
    const url = new URL(c.req.url)
    // 如果是 API 接口，返回 401 会话过期提示
    if (url.pathname.startsWith('/admin/api/')) {
      return c.json({ success: false, message: 'Session 已过期' }, 401)
    }
    // 页面访问重定向至登录页
    return c.redirect('/admin/login')
  }

  // 验证通过，将管理员用户名与 sessionId 挂载到上下文中并放行下一个中间件
  ;(c as any).set('username', session.username)
  ;(c as any).set('sessionId', sessionId)
  return next()
}

/**
 * 管理员登录处理函数
 * 校验用户提交的账号密码，验证成功后生成 Session 并写入 Cookie，同时返回 sessionId
 */
export async function handleLogin(c: Context<{ Bindings: Env }>) {
  // 解析用户提交的 JSON 请求体
  const { username, password } = await c.req.json()

  // 优先读取 Cloudflare 环境变量，若未配置则安全回退至默认账号，防止抛出 500 错误
  const adminUser = c.env.ADMIN_USERNAME || DEFAULT_ADMIN_USERNAME
  const adminPass = c.env.ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD

  // 校验前端是否输入了用户名和密码
  if (!username || !password) {
    return c.json({ success: false, message: '请输入用户名和密码' }, 400)
  }

  // 校验用户名是否匹配
  if (username !== adminUser) {
    return c.json({ success: false, message: '用户名或密码错误' }, 401)
  }

  // 计算输入密码与后台预设密码的 SHA-256 哈希值进行比对
  const passwordHash = await hashPassword(password)
  const adminPassHash = await hashPassword(adminPass)

  // 校验密码哈希是否匹配
  if (passwordHash !== adminPassHash) {
    return c.json({ success: false, message: '用户名或密码错误' }, 401)
  }

  // 验证成功，创建带过期时间的 Session（顺风打包写入 KV）
  const sessionId = await createSession(c.env, username, SESSION_TTL)
  // 将 session_id 写入 Cookie，设置 SameSite: 'None' 和 secure: true 确保在嵌入式 iframe 中有效
  setCookie(c, 'session_id', sessionId, {
    httpOnly: true,
    secure: true,
    sameSite: 'None',
    path: '/',
    maxAge: SESSION_TTL,
  })

  // 返回登录成功响应，附带 sessionId 方便前端在画中画受限环境下携带跳转
  return c.json({ success: true, message: '登录成功', sessionId })
}

/**
 * 退出登录处理函数
 * 清理 KV 中的 Session 记录并擦除浏览器 Cookie
 */
export async function handleLogout(c: Context<{ Bindings: Env }>) {
  // 读取当前 Cookie 中的 session_id，若无则尝试从 URL 参数或请求头中读取
  let sessionId = getCookie(c, 'session_id')
  if (!sessionId) {
    const url = new URL(c.req.url)
    sessionId = url.searchParams.get('session_id') || c.req.header('x-session-id') || undefined
  }
  if (sessionId) {
    // 从 KV 中删除该 Session
    await deleteSession(c.env, sessionId)
    // 清除客户端 Cookie
    deleteCookie(c, 'session_id')
  }
  // 重定向回首页
  return c.redirect('/')
}

/**
 * 转发 API Key 鉴权中间件
 * 校验第三方调用者携带的 Authorization 请求头（格式为 Bearer sk_cf_*）
 */
export async function proxyKeyAuthMiddleware(c: Context<{ Bindings: Env }>, next: Next) {
  // 读取请求头中的 Authorization 字段
  const authHeader = c.req.header('Authorization')
  // 检查是否具备正确的 Bearer 格式
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({
      error: { message: '缺少或无效的 Authorization 头，格式: Bearer sk_cf_*', type: 'authentication_error' },
    }, 401)
  }

  // 截取 Bearer 后的 Key 字符串
  const token = authHeader.slice(7)
  // 验证 Key 是否有效并且未被禁用
  const isValid = await validateProxyKey(c.env, token)
  if (!isValid) {
    return c.json({
      error: { message: 'API Key 无效或已禁用', type: 'authentication_error' },
    }, 401)
  }

  // 鉴权通过，放行后续代理逻辑
  return next()
}
