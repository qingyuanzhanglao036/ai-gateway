/**
 * 版本号: v1.0.10
 * 模块: 公共前端 JS 脚本与页脚组件
 */
// 公共页脚渲染函数 — 主页与 /admin 页复用，保证两处页脚一致
export const SITE_REPO_URL = 'https://github.com/yutian81/ai-gateway'
export function renderSiteFooter(title: string): string {
  return `<footer class="site-footer">
  <div class="shell site-footer__inner">
    <span>© ${new Date().getFullYear()} <a class="site-footer__link" href="${SITE_REPO_URL}" target="_blank" rel="noreferrer">${title}</a></span>
    <span>Cloudflare Workers · Hono · KV</span>
  </div>
</footer>`
}

// 共享 JS 工具函数 — 注入到后台页面的 <script> 块中
export const SHARED_JS = `
// ── Session 会话凭据保持（自动在受限 iframe 环境下为请求附加凭据） ──
(function() {
  // 从当前 URL 参数或本地 sessionStorage 中获取 session_id
  var sid = new URLSearchParams(window.location.search).get('session_id') || (function() {
    try { return sessionStorage.getItem('session_id') } catch(e) { return null }
  })();
  if (sid) {
    try { sessionStorage.setItem('session_id', sid) } catch(e) {}
    // 拦截全局 fetch，自动添加 x-session-id 头
    var origFetch = window.fetch;
    window.fetch = function(url, options) {
      options = options || {};
      options.headers = options.headers || {};
      if (options.headers instanceof Headers) {
        if (!options.headers.has('x-session-id')) options.headers.append('x-session-id', sid);
      } else if (Array.isArray(options.headers)) {
        options.headers.push(['x-session-id', sid]);
      } else {
        options.headers['x-session-id'] = sid;
      }
      return origFetch.call(this, url, options);
    };
  }
})();

// ── 工具函数 ──
// 规范化 URL：去除末尾的多余斜杠（使用 new RegExp 防止 ES 模板字符串转义导致单行注释语法错误）
function normalizeUrl(url) {
  if (!url) return '';
  return url.replace(new RegExp('/+$'), '');
}
function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
function buildAuthHeaders(apiType, key) {
  return apiType === 'anthropic'
    ? { 'x-api-key': key, 'anthropic-version': '2023-06-01' }
    : { 'Authorization': 'Bearer ' + key }
}

// ── UI 函数 ──
function showSpinner(el) {
  el.innerHTML = '<span class="mu"><i class="fas fa-spinner fa-spin"></i> 测试中...</span>'
}
function showResult(el, success, msg) {
  el.innerHTML = success
    ? '<div class="al al-s"><i class="fas fa-check-circle"></i> 连接成功</div>'
    : '<div class="al al-e"><i class="fas fa-times-circle"></i> ' + escapeHtml(msg || '连接失败') + '</div>'
}

// ── API 请求函数 ──
async function testKeyConnection(url, apiType, key, providerId) {
  try {
    var r = await fetch('/admin/api/test-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: url, apiKey: key, apiType: apiType, providerId: providerId })
    })
    var d = await r.json()
    if (d.success && d.data) {
      return { success: d.data.success, status: d.data.statusCode, data: d.data.data, message: d.data.message }
    }
    return { success: false, status: 0, data: null }
  } catch (e) {
    return { success: false, status: 0, data: null }
  }
}
async function testModelConnection(url, apiType, key, modelId, providerId) {
  try {
    var r = await fetch('/admin/api/test-model', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: url, apiKey: key, apiType: apiType, model: modelId, providerId: providerId })
    })
    var d = await r.json()
    if (d.success && d.data) {
      return { success: d.data.success, status: d.data.statusCode }
    }
    return { success: false, status: 0 }
  } catch (e) {
    return { success: false, status: 0 }
  }
}
`