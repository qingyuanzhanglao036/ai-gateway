/**
 * 版本号: v1.0.18
 * 模块: Web 页面渲染（首页、登录页、管理控制台及三大梯队池管理前端）
 */
import { Context } from 'hono'
import { getProviders, getProxyKeys, getTierConfig, getCustomRoutes, getTierModelLatencies } from './storage'
import { SITE_CONFIG, OPENCODE_DEFAULT_URL, DEFAULT_TIER_CONFIG } from './config'
import type { Env, ModelCategory, TierConfig, TierPoolConfig } from './types'
import { detectModelCategory } from './types'
import { CSS_CONTENT } from './pages.css'
import { SHARED_JS, renderSiteFooter } from './shared.js'

// 前端页面模板：仅重构视觉与交互，保持后端路由、KV 结构和 API 契约不变。
const escapePageHtml = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;')

const H = (title: string) => `
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <meta name="theme-color" content="oklch(98.5% 0.004 250)">
  <title>${title} — ${SITE_CONFIG.title}</title>
  <link rel="icon" href="${SITE_CONFIG.favicon}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&amp;family=JetBrains+Mono:wght@400;500;600&amp;family=Space+Grotesk:wght@500;600&amp;display=swap" rel="stylesheet">
  <link rel="stylesheet" href="${SITE_CONFIG.faCdn}">
  <style>${CSS_CONTENT}</style>
</head>`

// ===== 首页 =====

export async function renderHomePage(c: Context<{ Bindings: Env }>, isLoggedIn: boolean) {
  const providers = await getProviders(c.env)
  const tierConfig = await getTierConfig(c.env)
  const host = c.req.header('host') || 'localhost:8787'
  const apiBase = `https://${host}/v1`
  const enabledProviders = providers.filter((provider) => provider.enabled)
  const allModelsCount = providers.reduce((total, provider) => total + provider.models.length, 0)
  const enabledModelsCount = enabledProviders.reduce((total, provider) => total + provider.models.filter((model) => model.enabled).length, 0)

  // 顺风车打包一次性获取 OpenClaw 模型池信息与分类统计，减少不必要的内存及 KV 读写
  const openclawModels = new Set<string>()
  if (tierConfig.tier2 && tierConfig.tier2.models) {
    tierConfig.tier2.models.forEach(m => {
      openclawModels.add(`${m.providerId}/${m.modelId}`)
    })
  }

  const countCategory = (catName: string) => {
    let count = 0
    enabledProviders.forEach(p => {
      p.models.forEach(m => {
        if (!m.enabled) return
        const cat = m.category || detectModelCategory(m.id)
        if (cat === catName) count++
      })
    })
    return count
  }

  const countOpenClaw = () => {
    let count = 0
    enabledProviders.forEach(p => {
      p.models.forEach(m => {
        if (!m.enabled) return
        const fullId = `${p.id}/${m.id}`
        if (openclawModels.has(fullId)) count++
      })
    })
    return count
  }

  const countStatus = (statusName: 'healthy' | 'cooling' | 'dead') => {
    let count = 0
    enabledProviders.forEach(p => {
      p.models.forEach(m => {
        if (!m.enabled) return
        const isDead = m.status === 'dead'
        const isCooling = !isDead && (m.status === 'cooling' || (m.cooldownUntil && m.cooldownUntil > Date.now()))
        const status = isDead ? 'dead' : (isCooling ? 'cooling' : 'healthy')
        if (status === statusName) count++
      })
    })
    return count
  }

  const cntText = countCategory('text')
  const cntImage = countCategory('image')
  const cntMultimodal = countCategory('multimodal')
  const cntOther = countCategory('other')
  const cntOpenClaw = countOpenClaw()
  
  const cntHealthy = countStatus('healthy')
  const cntCooling = countStatus('cooling')
  const cntDead = countStatus('dead')

  // 辅助查找模型与供应商信息
  const provMap = new Map(providers.map(p => [p.id, p]))

  // 顺风车并行查询三大梯队当前模型双延迟数据（探测延迟与真实用户数据延迟）
  const latenciesMap = await getTierModelLatencies(c.env, tierConfig)

  // 渲染单个梯队卡片列表
  const renderTierPoolSection = (tier: TierPoolConfig, icon: string, badgeLabel: string) => {
    const list = tier.models || []
    return `
    <div class="tier-pool-box">
      <div class="tier-pool-box__header">
        <div>
          <div class="tier-pool-box__title"><i class="${icon} c-brand"></i>${escapePageHtml(tier.name)}</div>
          <span class="tier-pool-box__alias"><i class="fas fa-route" style="margin-right: 4px;"></i>别名: ${escapePageHtml(tier.alias)}</span>
        </div>
        <span class="tier-seat-badge ${list.length >= tier.maxSeats ? 'tier-seat-badge--full' : ''}">${isLoggedIn ? `${list.length} / ${tier.maxSeats} 席位` : `${tier.maxSeats} 席位容量`}</span>
      </div>

      <div class="tier-model-list">
        ${isLoggedIn ? (list.length > 0 ? list.map((item) => {
          const prov = provMap.get(item.providerId)
          const pName = prov ? prov.name : item.providerId
          const cat = item.category || 'text'
          let catBadge = `<span class="cat-chip cat-chip--text"><i class="fas fa-font"></i>文本</span>`
          if (cat === 'image') catBadge = `<span class="cat-chip cat-chip--image"><i class="fas fa-paint-brush"></i>绘图</span>`
          else if (cat === 'multimodal') catBadge = `<span class="cat-chip cat-chip--multimodal"><i class="fas fa-eye"></i>多模态</span>`
          else if (cat === 'other') catBadge = `<span class="cat-chip cat-chip--other"><i class="fas fa-cube"></i>其他</span>`

          const fullId = `${item.providerId}/${item.modelId}`
          
          // 获取双指标延迟
          const key = `${item.providerId}:${item.modelId}`
          const latStats = latenciesMap[key] || { probeLatency: null, realLatency: null }
          const probeMs = latStats.probeLatency
          const realMs = latStats.realLatency

          return `<div class="tier-model-item">
            <div class="tier-model-item__info">
              <span class="tier-model-item__prov">${escapePageHtml(pName)}</span>
              <strong>${escapePageHtml(item.modelId)}</strong>
              ${catBadge}
              <div class="tier-model-latencies">
                <span class="latency-badge ${probeMs ? 'latency-badge--probe' : 'latency-badge--none'}" title="最近一次定时自动巡检海选探测延迟">
                  <i class="fas fa-bolt"></i> 探测: ${probeMs ? `${probeMs}ms` : '未探测'}
                </span>
                <span class="latency-badge ${realMs ? 'latency-badge--real' : 'latency-badge--none'}" title="最近 50 次真实用户调用加权平均延迟">
                  <i class="fas fa-chart-bar"></i> 真实: ${realMs ? `${realMs}ms` : '无数据'}
                </span>
              </div>
            </div>
            <button class="icon-btn copy-control" data-copy="${escapePageHtml(fullId)}" type="button" title="复制调用名" aria-label="复制模型名">
              <i class="far fa-copy"></i>
            </button>
          </div>`
        }).join('') : `
          <div style="text-align: center; padding: 18px 8px; color: var(--color-muted); font-size: 13px;">
            <i class="fas fa-inbox" style="margin-bottom: 4px; display: block; font-size: 18px;"></i>
            所有模型默认不入池，管理员可在后台按需指派模型入席
          </div>
        `) : `
          <div style="text-align: center; padding: 20px 10px; color: var(--color-muted); font-size: 13px; background: var(--color-paper-2); border-radius: var(--radius-control); border: 1px dashed var(--color-rule-2);">
            <i class="fas fa-lock" style="margin-bottom: 6px; display: block; font-size: 18px; color: var(--color-brand);"></i>
            登录管理员账户解锁此梯队池席位明细
          </div>
        `}
      </div>

      <div style="display: flex; align-items: center; justify-content: space-between; padding-top: 8px; border-top: 1px solid var(--color-rule);">
        <code style="font-size: 11px; color: var(--color-muted);">${escapePageHtml(tier.alias)}</code>
        <button class="btn btn-s btn-sm copy-control" data-copy="${escapePageHtml(tier.alias)}" type="button" aria-label="复制梯队别名">
          <i class="far fa-copy"></i><span>复制梯队别名</span>
        </button>
      </div>
    </div>`
  }

  // 示例模型 ID
  const sampleModel = isLoggedIn && tierConfig.tier1.models.length > 0
    ? `${tierConfig.tier1.models[0].providerId}/${tierConfig.tier1.models[0].modelId}`
    : 'flagship/auto'

  return c.html(`<!DOCTYPE html><html lang="zh-CN">
${H('首页')}
<body class="site-page home-page">
<header class="topbar">
  <div class="shell topbar__inner">
    <a class="brand" href="/" aria-label="AI Gateway 首页">
      <span class="brand__mark" aria-hidden="true"><i class="fas fa-cloud"></i></span>
      <span class="brand__name">${SITE_CONFIG.title}</span>
      <span class="brand__descriptor">API CONTROL PLANE</span>
      <span style="display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 9999px; background: rgba(59, 130, 246, 0.1); color: var(--color-brand, #2563eb); font-size: 11px; font-weight: 600; font-family: var(--font-mono); border: 1px solid rgba(59, 130, 246, 0.2);">${SITE_CONFIG.version}</span>
    </a>
    <nav class="topbar__actions" aria-label="主导航">
      ${isLoggedIn
        ? `<a href="/admin" class="btn btn-p"><i class="fas fa-sliders-h" aria-hidden="true"></i>管理控制台</a><a href="/admin/logout" class="btn btn-gh"><i class="fas fa-sign-out-alt" aria-hidden="true"></i>退出</a>`
        : `<a href="/admin/login" class="btn btn-p"><i class="fas fa-sign-in-alt" aria-hidden="true"></i>管理员登录</a>`
      }
    </nav>
  </div>
</header>

<main>
  <section class="shell home-hero" aria-labelledby="home-title">
    <div class="home-hero__copy">
      <p class="eyebrow"><span aria-hidden="true"></span>UNIFIED AI GATEWAY</p>
      <h1 id="home-title">一个 API，调用已配置的所有模型。</h1>
      <p class="home-hero__lede">统一的 OpenAI / Anthropic 兼容入口。模型按提供商归档，转发 Key、启用状态和故障转移集中管理。</p>
      <div class="endpoint-box" aria-label="API 接入地址">
        <span class="endpoint-box__label">BASE URL</span>
        <code>${escapePageHtml(apiBase)}</code>
        <button class="icon-btn copy-control" type="button" data-copy="${escapePageHtml(apiBase)}" aria-label="复制 API 地址">
          <i class="far fa-copy" aria-hidden="true"></i><span>复制</span>
        </button>
      </div>
    </div>

    <figure class="request-panel" aria-labelledby="request-caption">
      <figcaption id="request-caption">
        <span>POST /chat/completions</span>
        <span class="protocol-state"><i aria-hidden="true"></i>OPENAI COMPATIBLE</span>
      </figcaption>
      <pre><code><span class="syntax-command">curl</span> ${escapePageHtml(apiBase)}/chat/completions \\
  <span class="syntax-key">-H</span> <span class="syntax-string">"Authorization: Bearer sk-gw-••••"</span> \\
  <span class="syntax-key">-H</span> <span class="syntax-string">"Content-Type: application/json"</span> \\
  <span class="syntax-key">-d</span> <span class="syntax-string">'{
    "model": "${escapePageHtml(sampleModel)}",
    "messages": [{ "role": "user", "content": "Hello" }]
  }'</span></code></pre>
      <div class="request-panel__foot">
        <span>模型格式</span>
        <code>provider/model</code>
      </div>
    </figure>
  </section>

  ${isLoggedIn ? `
  <section class="shell metrics-strip" aria-label="网关配置概览">
    <div class="metric"><span class="metric__value">${providers.length}</span><span class="metric__label">提供商总计</span></div>
    <div class="metric"><span class="metric__value">${enabledProviders.length}</span><span class="metric__label">已启用提供商</span></div>
    <div class="metric"><span class="metric__value">${allModelsCount}</span><span class="metric__label">模型总计</span></div>
    <div class="metric"><span class="metric__value">${enabledModelsCount}</span><span class="metric__label">可用模型</span></div>
  </section>
  ` : `
  <section class="shell metrics-strip" aria-label="网关特性概览">
    <div class="metric"><span class="metric__value" style="font-size: 22px; color: var(--color-brand);"><i class="fas fa-user-shield"></i></span><span class="metric__label">隐私保护模式</span></div>
    <div class="metric"><span class="metric__value" style="font-size: 22px; color: var(--color-brand);"><i class="fas fa-layer-group"></i></span><span class="metric__label">三大智能梯队池</span></div>
    <div class="metric"><span class="metric__value" style="font-size: 22px; color: var(--color-brand);"><i class="fas fa-random"></i></span><span class="metric__label">无缝故障转移</span></div>
    <div class="metric"><span class="metric__value" style="font-size: 22px; color: var(--color-brand);"><i class="fas fa-bolt"></i></span><span class="metric__label">OpenAI / Anthropic 兼容</span></div>
  </section>
  `}

  <!-- 三大梯队池展示 -->
  <section class="shell tier-section" aria-labelledby="tier-pool-title">
    <div class="section-heading">
      <div>
        <h2 id="tier-pool-title"><i class="fas fa-layer-group c-brand" style="margin-right: 8px;"></i>三大模型梯队池</h2>
        <p>提供旗舰模型池 (flagship/auto)、OpenClaw 模型池 (openclaw/auto) 与绘图专属池 (drawing/auto)，支持按席位调度并支持复制别名直接调用。</p>
      </div>
      <div class="fc" style="gap: 8px;">
        <span class="status-chip status-chip--ok"><i class="fas fa-check-circle"></i> 旗舰池: ${isLoggedIn ? `${tierConfig.tier1.models.length}/${tierConfig.tier1.maxSeats}` : '已启用'}</span>
        <span class="status-chip status-chip--ok"><i class="fas fa-paw"></i> OpenClaw池: ${isLoggedIn ? `${tierConfig.tier2.models.length}/${tierConfig.tier2.maxSeats}` : '已启用'}</span>
        <span class="status-chip status-chip--ok"><i class="fas fa-paint-brush"></i> 绘图池: ${isLoggedIn ? `${tierConfig.tier3.models.length}/${tierConfig.tier3.maxSeats}` : '已启用'}</span>
      </div>
    </div>

    <div class="tier-pools-grid">
      ${renderTierPoolSection(tierConfig.tier1, 'fas fa-crown', '旗舰池')}
      ${renderTierPoolSection(tierConfig.tier2, 'fas fa-paw', 'OpenClaw池')}
      ${renderTierPoolSection(tierConfig.tier3, 'fas fa-paint-brush', '绘图池')}
    </div>
  </section>

  <!-- 模型调用指引 -->
  <section class="shell guide-section" aria-labelledby="guide-title">
    <div class="section-heading" style="margin-block-end: var(--space-md);">
      <div>
        <h2 id="guide-title"><i class="fas fa-terminal c-brand" style="margin-right: 8px;"></i>模型调用指引</h2>
        <p>通过标准的 OpenAI / Anthropic 兼容协议快速集成到任意客户端、SDK 或应用中。</p>
      </div>
    </div>

    <div class="guide-steps">
      <div class="guide-step">
        <div class="guide-step__num">1</div>
        <h4>配置 Base URL</h4>
        <p>在客户端或 SDK 中将 Base URL 设定为：<br><code style="font-size: 12px; color: var(--color-brand); word-break: break-all;">${escapePageHtml(apiBase)}</code></p>
      </div>
      <div class="guide-step">
        <div class="guide-step__num">2</div>
        <h4>提供转发密钥 (Key)</h4>
        <p>在请求头部传入网关生成的 Bearer Token：<br><code style="font-size: 12px;">Authorization: Bearer sk-gw-xxxx</code></p>
      </div>
      <div class="guide-step">
        <div class="guide-step__num">3</div>
        <h4>指定完整模型 ID</h4>
        <p>模型名称格式为 <code>提供商ID/模型ID</code> 或 <code>梯队池别名</code>，例如：<br><code style="font-size: 12px; color: var(--color-brand);">${escapePageHtml(sampleModel)}</code></p>
      </div>
    </div>

    <div class="code-tabs">
      <button class="code-tab-btn active" data-tab="curl" type="button" onclick="switchCodeTab('curl')">cURL 示例</button>
      <button class="code-tab-btn" data-tab="python" type="button" onclick="switchCodeTab('python')">Python (OpenAI SDK)</button>
      <button class="code-tab-btn" data-tab="node" type="button" onclick="switchCodeTab('node')">Node.js / JS</button>
    </div>

    <div class="code-panel">
      <div id="tab-panel-curl">
        <pre><code><span class="syntax-command">curl</span> ${escapePageHtml(apiBase)}/chat/completions \\
  <span class="syntax-key">-H</span> <span class="syntax-string">"Content-Type: application/json"</span> \\
  <span class="syntax-key">-H</span> <span class="syntax-string">"Authorization: Bearer sk-gw-YOUR_KEY"</span> \\
  <span class="syntax-key">-d</span> <span class="syntax-string">'{
    "model": "${escapePageHtml(sampleModel)}",
    "messages": [
      { "role": "system", "content": "You are a helpful assistant." },
      { "role": "user", "content": "你好！" }
    ],
    "stream": false
  }'</span></code></pre>
      </div>
      <div id="tab-panel-python" class="hd">
        <pre><code><span class="syntax-command">from</span> openai <span class="syntax-command">import</span> OpenAI

client = OpenAI(
    base_url=<span class="syntax-string">"${escapePageHtml(apiBase)}"</span>,
    api_key=<span class="syntax-string">"sk-gw-YOUR_KEY"</span>
)

response = client.chat.completions.create(
    model=<span class="syntax-string">"${escapePageHtml(sampleModel)}"</span>,
    messages=[{<span class="syntax-string">"role"</span>: <span class="syntax-string">"user"</span>, <span class="syntax-string">"content"</span>: <span class="syntax-string">"你好！"</span>}]
)
print(response.choices[0].message.content)</code></pre>
      </div>
      <div id="tab-panel-node" class="hd">
        <pre><code><span class="syntax-command">import</span> OpenAI <span class="syntax-command">from</span> <span class="syntax-string">'openai'</span>;

<span class="syntax-command">const</span> openai = <span class="syntax-command">new</span> OpenAI({
  baseURL: <span class="syntax-string">'${escapePageHtml(apiBase)}'</span>,
  apiKey: <span class="syntax-string">'sk-gw-YOUR_KEY'</span>,
});

<span class="syntax-command">async function</span> main() {
  <span class="syntax-command">const</span> completion = <span class="syntax-command">await</span> openai.chat.completions.create({
    messages: [{ role: <span class="syntax-string">'user'</span>, content: <span class="syntax-string">'你好！'</span> }],
    model: <span class="syntax-string">'${escapePageHtml(sampleModel)}'</span>,
  });
  console.log(completion.choices[0].message.content);
}
main();</code></pre>
      </div>
    </div>
  </section>

  ${isLoggedIn ? `
  <!-- 全部启用提供商与模型索引 (已登录模式) -->
  <section class="shell directory" aria-labelledby="directory-title">
    <div class="section-heading">
      <div>
        <h2 id="directory-title">已配置模型索引</h2>
        <p>点击模型卡片即可复制完整的双段模型 ID (提供商/模型)；支持类型与健康状况的精细化多重过滤。</p>
      </div>
      <label class="search-field" for="model-search">
        <i class="fas fa-search" aria-hidden="true"></i>
        <span class="sr-only">搜索提供商或模型</span>
        <input id="model-search" type="search" placeholder="输入关键字极速过滤模型或提供商" autocomplete="off">
      </label>
    </div>

    <!-- 极客双维度筛选工具栏 -->
    <div class="filter-toolbar">
      <div class="filter-group mb-2">
        <span class="filter-label"><i class="fas fa-tags" style="color: var(--color-brand); font-size: 11px;"></i>模型类型:</span>
        <button class="filter-btn active" data-cat-filter="all" type="button">全部 <span class="count-num">(${enabledModelsCount})</span></button>
        <button class="filter-btn" data-cat-filter="text" type="button"><i class="fas fa-font"></i> 文本 <span class="count-num">(${cntText})</span></button>
        <button class="filter-btn" data-cat-filter="openclaw" type="button"><i class="fas fa-bolt"></i> OpenClaw <span class="count-num">(${cntOpenClaw})</span></button>
        <button class="filter-btn" data-cat-filter="image" type="button"><i class="fas fa-paint-brush"></i> 绘图 <span class="count-num">(${cntImage})</span></button>
        <button class="filter-btn" data-cat-filter="multimodal" type="button"><i class="fas fa-eye"></i> 多模态 <span class="count-num">(${cntMultimodal})</span></button>
        <button class="filter-btn" data-cat-filter="other" type="button"><i class="fas fa-cube"></i> 其他 <span class="count-num">(${cntOther})</span></button>
      </div>
      <div class="filter-group">
        <span class="filter-label"><i class="fas fa-heartbeat" style="color: var(--color-success-ink); font-size: 11px;"></i>健康状况:</span>
        <button class="filter-btn active" data-health-filter="all" type="button">全部 <span class="count-num">(${enabledModelsCount})</span></button>
        <button class="filter-btn" data-health-filter="healthy" type="button"><i class="fas fa-check-circle" style="color: var(--color-success-ink);"></i> 正常 <span class="count-num">(${cntHealthy})</span></button>
        <button class="filter-btn" data-health-filter="cooling" type="button"><i class="fas fa-snowflake" style="color: oklch(50% 0.12 85);"></i> 冷却 <span class="count-num">(${cntCooling})</span></button>
        <button class="filter-btn" data-health-filter="dead" type="button"><i class="fas fa-times-circle" style="color: var(--color-danger-ink);"></i> 失效 <span class="count-num">(${cntDead})</span></button>
      </div>
    </div>

    <div class="provider-index" id="provider-index">
      ${enabledProviders.length ? enabledProviders.map((provider) => {
        const models = provider.models.filter((model) => model.enabled)
        
        // 计算当前 Provider 内模型各种状态的数量
        const providerTotal = models.length
        const providerHealthy = models.filter(m => m.status !== 'dead' && !(m.status === 'cooling' || (m.cooldownUntil && m.cooldownUntil > Date.now()))).length
        const providerCooling = models.filter(m => m.status !== 'dead' && (m.status === 'cooling' || (m.cooldownUntil && m.cooldownUntil > Date.now()))).length
        const providerDead = models.filter(m => m.status === 'dead').length

        return `<article class="provider-row" data-search="${escapePageHtml(`${provider.name} ${provider.id} ${models.map((model) => model.id).join(' ')}`.toLowerCase())}">
          <div class="provider-row__header">
            <div class="provider-row__identity">
              <span class="provider-row__mark" aria-hidden="true">${escapePageHtml(provider.name.charAt(0).toUpperCase() || 'A')}</span>
              <div>
                <div class="provider-row__title-wrap">
                  <h3 style="display: inline-block; margin-right: 8px;">${escapePageHtml(provider.name)}</h3>
                  <code style="margin-right: 6px;">${escapePageHtml(provider.id)}</code>
                  <span class="protocol-chip" style="min-height: 1.25rem; font-size: 10px; padding-inline: 6px;">${(provider.apiType || 'openai') === 'anthropic' ? 'Anthropic' : 'OpenAI'} 兼容</span>
                </div>
                <div class="provider-row__stats-row">
                  <span>共 ${providerTotal} 个模型</span>
                  <span style="color: var(--color-success-ink); font-weight: 500;"><i class="fas fa-check-circle"></i> ${providerHealthy} 正常</span>
                  ${providerCooling > 0 ? `<span style="color: oklch(50% 0.12 85); font-weight: 500;"><i class="fas fa-snowflake"></i> ${providerCooling} 冷却</span>` : ''}
                  ${providerDead > 0 ? `<span style="color: var(--color-danger-ink); font-weight: 500;"><i class="fas fa-times-circle"></i> ${providerDead} 失效</span>` : ''}
                </div>
              </div>
            </div>
          </div>
          <div class="provider-row__models-grid">
            ${models.length ? models.map((model) => {
              const fullModel = `${provider.id}/${model.id}`
              const cat = model.category || detectModelCategory(model.id)
              const isDead = model.status === 'dead'
              const isCooling = !isDead && (model.status === 'cooling' || (model.cooldownUntil && model.cooldownUntil > Date.now()))
              const health = isDead ? 'dead' : (isCooling ? 'cooling' : 'healthy')
              const isOpenClaw = openclawModels.has(fullModel)
              
              // 探测延迟与真实延迟
              const key = `${provider.id}:${model.id}`
              const latStats = latenciesMap[key] || { probeLatency: null, realLatency: null }
              const probeMs = latStats.probeLatency
              const realMs = latStats.realLatency

              // 自动判定类型徽标与颜色
              let catIcon = '<i class="fas fa-font"></i>'
              let catLabel = '文本'
              let catCls = 'tag-cat--text'
              if (cat === 'image') {
                catIcon = '<i class="fas fa-paint-brush"></i>'
                catLabel = '绘图'
                catCls = 'tag-cat--image'
              } else if (cat === 'multimodal') {
                catIcon = '<i class="fas fa-eye"></i>'
                catLabel = '多模态'
                catCls = 'tag-cat--multimodal'
              } else if (cat === 'other') {
                catIcon = '<i class="fas fa-cube"></i>'
                catLabel = '其他'
                catCls = 'tag-cat--other'
              }

              // 健康状态徽标
              let healthBadge = `<span class="tag-health tag-health--ok"><i class="fas fa-check-circle"></i>正常</span>`
              if (isDead) {
                healthBadge = `<span class="tag-health tag-health--err"><i class="fas fa-times-circle"></i>失效</span>`
              } else if (isCooling) {
                healthBadge = `<span class="tag-health tag-health--warn"><i class="fas fa-snowflake"></i>冷却</span>`
              }

              // OpenClaw 徽章
              const clawBadge = isOpenClaw 
                ? `<span class="tag-claw tag-claw--yes"><i class="fas fa-bolt"></i>OpenClaw</span>`
                : `<span class="tag-claw tag-claw--no"><i class="fas fa-ban"></i>非OpenClaw</span>`

              // 延迟指标
              const displayMs = realMs || probeMs
              const latencyBadge = displayMs
                ? `<span class="tag-latency" title="探测延迟: ${probeMs ? `${probeMs}ms` : '暂无'} | 真实调用延迟: ${realMs ? `${realMs}ms` : '暂无'}"><i class="fas fa-signal"></i> ${displayMs}ms</span>`
                : ''

              return `<div class="model-grid-item copy-control" data-copy="${escapePageHtml(fullModel)}" data-cat="${cat}" data-claw="${isOpenClaw ? 'true' : 'false'}" data-health="${health}">
                <div class="model-grid-item__header">
                  <span class="model-grid-item__name">${escapePageHtml(model.id)}</span>
                  <button class="copy-btn" type="button" aria-label="复制模型名"><i class="far fa-copy"></i></button>
                </div>
                <div class="model-grid-item__badges">
                  <span class="tag-cat ${catCls}">${catIcon} ${catLabel}</span>
                  ${clawBadge}
                  ${healthBadge}
                  ${latencyBadge}
                </div>
              </div>`
            }).join('') : '<span class="empty-inline">暂无启用模型</span>'}
          </div>
        </article>`
      }).join('') : `<div class="empty-state"><i class="fas fa-cubes" aria-hidden="true"></i><h3>尚无可用模型</h3><p>管理员启用提供商和模型后，它们会出现在这里。</p><a class="btn btn-p" href="/admin">前往管理控制台</a></div>`}
    </div>
    <div id="search-empty" class="empty-state hd"><i class="fas fa-search" aria-hidden="true"></i><h3>没有匹配结果</h3><p>请尝试选择不同的过滤标签或输入更简短的关键词。</p></div>
  </section>
  ` : `
  <!-- 节点受保护隐蔽模式 (未登录) -->
  <section class="shell directory" aria-labelledby="directory-title">
    <div class="section-heading">
      <div>
        <h2 id="directory-title"><i class="fas fa-user-lock c-brand" style="margin-right: 8px;"></i>已配置模型索引</h2>
        <p>节点信息受保护：仅限授权管理员登录后查看完整节点与底层模型配置。</p>
      </div>
    </div>

    <div class="empty-state" style="padding: 44px 20px; background: var(--color-paper-2); border: 1px dashed var(--color-rule-2); border-radius: var(--radius-panel); text-align: center;">
      <i class="fas fa-shield-alt" style="font-size: 40px; color: var(--color-brand); margin-bottom: 14px; display: block;" aria-hidden="true"></i>
      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 8px;">节点与模型保护已生效</h3>
      <p style="max-width: 500px; margin: 0 auto 20px; color: var(--color-muted); font-size: 13px; line-height: 1.6;">
        当前网关上游提供商节点及敏感模型清单已被隐私保护。若您是管理员，请登录管理控制台进行查看、操作与路由调优。
      </p>
      <a class="btn btn-p" href="/admin/login" style="padding: 10px 24px; font-size: 14px; display: inline-flex; align-items: center; gap: 8px;">
        <i class="fas fa-sign-in-alt" aria-hidden="true"></i>
        <span>登录管理员控制台解锁</span>
      </a>
    </div>
  </section>
  `}
</main>

${renderSiteFooter(SITE_CONFIG.title)}

<script>
(function () {
  // 代码示例切换函数
  window.switchCodeTab = function (tab) {
    document.querySelectorAll('.code-tab-btn').forEach(function (b) { b.classList.remove('active') })
    document.querySelectorAll('.code-panel > div').forEach(function (p) { p.classList.add('hd') })
    var activeBtn = document.querySelector('.code-tab-btn[data-tab="' + tab + '"]')
    if (activeBtn) activeBtn.classList.add('active')
    var target = document.getElementById('tab-panel-' + tab)
    if (target) target.classList.remove('hd')
  }

  var status = document.getElementById('copy-status')
  document.querySelectorAll('.copy-control').forEach(function (button) {
    button.addEventListener('click', async function () {
      var text = button.getAttribute('data-copy') || ''
      var icon = button.querySelector('.copy-btn i, i')
      var label = button.querySelector('span')
      try {
        await navigator.clipboard.writeText(text)
        button.setAttribute('data-state', 'success')
        var originalIconCls = icon ? icon.className : ''
        if (icon) icon.className = 'fas fa-check c-s'
        if (label) label.textContent = '已复制'
        if (status) status.textContent = '已复制 ' + text
        window.setTimeout(function () {
          button.removeAttribute('data-state')
          if (icon) icon.className = originalIconCls || 'far fa-copy'
          if (label) label.textContent = '复制调用名'
        }, 1800)
      } catch (error) {
        button.setAttribute('data-state', 'error')
        if (status) status.textContent = '复制失败，请手动选择文本。'
      }
    })
  })

  var search = document.getElementById('model-search')
  var rows = Array.from(document.querySelectorAll('.provider-row'))
  var empty = document.getElementById('search-empty')

  var currentCat = 'all'
  var currentHealth = 'all'

  function applyFilters() {
    var query = search ? search.value.trim().toLowerCase() : ''
    var visibleProviders = 0

    rows.forEach(function (row) {
      var modelCards = Array.from(row.querySelectorAll('.model-grid-item'))
      var visibleModelsInRow = 0

      modelCards.forEach(function (card) {
        var cardCat = card.getAttribute('data-cat') || ''
        var cardClaw = card.getAttribute('data-claw') === 'true'
        var cardHealth = card.getAttribute('data-health') || ''
        var cardCopy = (card.getAttribute('data-copy') || '').toLowerCase()

        // 搜索过滤：提供商信息或模型ID匹配
        var matchSearch = !query || cardCopy.includes(query) || (row.getAttribute('data-search') || '').includes(query)

        // 分类过滤
        var matchCat = true
        if (currentCat !== 'all') {
          if (currentCat === 'openclaw') {
            matchCat = cardClaw
          } else {
            matchCat = (cardCat === currentCat)
          }
        }

        // 健康状况过滤
        var matchHealth = (currentHealth === 'all') || (cardHealth === currentHealth)

        var isVisible = matchSearch && matchCat && matchHealth
        card.classList.toggle('hd', !isVisible)
        if (isVisible) {
          visibleModelsInRow++
        }
      })

      // 如果没有任何符合过滤条件的项目，则隐藏提供商卡片
      var hasMatchedModels = visibleModelsInRow > 0
      row.classList.toggle('hd', !hasMatchedModels)
      if (hasMatchedModels) {
        visibleProviders++
      }
    })

    if (empty) {
      empty.classList.toggle('hd', visibleProviders > 0)
    }
  }

  // 绑定过滤按钮事件
  document.querySelectorAll('[data-cat-filter]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      btn.parentElement.querySelectorAll('[data-cat-filter]').forEach(function (b) { b.classList.remove('active') })
      btn.classList.add('active')
      currentCat = btn.getAttribute('data-cat-filter') || 'all'
      applyFilters()
    })
  })

  document.querySelectorAll('[data-health-filter]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      btn.parentElement.querySelectorAll('[data-health-filter]').forEach(function (b) { b.classList.remove('active') })
      btn.classList.add('active')
      currentHealth = btn.getAttribute('data-health-filter') || 'all'
      applyFilters()
    })
  })

  if (search) {
    search.addEventListener('input', applyFilters)
  }
})()
</script>
</body></html>`)
}

// ===== 登录页 =====

export async function renderLoginPage(c: Context<{ Bindings: Env }>) {
  return c.html(`<!DOCTYPE html><html lang="zh-CN">
${H('登录')}
<body class="site-page auth-page">
<header class="topbar topbar--auth">
  <div class="shell topbar__inner">
    <a class="brand" href="/" aria-label="AI Gateway 首页">
      <span class="brand__mark" aria-hidden="true"><i class="fas fa-cloud"></i></span>
      <span class="brand__name">${SITE_CONFIG.title}</span>
    </a>
    <a href="/" class="btn btn-gh"><i class="fas fa-arrow-left" aria-hidden="true"></i>返回首页</a>
  </div>
</header>

<main class="auth-shell">
  <section class="auth-context" aria-labelledby="auth-context-title">
    <p class="eyebrow"><span aria-hidden="true"></span>CONTROL PLANE ACCESS</p>
    <h1 id="auth-context-title">管理提供商、模型和转发密钥。</h1>
  </section>

  <section class="auth-form-wrap" aria-labelledby="login-title">
    <form class="auth-form" id="login-form" novalidate>
      <div class="auth-form__heading">
        <span class="auth-form__icon" aria-hidden="true"><i class="fas fa-lock"></i></span>
        <div><h2 id="login-title">管理员登录</h2><p>使用部署时配置的账号继续。</p></div>
      </div>

      <div id="er" class="al al-e hd" role="alert" aria-live="assertive">
        <i class="fas fa-exclamation-circle" aria-hidden="true"></i><span id="em"></span>
      </div>

      <div class="fg">
        <label for="u">用户名</label>
        <div class="input-wrap"><i class="far fa-user" aria-hidden="true"></i><input type="text" id="u" name="username" placeholder="admin" autocomplete="username" aria-required="true" aria-describedby="login-helper"></div>
      </div>
      <div class="fg">
        <label for="p">密码</label>
        <div class="input-wrap"><i class="fas fa-key" aria-hidden="true"></i><input type="password" id="p" name="password" placeholder="部署环境变量中的密码" autocomplete="current-password" aria-required="true" aria-describedby="login-helper"><button class="password-toggle" id="password-toggle" type="button" aria-label="显示密码"><i class="far fa-eye" aria-hidden="true"></i></button></div>
      </div>
      <p id="login-helper" class="form-helper">登录成功后将进入管理控制台。</p>
      <button class="btn btn-p btn-submit" id="login-button" type="submit"><span class="button-label"><i class="fas fa-sign-in-alt" aria-hidden="true"></i>登录管理控制台</span><span class="button-loading"><i class="fas fa-circle-notch fa-spin" aria-hidden="true"></i>正在验证</span></button>
    </form>
  </section>
</main>

<script>
(function () {
  var form = document.getElementById('login-form')
  var username = document.getElementById('u')
  var password = document.getElementById('p')
  var errorBox = document.getElementById('er')
  var errorMessage = document.getElementById('em')
  var submit = document.getElementById('login-button')
  var toggle = document.getElementById('password-toggle')

  function showError(message) {
    errorMessage.textContent = message
    errorBox.classList.remove('hd')
    username.setAttribute('aria-invalid', 'true')
    password.setAttribute('aria-invalid', 'true')
  }
  function clearError() {
    errorBox.classList.add('hd')
    username.removeAttribute('aria-invalid')
    password.removeAttribute('aria-invalid')
  }

  toggle.addEventListener('click', function () {
    var show = password.type === 'password'
    password.type = show ? 'text' : 'password'
    toggle.setAttribute('aria-label', show ? '隐藏密码' : '显示密码')
    toggle.querySelector('i').className = show ? 'far fa-eye-slash' : 'far fa-eye'
    password.focus({ preventScroll: true })
  })

  form.addEventListener('submit', async function (event) {
    event.preventDefault()
    clearError()
    var u = username.value.trim()
    var p = password.value
    if (!u || !p) {
      showError('请填写用户名和密码后再登录。')
      ;(!u ? username : password).focus()
      return
    }
    submit.disabled = true
    submit.setAttribute('data-state', 'loading')
    try {
      var response = await fetch('/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: u, password: p })
      })
      var data = await response.json()
      if (data.success) {
        submit.setAttribute('data-state', 'success')
        // 若服务端返回了 sessionId，保存至 sessionStorage 并携带参数跳转
        if (data.sessionId) {
          try { sessionStorage.setItem('session_id', data.sessionId) } catch (e) {}
          window.location.href = '/admin?session_id=' + encodeURIComponent(data.sessionId)
        } else {
          window.location.href = '/admin'
        }
        return
      }
      showError(data.message || '登录失败，请检查账号配置。')
    } catch (error) {
      showError('无法连接服务，请检查网络后重试。')
    }
    submit.disabled = false
    submit.removeAttribute('data-state')
  })
})()
</script>
</body></html>`)
}

// ===== 管理后台 =====

export async function renderAdminPage(c: Context<{ Bindings: Env }>) {
  const [providers, proxyKeys, tierConfig, customRoutes] = await Promise.all([
    getProviders(c.env),
    getProxyKeys(c.env),
    getTierConfig(c.env),
    getCustomRoutes(c.env),
  ])
  // 顺风车并行拉取三大梯队当前在席模型的双延迟数据，准备同步至管理界面
  const latenciesMap = await getTierModelLatencies(c.env, tierConfig)
  const enabledProvidersCount = providers.filter((provider) => provider.enabled).length
  const modelsCount = providers.reduce((total, provider) => total + provider.models.length, 0)
  const enabledModelsCount = providers.reduce((total, provider) => total + provider.models.filter((model) => model.enabled).length, 0)
  const enabledProxyKeysCount = proxyKeys.filter((key) => key.enabled).length

  return c.html(`<!DOCTYPE html><html lang="zh-CN">
${H('管理')}
<body class="site-page admin-page">
<div class="admin-shell">
  <aside class="admin-rail" aria-label="控制台导航">
    <a class="brand admin-rail__brand" href="/">
      <span class="brand__mark" aria-hidden="true"><i class="fas fa-cloud"></i></span>
      <span><strong>${SITE_CONFIG.title}</strong><small>CONTROL PLANE</small></span>
    </a>
    <nav class="admin-nav">
      <a class="admin-nav__link is-active" href="#overview"><i class="fas fa-chart-pie" aria-hidden="true"></i><span>概览</span></a>
      <a class="admin-nav__link" href="#providers"><i class="fas fa-server" aria-hidden="true"></i><span>提供商</span><b>${providers.length}</b></a>
      <a class="admin-nav__link" href="#tier-pools"><i class="fas fa-layer-group" aria-hidden="true"></i><span>三大梯队池</span><b>3</b></a>
      <a class="admin-nav__link" href="#custom-routes"><i class="fas fa-route" aria-hidden="true"></i><span>自定义路由</span><b>${customRoutes.length}</b></a>
      <a class="admin-nav__link" href="#proxy-keys"><i class="fas fa-key" aria-hidden="true"></i><span>转发 Key</span><b>${proxyKeys.length}</b></a>
      <a class="admin-nav__link" href="#system-logs"><i class="fas fa-file-alt" aria-hidden="true"></i><span>日志与调试</span></a>
    </nav>
    <div class="admin-rail__save">
      <button id="batchSaveBtn" class="btn btn-p" style="width: 100%; justify-content: center; font-weight: 600;" onclick="triggerBatchSave()">
        <i class="fas fa-save" aria-hidden="true"></i><span>统一保存</span>
        <span id="unsavedBadge" class="bd bd-warn" style="display:none; margin-left: 6px;">未保存</span>
      </button>
    </div>
    <div class="admin-rail__foot">
      <a href="/" class="admin-nav__link"><i class="fas fa-arrow-left" aria-hidden="true"></i><span>返回首页</span></a>
      <a href="/admin/logout" class="admin-nav__link"><i class="fas fa-sign-out-alt" aria-hidden="true"></i><span>退出登录</span></a>
    </div>
  </aside>

  <div class="admin-main">
    <header class="admin-topbar">
      <a class="brand" href="/"><span class="brand__mark" aria-hidden="true"><i class="fas fa-cloud"></i></span><span class="brand__name">${SITE_CONFIG.title}</span></a>
      <nav aria-label="移动端控制台导航">
        <a href="#overview">概览</a>
        <a href="#providers">提供商</a>
        <a href="#tier-pools">梯队池</a>
        <a href="#proxy-keys">Key</a>
        <a href="#system-logs">日志</a>
      </nav>
      <div style="display: flex; align-items: center; gap: 8px;">
        <button id="mobileBatchSaveBtn" class="btn btn-p" style="padding: 6px 10px; font-size: 13px;" onclick="triggerBatchSave()" title="统一保存至 KV"><i class="fas fa-save"></i><span id="mobileUnsavedBadge" style="display:none; margin-left: 3px;">(0)</span></button>
        <a class="icon-btn" href="/admin/logout" aria-label="退出登录"><i class="fas fa-sign-out-alt" aria-hidden="true"></i></a>
      </div>
    </header>

    <main class="admin-content">
      <div id="toast" class="hd toast" role="status" aria-live="polite"></div>

      <section id="overview" class="admin-overview" aria-labelledby="admin-title">
        <div class="admin-heading">
          <div><p class="eyebrow"><span aria-hidden="true"></span>GATEWAY STATUS</p><h1 id="admin-title">管理控制台</h1><p>配置提供商、模型与客户端访问凭据。变更将写入 Cloudflare KV。</p></div>
          <div class="admin-heading__actions"><a href="/" class="btn btn-s"><i class="fas fa-external-link-alt" aria-hidden="true"></i>查看模型列表</a></div>
        </div>
        <div class="admin-metrics" aria-label="配置统计">
          <div><span>${providers.length}</span><p>提供商</p><small>${enabledProvidersCount} 个已启用</small></div>
          <div><span>${modelsCount}</span><p>模型</p><small>${enabledModelsCount} 个可用</small></div>
          <div><span>${proxyKeys.length}</span><p>转发 Key</p><small>${enabledProxyKeysCount} 个可用</small></div>
          <div><span class="status-dot status-dot--online"><i aria-hidden="true"></i>已配置</span><p>存储</p><small>Cloudflare KV</small></div>
        </div>
      </section>

      <section id="providers" class="workspace-section" aria-labelledby="providers-title">
        <div class="section-heading section-heading--admin">
          <div><h2 id="providers-title">提供商</h2><p>管理上游地址、协议、API Key 和模型。</p></div>
          <div class="fc" style="gap: 8px;">
            <button class="btn btn-s" type="button" onclick="resetCoolingModels()" title="清除所有处于冷却中模型的冷却状态，但不重置失败计数器"><i class="fas fa-snowflake" aria-hidden="true"></i>一键重置冷却模型</button>
            <button class="btn btn-p" type="button" onclick="showAdd()"><i class="fas fa-plus" aria-hidden="true"></i>添加提供商</button>
          </div>
        </div>

        <div class="af-w">
          <div id="af" class="hd add-form-panel">
            <div class="panel-heading"><div><span class="panel-heading__mark"><i class="fas fa-plus" aria-hidden="true"></i></span><div><h3>添加新提供商</h3><p>先配置基本信息与 API Key，再通过一键拉取或导入模型进行快速指派。</p></div></div><button class="icon-btn" type="button" onclick="hideAdd()" aria-label="关闭添加表单"><i class="fas fa-times" aria-hidden="true"></i></button></div>
            
            <div class="grid-2-gap6" style="margin-bottom: var(--space-md);">
              <!-- 左侧一列：基础配置与 Key 列表 -->
              <div>
            <div class="fr">
              <div class="fg"><label for="anm">名称</label><input type="text" id="anm" placeholder="DeepSeek"></div>
              <div class="fg"><label for="aid">提供商 ID</label><input type="text" id="aid" placeholder="deepseek"><span class="form-helper">用于模型前缀，创建后不可修改。</span></div>
            </div>
            <div class="fr" style="gap: 12px; margin-bottom: var(--space-sm);">
              <div class="fg" style="margin: 0; flex: 2;"><label for="aurl">API 地址</label><input type="url" id="aurl" placeholder="https://api.deepseek.com"></div>
              <div class="fg" style="margin: 0; flex: 1;"><label for="afmt">API 格式</label><select id="afmt" class="select-sm" style="height: 40px;"><option value="openai">OpenAI 兼容</option><option value="anthropic">Anthropic 兼容</option></select></div>
            </div>
            <fieldset class="form-group"><legend>上游 API Keys</legend><div id="akeys"><div class="fc mb-4 field-row"><input type="text" placeholder="sk-xxx" class="fx1 aki" aria-label="上游 API Key"><label class="tg" title="启用 Key"><input type="checkbox" checked class="ake" aria-label="启用 Key"><span class="sl"></span></label><button class="icon-btn" onclick="copyRowVal(this)" title="复制 Key" aria-label="复制 Key"><i class="far fa-copy" aria-hidden="true"></i></button><button class="icon-btn" onclick="testNewAKey(this)" title="测试 Key" aria-label="测试 Key"><i class="fas fa-plug" aria-hidden="true"></i></button><button class="icon-btn" onclick="this.parentElement.remove()" title="移除 Key" aria-label="移除 Key"><i class="fas fa-times" aria-hidden="true"></i></button></div></div><button class="btn btn-s" onclick="addAKeyRow()"><i class="fas fa-plus" aria-hidden="true"></i>添加 Key</button></fieldset>
              </div>

              <!-- 右侧一列：智能拉取与模型清单 -->
              <div>
            <aside id="amc" class="hd mdl-list-panel"><div class="panel-heading"><div><span class="panel-heading__mark"><i class="fas fa-cube" aria-hidden="true"></i></span><div><h3>可用模型</h3><p>点击“+”添加到配置。</p></div></div><button class="icon-btn" type="button" onclick="hideMdlPanel('amc')" title="关闭可用模型" aria-label="关闭可用模型"><i class="fas fa-times" aria-hidden="true"></i></button></div><div id="amcl"></div></aside>
            <fieldset class="form-group">
              <div class="fc justify-between mb-2" style="flex-wrap: wrap; gap: 8px;">
                <legend style="margin-bottom: 0;">模型列表</legend>
                <div class="fc" style="gap: 6px;">
                  <button type="button" class="btn btn-s btn-sm" onclick="fetchUpstreamModelsForAdd()" title="向端点请求并自动一键添加所有拉取的可用模型"><i class="fas fa-download"></i>一键添加拉取的模型</button>
                  <button type="button" class="btn btn-s btn-sm" onclick="openBatchImportForAdd()" title="批量输入多行模型 ID"><i class="fas fa-file-import"></i>一键批量粘贴</button>
                  <button type="button" class="btn btn-d btn-sm" onclick="clearAllModelsForAdd()" title="清空全部模型"><i class="fas fa-trash"></i>一键删除所有模型</button>
                </div>
              </div>
              <div id="amodels">
                <div class="fc mb-4 field-row">
                  <input type="text" placeholder="deepseek-chat" class="fx1 ami" aria-label="模型 ID">
                  <select class="select-sm amcat" style="width: 82px;" title="模型分类">
                    <option value="auto">自动识别</option>
                    <option value="text">文本</option>
                    <option value="image">绘图</option>
                    <option value="multimodal">多模态</option>
                    <option value="other">其他</option>
                  </select>
                  <label class="tg" title="启用模型"><input type="checkbox" checked class="ame" aria-label="启用模型"><span class="sl"></span></label>
                  <button class="icon-btn" onclick="copyRowVal(this)" title="复制模型 ID" aria-label="复制模型 ID"><i class="far fa-copy"></i></button>
                  <button class="icon-btn" onclick="testNewMdl(this)" title="测试模型" aria-label="测试模型"><i class="fas fa-plug"></i></button>
                  <button class="icon-btn" onclick="this.parentElement.remove()" title="移除模型" aria-label="移除模型"><i class="fas fa-times"></i></button>
                </div>
              </div>
              <div class="fc mt-1 field-row">
                <input type="text" id="anew-mid" placeholder="新的模型 ID" class="fx1">
                <select id="anew-mcat" class="select-sm" style="width: 82px;" title="新模型分类">
                  <option value="auto">自动分类</option>
                  <option value="text">文本</option>
                  <option value="image">绘图</option>
                  <option value="multimodal">多模态</option>
                  <option value="other">其他</option>
                </select>
                <button class="btn btn-s" type="button" onclick="addMdlRow()"><i class="fas fa-plus"></i>添加模型</button>
              </div>
            </fieldset>
              </div> <!-- 闭合右侧列 -->
            </div> <!-- 闭合 grid-2-gap6 容器 -->
            <div class="panel-actions"><label class="switch-label"><span>创建后立即启用</span><span class="tg"><input type="checkbox" checked id="aen"><span class="sl"></span></span></label><div><button class="btn btn-s" onclick="hideAdd()">取消</button><button class="btn btn-p" onclick="stageNewProv()"><i class="fas fa-plus" aria-hidden="true"></i>暂存提供商</button></div></div>
            <div id="atestR" class="mt-1" aria-live="polite"></div>
          </div>
        </div>

        <div class="gp provider-list" id="plist">
          ${providers.length ? providers.map(p=>`
          <article class="pi" data-id="${escapePageHtml(p.id)}">
            <div class="ps" onclick="tog('${p.id}')" role="button" tabindex="0" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();tog('${p.id}')}" aria-controls="dt-${escapePageHtml(p.id)}">
              <div class="l"><i class="fas fa-chevron-right provider-chevron" aria-hidden="true" id="ch-${escapePageHtml(p.id)}"></i><span class="provider-avatar" aria-hidden="true">${escapePageHtml(p.name.charAt(0).toUpperCase() || 'A')}</span><div><h3>${escapePageHtml(p.name)}</h3><div class="pu"><code>${escapePageHtml(p.id)}</code><span>${(p.apiType||'openai')==='anthropic'?'Anthropic':'OpenAI'}</span><span>${p.apiKeys.length} Keys</span><span>${p.models.length} 模型</span></div></div></div>
              <div class="fc fx-s0" onclick="event.stopPropagation()"><label class="tg"><input type="checkbox" ${p.enabled?'checked':''} id="en-${escapePageHtml(p.id)}" onchange="togglePb('${p.id}',this.checked)" aria-label="启用 ${escapePageHtml(p.name)}"><span class="sl"></span></label><span class="bd ${p.enabled?'bd-on':'bd-off'}">${p.enabled?'已启用':'未启用'}</span></div>
            </div>
            <div class="pd" id="dt-${escapePageHtml(p.id)}">
              <div class="detail-heading"><div><h3>编辑 ${escapePageHtml(p.name)}</h3><p>暂存修改后，点击左侧统一保存即可生效。</p></div><span class="protocol-chip">${(p.apiType||'openai')==='anthropic'?'ANTHROPIC':'OPENAI'}</span></div>
              <div class="fr"><div class="fg"><label>名称</label><input type="text" id="nm-${escapePageHtml(p.id)}" value="${escapePageHtml(p.name)}" oninput="markUnsaved()"></div><div class="fg"><label>ID</label><input type="text" value="${escapePageHtml(p.id)}" disabled></div></div>
              <div class="fg"><label>API 地址</label><input type="url" id="url-${escapePageHtml(p.id)}" value="${escapePageHtml(p.baseUrl)}" oninput="markUnsaved()"></div>
              <div class="fg"><label>API 格式</label><select id="at-${escapePageHtml(p.id)}" class="select-sm" onchange="markUnsaved()"><option value="openai" ${(p.apiType||'openai')==='openai'?'selected':''}>OpenAI 兼容</option><option value="anthropic" ${p.apiType==='anthropic'?'selected':''}>Anthropic 兼容</option></select></div>
              <fieldset class="form-group"><legend>上游 API Keys</legend><div id="keys-${escapePageHtml(p.id)}">${p.apiKeys.map((k, ki)=>`<div class="fc mb-3 field-row" data-kidx="${ki}"><input type="text" value="${escapePageHtml(k.key)}" class="fx1" id="k-${escapePageHtml(p.id)}-${ki}" placeholder="API Key" aria-label="API Key" oninput="markUnsaved()"><label class="tg"><input type="checkbox" ${k.enabled?'checked':''} id="ken-${escapePageHtml(p.id)}-${ki}" aria-label="启用 Key" onchange="markUnsaved()"><span class="sl"></span></label><button class="icon-btn" onclick="copyRowVal(this)" title="复制 Key" aria-label="复制 Key"><i class="far fa-copy" aria-hidden="true"></i></button><button class="icon-btn" onclick="testKeyRow('${p.id}',${ki})" title="测试 Key" aria-label="测试 Key"><i class="fas fa-plug" aria-hidden="true"></i></button><button class="icon-btn" onclick="rmKeyRow('${p.id}',${ki})" title="移除 Key" aria-label="移除 Key"><i class="fas fa-times" aria-hidden="true"></i></button></div>`).join('')}</div><div class="fc mt-1 field-row"><input type="text" id="nk-${escapePageHtml(p.id)}" placeholder="新的 API Key" class="fx1"><button class="btn btn-s" onclick="addKeyRow('${p.id}')"><i class="fas fa-plus" aria-hidden="true"></i>添加</button></div></fieldset>
              <fieldset class="form-group">
                <div class="fc justify-between mb-2" style="flex-wrap: wrap; gap: 8px;">
                  <legend style="margin-bottom: 0;">模型列表 (${p.models.length})</legend>
                  <div class="fc" style="gap: 6px;">
                    <button type="button" class="btn btn-s btn-sm" onclick="fetchUpstreamModelsForEdit('${p.id}')" title="向端点请求并自动一键添加所有拉取的可用模型"><i class="fas fa-download"></i>一键添加拉取的模型</button>
                    <button type="button" class="btn btn-s btn-sm" onclick="openBatchImportForEdit('${p.id}')" title="批量输入多行模型 ID"><i class="fas fa-file-import"></i>一键批量粘贴</button>
                    <button type="button" class="btn btn-d btn-sm" onclick="clearAllModelsForEdit('${p.id}')" title="清空该提供商下的所有模型"><i class="fas fa-trash"></i>一键删除所有模型</button>
                  </div>
                </div>
                <div id="ml-${escapePageHtml(p.id)}">${p.models.map((m,mi)=>{
                  const cat = m.category || detectModelCategory(m.id)
                  const isDead = m.status === 'dead'
                  const isCooling = !isDead && (m.status === 'cooling' || (m.cooldownUntil && m.cooldownUntil > Date.now()))
                  let statusBadge = `<span class="status-chip status-chip--ok" id="mstatus-${escapePageHtml(p.id)}-${mi}" title="运行正常">正常</span>`
                  if (isDead) {
                    statusBadge = `<span class="status-chip status-chip--err" id="mstatus-${escapePageHtml(p.id)}-${mi}" title="连续失败已熔断">永久失效</span>`
                  } else if (isCooling) {
                    statusBadge = `<span class="status-chip status-chip--warn" id="mstatus-${escapePageHtml(p.id)}-${mi}" title="冷却中">冷却中</span>`
                  }

                  return `<div class="fc mb-3 field-row" data-idx="${mi}">
                    <input type="text" value="${escapePageHtml(m.id)}" class="fx1" id="mid-${escapePageHtml(p.id)}-${mi}" placeholder="模型 ID" oninput="markUnsaved()">
                    <select class="select-sm" id="mcat-${escapePageHtml(p.id)}-${mi}" onchange="changeModelCategory('${p.id}','${m.id}',this.value,${mi})" style="width: 82px;" title="模型分类（手动优先）">
                      <option value="text" ${cat==='text'?'selected':''}>文本</option>
                      <option value="image" ${cat==='image'?'selected':''}>绘图</option>
                      <option value="multimodal" ${cat==='multimodal'?'selected':''}>多模态</option>
                      <option value="other" ${cat==='other'?'selected':''}>其他</option>
                    </select>
                    ${statusBadge}
                    <button class="btn btn-s btn-sm" id="munblock-${escapePageHtml(p.id)}-${mi}" style="${isDead?'':'display:none;'}" onclick="unblockModel('${p.id}','${m.id}',${mi})" title="解封此模型，清零失败计数器并恢复正常"><i class="fas fa-unlock"></i>解封</button>
                    <label class="tg"><input type="checkbox" ${m.enabled?'checked':''} id="men-${escapePageHtml(p.id)}-${mi}" aria-label="启用模型" onchange="markUnsaved()"><span class="sl"></span></label>
                    <button class="icon-btn" onclick="copyRowVal(this)" title="复制模型 ID" aria-label="复制模型 ID"><i class="far fa-copy" aria-hidden="true"></i></button>
                    <button class="icon-btn" onclick="testMdl('${p.id}','${m.id}',${mi})" title="测试模型" aria-label="测试模型"><i class="fas fa-plug" aria-hidden="true"></i></button>
                    <button class="icon-btn" onclick="rmMdl('${p.id}',${mi})" title="移除模型" aria-label="移除模型"><i class="fas fa-times" aria-hidden="true"></i></button>
                  </div>`
                }).join('')}</div>
                <div class="fc mt-1 field-row">
                  <input type="text" id="nmid-${escapePageHtml(p.id)}" placeholder="新的模型 ID" class="fx1">
                  <select id="nmcat-${escapePageHtml(p.id)}" class="select-sm" style="width: 82px;" title="新模型分类">
                    <option value="auto">自动分类</option>
                    <option value="text">文本</option>
                    <option value="image">绘图</option>
                    <option value="multimodal">多模态</option>
                    <option value="other">其他</option>
                  </select>
                  <button class="btn btn-s" onclick="addMdl('${p.id}')"><i class="fas fa-plus" aria-hidden="true"></i>添加</button>
                </div>
              </fieldset>
              <div class="detail-actions"><div id="tr-${escapePageHtml(p.id)}" aria-live="polite"></div><div>${p.id === 'opencode' ? '<button class="btn btn-s" onclick="fetchEditModels(\'' + p.id + '\')"><i class="fas fa-download" aria-hidden="true"></i>获取模型</button>' : ''}<button class="btn btn-d" onclick="del('${p.id}')"><i class="fas fa-trash" aria-hidden="true"></i>删除</button><button class="btn btn-p" onclick="stageProvChanges('${p.id}')"><i class="fas fa-check" aria-hidden="true"></i>暂存修改</button></div></div>
            </div>
          </article>`).join('') : `<div class="empty-state"><i class="fas fa-server" aria-hidden="true"></i><h3>还没有提供商</h3><p>添加第一个上游提供商，配置 API 地址、Key 和模型。</p><button class="btn btn-p" onclick="showAdd()">添加提供商</button></div>`}
        </div>
      </section>

      <section id="tier-pools" class="workspace-section" aria-labelledby="tier-pools-title">
        <div class="section-heading section-heading--admin">
          <div>
            <h2 id="tier-pools-title">三大梯队池管理</h2>
            <p>管理旗舰模型池 (flagship/auto)、OpenClaw 模型池 (openclaw/auto) 和绘图专属池 (drawing/auto)。默认所有模型不入池；修改席位数缩小自动移出多余模型（不触发冷却探测）；所有改动暂存内存，点击统一保存写入 KV。</p>
          </div>
        </div>

        <div id="tierPoolsContainer" class="tier-pools-grid">
          <!-- 动态由 renderTierPools() 渲染 -->
        </div>
      </section>

      <section id="proxy-keys" class="workspace-section" aria-labelledby="proxy-keys-title">
        <div class="section-heading section-heading--admin"><div><h2 id="proxy-keys-title">转发 Key</h2><p>客户端使用这些 Key 访问统一的 <code>/v1</code> 接口。</p></div><button class="btn btn-p" onclick="genKey()"><i class="fas fa-plus" aria-hidden="true"></i>生成转发 Key</button></div>
        <div class="key-list">
          ${proxyKeys.length===0?'<div class="empty-state"><i class="fas fa-key" aria-hidden="true"></i><h3>暂无转发 Key</h3><p>生成一个 Key 后，客户端才能访问网关。</p><button class="btn btn-p" onclick="genKey()">生成转发 Key</button></div>':''}
          ${proxyKeys.map(k=>`<article class="ki" data-id="${escapePageHtml(k.id)}"><div class="key-main"><span class="key-icon" aria-hidden="true"><i class="fas fa-key"></i></span><div><div class="kv"><span id="kv-${escapePageHtml(k.id)}" data-full="${escapePageHtml(k.key)}" data-vis="0">${escapePageHtml(k.key.length>12?k.key.substring(0,8)+'*****'+k.key.substring(k.key.length-4):k.key)}</span><button class="icon-btn" onclick="toggleKeyVis('${k.id}')" title="显示或隐藏" aria-label="显示或隐藏 Key"><i class="far fa-eye" aria-hidden="true"></i></button><button class="icon-btn" onclick='copyText("${escapePageHtml(k.key)}",this)' title="复制" aria-label="复制 Key"><i class="far fa-copy" aria-hidden="true"></i></button></div><div class="key-meta"><h3>${escapePageHtml(k.name)}</h3><span class="key-meta__sep" aria-hidden="true">-</span><p>创建于 ${new Date(k.createdAt).toLocaleDateString()} · ${k.expiresAt?'有效至 '+new Date(k.expiresAt).toLocaleDateString():'永久有效'}</p></div></div></div><div class="key-actions"><label class="tg"><input type="checkbox" ${k.enabled?'checked':''} onchange="toggleProxyKey('${k.id}',this.checked)" aria-label="启用 ${escapePageHtml(k.name)}"><span class="sl"></span></label><span class="bd ${k.enabled?'bd-on':'bd-off'}">${k.enabled?'已启用':'已禁用'}</span><button class="bd bd-del" onclick="rmKey('${k.id}')"><i class="fas fa-trash" aria-hidden="true"></i>删除</button></div></article>`).join('')}
        </div>
      </section>

      <section id="custom-routes" class="workspace-section" aria-labelledby="custom-routes-title">
        <div class="section-heading section-heading--admin">
          <div>
            <h2 id="custom-routes-title"><i class="fas fa-route c-brand" style="margin-right: 8px;"></i>指定自定义路由</h2>
            <p>可指定客户端模型别名直接重定向映射至具体模型或梯队池。<strong>此规则优先级最高，高于自动和梯队算法</strong>。变动需点击统一保存写入 KV。</p>
          </div>
          <button class="btn btn-p" type="button" onclick="addCustomRouteRow()"><i class="fas fa-plus" aria-hidden="true"></i>添加路由规则</button>
        </div>

        <div style="background: var(--color-paper); border: 1px solid var(--color-rule); border-radius: var(--radius-panel); padding: 12px; margin-bottom: 12px; font-size: 13px; color: var(--color-muted);">
          <i class="fas fa-info-circle c-brand" style="margin-right: 6px;"></i>
          <strong>使用示例：</strong><br>
          • 请求别名 <code>gpt-4o</code> ➔ 目标 <code>flagship/auto</code>（请求 gpt-4o 时强行重定向至第一梯队池调度）<br>
          • 请求别名 <code>my-drawing</code> ➔ 目标 <code>opencode/flux-schnell</code>（强行映射至指定提供商模型）
        </div>

        <div id="customRoutesContainer" class="key-list">
          <!-- 动态渲染自定义路由 -->
        </div>
      </section>

      <section id="system-logs" class="workspace-section" aria-labelledby="logs-title">
        <div class="section-heading section-heading--admin">
          <div>
            <h2 id="logs-title">日志与调试设置</h2>
            <p>调试模式下展示报错超时日志；正式模式启用内存缓存与 30 秒定时落盘，严格节省 KV 写入配额。</p>
          </div>
          <div class="fc" style="gap: 8px;">
            <button class="btn btn-s" onclick="fetchLogs()"><i class="fas fa-sync-alt" aria-hidden="true"></i>刷新日志</button>
            <button class="btn btn-d" onclick="clearLogs()"><i class="fas fa-trash-alt" aria-hidden="true"></i>清空日志</button>
          </div>
        </div>

        <div class="log-panel">
          <div class="log-config-grid">
            <div style="display: flex; align-items: center; gap: 12px;">
              <label class="tg" title="切换调试模式">
                <input type="checkbox" id="debugModeToggle" onchange="handleDebugToggle(this.checked)">
                <span class="sl"></span>
              </label>
              <div>
                <strong id="debugModeLabel">当前模式：正式模式（内存缓存 + 30秒落盘）</strong>
                <p style="font-size: 13px; color: var(--color-muted); margin-top: 2px;">
                  开启调试模式后仅记录报错与超时并在下方展示；切换瞬间内存未落地缓存将强制批量落盘。
                </p>
              </div>
            </div>
            <div id="cacheConfigRow" style="display: flex; align-items: center; gap: 16px; flex-wrap: wrap;">
              <div class="fg" style="margin: 0; min-width: 160px;">
                <label for="maxCacheInput" style="font-size: 12px;">缓存队列最大条数</label>
                <input type="number" id="maxCacheInput" value="20" min="1" max="100" style="height: 36px; padding: 4px 8px;" onchange="markUnsaved()">
              </div>
              <div class="fg" style="margin: 0; min-width: 160px;">
                <label for="flushIntervalInput" style="font-size: 12px;">定时强制落盘（秒）</label>
                <input type="number" id="flushIntervalInput" value="30" min="5" max="300" style="height: 36px; padding: 4px 8px;" onchange="markUnsaved()">
              </div>
            </div>
          </div>
        </div>

        <div class="log-table-wrap">
          <table class="log-table" aria-label="请求日志列表">
            <thead>
              <tr>
                <th>请求时间</th>
                <th>选中模型</th>
                <th>客户端 Key</th>
                <th>响应耗时</th>
                <th>状态码</th>
                <th>失败原因</th>
                <th>IP</th>
              </tr>
            </thead>
            <tbody id="logsTableBody">
              <tr>
                <td colspan="7" style="text-align: center; padding: 24px; color: var(--color-muted);">
                  正在加载日志数据...
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </main>

    ${renderSiteFooter(SITE_CONFIG.title)}
  </div>
</div>

<div id="modal" class="modal-o hd" role="presentation" onclick="if(event.target===this)closeM()"><div class="modal" id="mc" role="dialog" aria-modal="true" aria-live="polite"></div></div>

<script>${SHARED_JS}
// 内存草稿状态：所有操作先在内存暂存，点击左侧「统一保存」时才一次性写入 KV，严格节约 KV 配额（对 < 符号进行 safe escape）
let stagedProviders = ${JSON.stringify(providers).replace(/</g, '\\u003c')};
let stagedProxyKeys = ${JSON.stringify(proxyKeys).replace(/</g, '\\u003c')};
let stagedTiers = ${JSON.stringify(tierConfig).replace(/</g, '\\u003c')};
let stagedCustomRoutes = ${JSON.stringify(customRoutes).replace(/</g, '\\u003c')};
let latenciesMap = ${JSON.stringify(latenciesMap).replace(/</g, '\\u003c')}; // 同步前台海选与实机探测双指标延迟数据
let unsavedChangesCount = 0;

function markUnsaved() {
  unsavedChangesCount++;
  updateUnsavedUI();
}

function updateUnsavedUI() {
  const b = document.getElementById('unsavedBadge');
  const mb = document.getElementById('mobileUnsavedBadge');
  if (unsavedChangesCount > 0) {
    if (b) { b.style.display = 'inline-block'; b.textContent = '有改动 (' + unsavedChangesCount + ')'; }
    if (mb) { mb.style.display = 'inline-block'; mb.textContent = '(' + unsavedChangesCount + ')'; }
  } else {
    if (b) { b.style.display = 'none'; }
    if (mb) { mb.style.display = 'none'; }
  }
}

// copy（兼容不同 DOM 元素的图标选择逻辑，避免可选链语法异常）
function copyText(t, el) {
  const parent = el.parentElement;
  const i = el.tagName === 'I' ? el : (el.querySelector('i') || (parent ? parent.querySelector('i') : null));
  if (!i) { navigator.clipboard.writeText(t).catch(function() {}); return }
  const oc = i.className
  navigator.clipboard.writeText(t).then(() => {
    i.className = 'fas fa-check c-s'
    el.setAttribute('data-state', 'success')
    setTimeout(() => {
      i.className = oc
      el.removeAttribute('data-state')
    }, 1800)
  }).catch(() => {
    el.setAttribute('data-state', 'error')
  })
}

// 从当前行读取实时输入值并复制（Key 行与模型 ID 行共用）
function copyRowVal(btn) {
  const inp = btn.parentElement.querySelector('input[type=text]')
  if (inp) copyText(inp.value, btn)
}

// modal
function showM(h) { document.getElementById('mc').innerHTML = h; document.getElementById('modal').classList.remove('hd') }
function closeM() { document.getElementById('modal').classList.add('hd') }
function cM(msg) {
  return new Promise(r => {
    showM('<h3><i class="fas fa-question-circle c-p"></i> 确认</h3><p>' + msg + '</p><div class="fa"><button class="btn btn-s" onclick="closeM();r(false)">取消</button><button class="btn btn-p" onclick="closeM();r(true)">确定</button></div>')
    window.r = r
  })
}
function pM(msg, def) {
  return new Promise(r => {
    showM('<h3><i class="fas fa-pen c-p"></i> ' + msg + '</h3><div class="fg"><input type="text" id="pv" value="' + (def || '') + '" placeholder="请输入"></div><div class="fa"><button class="btn btn-s" id="pMc">取消</button><button class="btn btn-p" id="pMo">确定</button></div>')
    window.r = r
    const inp = document.getElementById('pv')
    if (inp) {
      inp.focus()
      inp.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') { closeM(); r(inp.value.trim()) }
      })
    }
    document.getElementById('pMc').addEventListener('click', function() { closeM(); r(null) })
    document.getElementById('pMo').addEventListener('click', function() { closeM(); r(inp.value.trim()) })
  })
}
// 多行批量输入弹窗（支持换行粘贴多个模型 ID）
function pMTextarea(title, placeholder) {
  return new Promise(function(r) {
    showM('<h3><i class="fas fa-file-import c-p"></i> ' + escapeHtml(title) + '</h3><div class="fg"><textarea id="pvt" rows="7" style="width:100%;box-sizing:border-box;padding:8px;font-family:monospace;font-size:13px;border-radius:var(--radius-sm);border:1px solid var(--border-color);background:var(--bg-input);color:var(--text-color);" placeholder="' + escapeHtml(placeholder || '每行一个模型 ID') + '"></textarea></div><div class="fa"><button class="btn btn-s" id="pvtc">取消</button><button class="btn btn-p" id="pvto">导入</button></div>')
    window.r = r
    var ta = document.getElementById('pvt')
    if (ta) ta.focus()
    document.getElementById('pvtc').addEventListener('click', function() { closeM(); r(null) })
    document.getElementById('pvto').addEventListener('click', function() { closeM(); r(ta.value) })
  })
}
function aM(msg, t) {
  const i = t === 'success' ? 'fa-check-circle c-s' : 'fa-exclamation-circle c-d'
  showM('<h3><i class="fas ' + i + '"></i> ' + (t === 'success' ? '成功' : '提示') + '</h3><p>' + msg + '</p><div class="fa"><button class="btn btn-p" onclick="closeM()">确定</button></div>')
}

function toast(msg, t) {
  const el = document.getElementById('toast')
  const i = t === 'success' ? 'fa-check-circle' : 'fa-times-circle'
  const cls = t === 'success' ? 'al-s' : 'al-e'
  el.innerHTML = '<div class="al ' + cls + '"><i class="fas ' + i + '"></i> ' + escapeHtml(msg) + '</div>'
  el.classList.remove('hd')
  setTimeout(() => el.classList.add('hd'), 3000)
}

// ===== 三大梯队池前端管理逻辑 =====
function renderTierPools() {
  const container = document.getElementById('tierPoolsContainer')
  if (!container || !stagedTiers) return

  // 收集当前暂存的所有提供商中的全部模型供下拉选择
  let allAvailableModels = []
  stagedProviders.forEach(function(p) {
    if (p.models && Array.isArray(p.models)) {
      p.models.forEach(function(m) {
        allAvailableModels.push({
          providerId: p.id,
          providerName: p.name || p.id,
          modelId: m.id,
          category: m.category || 'text'
        })
      })
    }
  })

  const tierKeys = [
    { key: 'tier1', icon: 'fas fa-crown', badge: '旗舰' },
    { key: 'tier2', icon: 'fas fa-paw', badge: 'OpenClaw' },
    { key: 'tier3', icon: 'fas fa-paint-brush', badge: '绘图' }
  ]

  container.innerHTML = tierKeys.map(function(item) {
    const t = stagedTiers[item.key]
    if (!t) return ''
    const models = t.models || []
    const isFull = models.length >= t.maxSeats

    // 下拉选项
    const optionsHtml = allAvailableModels.length === 0
      ? '<option value="">暂无可用模型，请先添加提供商与模型</option>'
      : '<option value="">-- 选择要指派入席的模型 --</option>' + allAvailableModels.map(function(m) {
          const inThisTier = models.some(function(tm) { return tm.providerId === m.providerId && tm.modelId === m.modelId })
          const catName = m.category === 'image' ? '绘图' : (m.category === 'multimodal' ? '多模态' : '文本')
          return '<option value="' + escapeHtml(m.providerId) + ':::' + escapeHtml(m.modelId) + '" ' + (inThisTier ? 'disabled' : '') + '>' +
            '[' + escapeHtml(m.providerName) + '] ' + escapeHtml(m.modelId) + ' (' + catName + ')' + (inThisTier ? ' [已在席位]' : '') +
            '</option>'
        }).join('')

    return '<div class="tier-pool-box" data-tier="' + item.key + '">' +
      '<div class="tier-pool-box__header">' +
        '<div>' +
          '<div class="tier-pool-box__title"><i class="' + item.icon + ' c-brand"></i>' + escapeHtml(t.name) + '</div>' +
          '<span class="tier-pool-box__alias"><i class="fas fa-route" style="margin-right: 4px;"></i>别名: ' + escapeHtml(t.alias) + '</span>' +
        '</div>' +
        '<div class="fc" style="gap: 6px;">' +
          '<span class="tier-seat-badge ' + (isFull ? 'tier-seat-badge--full' : '') + '">' + models.length + ' / ' + t.maxSeats + ' 席位</span>' +
        '</div>' +
      '</div>' +

      '<div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; font-size: 13px;">' +
        '<label style="color: var(--color-muted); font-size: 12px;"><i class="fas fa-chair" style="margin-right: 4px;"></i>配置最大席位数:</label>' +
        '<input type="number" min="1" max="50" value="' + t.maxSeats + '" data-tier="' + item.key + '" style="width: 70px; height: 28px; padding: 2px 6px; font-size: 13px;" onchange="updateTierSeats(this.dataset.tier, this.value)" title="修改席位（缩容时自动移出多余模型，不触发冷却与探测）">' +
      '</div>' +

      '<div class="tier-model-list">' +
        (models.length > 0 ? models.map(function(m, idx) {
          const prov = stagedProviders.find(function(p) { return p.id === m.providerId })
          const pName = prov ? prov.name : m.providerId
          const cat = m.category || 'text'
          let catBadge = '<span class="cat-chip cat-chip--text"><i class="fas fa-font"></i>文本</span>'
          if (cat === 'image') catBadge = '<span class="cat-chip cat-chip--image"><i class="fas fa-paint-brush"></i>绘图</span>'
          else if (cat === 'multimodal') catBadge = '<span class="cat-chip cat-chip--multimodal"><i class="fas fa-eye"></i>多模态</span>'
          else if (cat === 'other') catBadge = '<span class="cat-chip cat-chip--other"><i class="fas fa-cube"></i>其他</span>'

          // 关键逻辑：从 latenciesMap 中匹配当前梯队席位模型的定时探测与真实用户调用双延迟，并在控制台直接渲染，方便调优
          const key = m.providerId + ':' + m.modelId
          const stats = (typeof latenciesMap !== 'undefined' && latenciesMap && latenciesMap[key]) || { probeLatency: null, realLatency: null }
          const probeMs = stats.probeLatency
          const realMs = stats.realLatency

          const latHtml = '<div class="tier-model-latencies">' +
            '<span class="latency-badge ' + (probeMs ? 'latency-badge--probe' : 'latency-badge--none') + '" title="最近巡检探测延迟">' +
              '<i class="fas fa-bolt"></i>探测: ' + (probeMs ? probeMs + 'ms' : '未测') +
            '</span>' +
            '<span class="latency-badge ' + (realMs ? 'latency-badge--real' : 'latency-badge--none') + '" title="真实用户平均延迟">' +
              '<i class="fas fa-chart-bar"></i>真实: ' + (realMs ? realMs + 'ms' : '无') +
            '</span>' +
          '</div>'

          return '<div class="tier-model-item">' +
            '<div class="tier-model-item__info">' +
              '<span class="tier-model-item__prov">' + escapeHtml(pName) + '</span>' +
              '<strong>' + escapeHtml(m.modelId) + '</strong>' +
              catBadge +
              latHtml +
            '</div>' +
            '<button class="icon-btn" data-tier="' + item.key + '" data-idx="' + idx + '" onclick="removeModelFromTier(this.dataset.tier, parseInt(this.dataset.idx, 10))" title="移出梯队" aria-label="移出梯队">' +
              '<i class="fas fa-times"></i>' +
            '</button>' +
          '</div>'
        }).join('') : '<div style="text-align: center; padding: 18px 8px; color: var(--color-muted); font-size: 12px;"><i class="fas fa-inbox" style="margin-bottom: 4px; display: block; font-size: 16px;"></i>所有模型默认不入池，请在下方选择模型指派入席</div>') +
      '</div>' +

      '<div class="tier-pool-form">' +
        '<select id="tier-select-' + item.key + '" class="select-sm fx1" style="font-size: 12px;">' +
          optionsHtml +
        '</select>' +
        '<button class="btn btn-s btn-sm" type="button" data-tier="' + item.key + '" onclick="addModelToTier(this.dataset.tier)" title="加入此梯队席位">' +
          '<i class="fas fa-plus"></i>入席' +
        '</button>' +
      '</div>' +
    '</div>'
  }).join('')
}

// 修改梯队席位数：缩小溢出模型移出梯队，不触发冷却、不触发探测
function updateTierSeats(tierKey, newSeatsVal) {
  const t = stagedTiers[tierKey]
  if (!t) return
  let newSeats = parseInt(newSeatsVal, 10)
  if (isNaN(newSeats) || newSeats < 1) newSeats = 1
  t.maxSeats = newSeats

  // 约束：席位缩小溢出模型移出梯队，不触发冷却、不触发探测
  if (t.models && t.models.length > newSeats) {
    const removedCount = t.models.length - newSeats
    t.models = t.models.slice(0, newSeats)
    toast('【' + t.name + '】席位缩容至 ' + newSeats + '，已自动将 ' + removedCount + ' 个溢出模型移出梯队（暂存中）', 'info')
  } else {
    toast('已调整【' + t.name + '】席位数为 ' + newSeats + '（暂存中）', 'info')
  }

  renderTierPools()
  markUnsaved()
}

// 指派模型入席
function addModelToTier(tierKey) {
  const t = stagedTiers[tierKey]
  if (!t) return
  if (!t.models) t.models = []

  if (t.models.length >= t.maxSeats) {
    toast('当前【' + t.name + '】席位已满（上限 ' + t.maxSeats + ' 席位），请先调大席位或移出已有模型', 'error')
    return
  }

  const select = document.getElementById('tier-select-' + tierKey)
  if (!select || !select.value) {
    toast('请先在下拉列表中选择要指派入席的模型', 'warn')
    return
  }

  const parts = select.value.split(':::')
  const providerId = parts[0]
  const modelId = parts[1]

  const exists = t.models.some(function(m) { return m.providerId === providerId && m.modelId === modelId })
  if (exists) {
    toast('该模型已在当前梯队中', 'warn')
    return
  }

  // 获取模型分类
  let cat = 'text'
  const prov = stagedProviders.find(function(p) { return p.id === providerId })
  if (prov && prov.models) {
    const mdl = prov.models.find(function(m) { return m.id === modelId })
    if (mdl && mdl.category) cat = mdl.category
  }

  t.models.push({
    providerId: providerId,
    modelId: modelId,
    category: cat,
    addedAt: Date.now()
  })

  renderTierPools()
  markUnsaved()
  toast('已将【' + modelId + '】指派入【' + t.name + '】（暂存中）', 'success')
}

// 将模型移出梯队（变为普通模型）
function removeModelFromTier(tierKey, idx) {
  const t = stagedTiers[tierKey]
  if (!t || !t.models) return
  t.models.splice(idx, 1)
  renderTierPools()
  markUnsaved()
  toast('已将模型移出梯队池（恢复为普通模型，暂存中）', 'info')
}

// providers（将核心交互函数显式挂载到 window 保证 HTML onclick 能无缝响应）
window.tog = function tog(id) {
  const d = document.getElementById('dt-' + id), c = document.getElementById('ch-' + id)
  if (d) d.classList.toggle('open')
  if (c && d) c.style.transform = d.classList.contains('open') ? 'rotate(90deg)' : ''
}

window.showAdd = function showAdd() {
  const af = document.getElementById('af')
  if (af) af.classList.remove('hd')
}

window.hideAdd = function hideAdd() {
  const af = document.getElementById('af'), amc = document.getElementById('amc')
  if (af) af.classList.add('hd')
  if (amc) amc.classList.add('hd')
}

// aid 输入 opencode 时自动填充 API 地址（增加 DOM 存在的安全判断）
var aidEl = document.getElementById('aid')
if (aidEl) {
  aidEl.addEventListener('input', function() {
    if (this.value.trim() === 'opencode') {
      var aurlEl = document.getElementById('aurl')
      if (aurlEl) aurlEl.value = '${OPENCODE_DEFAULT_URL}'
    }
  })
}

// provider api keys (add form)
function addAKeyRow() {
  const c = document.getElementById('akeys')
  const d = document.createElement('div')
  d.className = 'fc mb-4 field-row'
  d.innerHTML = '<input type="text" placeholder="sk-xxx" class="fx1 aki" aria-label="上游 API Key"><label class="tg"><input type="checkbox" checked class="ake" aria-label="启用 Key"><span class="sl"></span></label><button class="icon-btn" onclick="copyRowVal(this)" title="复制 Key" aria-label="复制 Key"><i class="far fa-copy"></i></button><button class="icon-btn" onclick="testNewAKey(this)" title="测试 Key" aria-label="测试 Key"><i class="fas fa-plug"></i></button><button class="icon-btn" onclick="this.parentElement.remove()" title="移除 Key" aria-label="移除 Key"><i class="fas fa-times"></i></button>'
  c.appendChild(d)
}

function renderModelGrid(models, editId, providerId) {
  if (providerId === 'opencode') {
    models = (models || []).filter(function(m) {
      return m && typeof m.id === 'string' && /^[A-Za-z0-9._:/-]+$/.test(m.id) && (m.id === 'big-pickle' || m.id.endsWith('-free'))
    })
  }
  if (!models || models.length === 0) return '<span class="mu">未返回模型列表</span>'
  var h = models.map(function(m) {
    var modelId = String(m.id || '')
    var safeId = escapeHtml(modelId)
    var addFn = editId
      ? "addMdlToEdit('" + editId + "','" + modelId + "')"
      : "addMdlToForm('" + modelId + "')"
    return '<div class="mdl-item">' +
      '<i class="fas fa-cube"></i>' +
			'<span class="fx1 cp ov" onclick="copyText(\\'' + modelId + '\\',this)">' + safeId + '</span>' +
      '<button class="btn btn-gh mdl-add-btn" onclick="' + addFn + '" title="添加到表单">+</button></div>'
  }).join('')
  return '<div class="grid-2-gap6">' + h + '</div>'
}

// 一键添加所有已拉取出来的模型并自动识别分类
function importAllPulledModels(panelId, providerId) {
  var panel = document.getElementById(panelId)
  if (!panel) return
  var items = panel.querySelectorAll('.mdl-item .ov')
  if (items.length === 0) {
    toast('面板中没有可导入的模型', 'warn')
    return
  }
  var count = 0
  items.forEach(function(el) {
    var mid = el.innerText.trim()
    if (mid) {
      if (providerId) {
        if (addMdlToProvider(providerId, mid, 'auto')) count++
      } else {
        if (addModelRowToContainer('amodels', mid, 'auto', true)) count++
      }
    }
  })
  markUnsaved()
  toast('已一键添加 ' + count + ' 个拉取出的模型并自动识别分类（暂存中）', 'success')
}

// 可用模型面板 heading（添加态静态 HTML 与编辑态动态生成共用同一结构）
function modelPanelHeading(panelId, providerId) {
  var pId = providerId || ''
  var importBtn = '<button class="btn btn-s btn-sm" type="button" onclick="importAllPulledModels(\\\'' + panelId + '\\\',\\\'' + pId + '\\\')" title="一键将已拉取出的模型全量添加并自动识别分类"><i class="fas fa-file-import"></i> 一键添加已拉取模型</button>'
  return '<div class="panel-heading"><div>' +
    '<span class="panel-heading__mark"><i class="fas fa-cube" aria-hidden="true"></i></span>' +
    '<div><h3>可用模型</h3><p>点击“+”单条添加，或点击一键添加所有拉取出的模型。</p></div></div>' +
    '<div class="fc" style="gap: 6px;">' + importBtn +
    '<button class="icon-btn" type="button" onclick="hideMdlPanel(\\\'' + panelId + '\\\')" title="关闭可用模型" aria-label="关闭可用模型"><i class="fas fa-times" aria-hidden="true"></i></button></div></div>'
}

// 关闭可用模型面板（仅隐藏，不清空已获取的模型数据）
function hideMdlPanel(panelId) {
  document.getElementById(panelId).classList.add('hd')
}

function testNewAKey(btn) {
  const inp = btn.parentElement.querySelector('.aki'), k = inp.value.trim()
  const providerId = document.getElementById('aid').value.trim()
  if (!k && providerId !== 'opencode') { toast('请输入 API Key', 'error'); return }
  const url = document.getElementById('aurl').value.trim()
  if (!url) { toast('请先填写 API 地址', 'error'); return }
  const apiType = document.getElementById('afmt').value
  const tr = document.getElementById('atestR')
  showSpinner(tr)
  testKeyConnection(url, apiType, k, providerId).then(function(result) {
    if (result.success && result.data) {
      document.getElementById('amcl').innerHTML = renderModelGrid(result.data.data || [], null, providerId)
      document.getElementById('amc').classList.remove('hd')
    } else {
      document.getElementById('amc').classList.add('hd')
    }
    showResult(tr, result.success, result.success ? '' : 'HTTP ' + result.status)
  })
}

// 模型智能自动分类辅助函数（前端客户端生效）
// 内置关键词：绘图(draw、image、flux、sd、绘画)，多模态(vision、vl)，其余默认文本，匹配不到归其他
function detectModelCategory(mid) {
  if (!mid || typeof mid !== 'string') return 'other'
  var lower = mid.toLowerCase()
  if (/draw|image|flux|sd|绘画/.test(lower)) return 'image'
  if (/vision|vl/.test(lower)) return 'multimodal'
  return 'text'
}

// 向添加表单容器加入单条模型输入行
function addModelRowToContainer(containerId, mid, category, enabled) {
  var c = document.getElementById(containerId)
  if (!c) return false
  // 查重：若已存在相同模型 ID 则跳过
  var existing = Array.from(c.querySelectorAll('.ami')).map(function(inp) { return inp.value.trim().toLowerCase() })
  if (existing.includes(mid.toLowerCase())) return false

  var cat = (category && category !== 'auto') ? category : detectModelCategory(mid)
  var d = document.createElement('div')
  d.className = 'fc mb-4 field-row'
  d.innerHTML = '<input type="text" value="' + escapeHtml(mid) + '" class="fx1 ami" aria-label="模型 ID">' +
    '<select class="select-sm amcat" style="width: 82px;" title="模型分类">' +
    '<option value="auto">自动识别</option>' +
    '<option value="text" ' + (cat === 'text' ? 'selected' : '') + '>文本</option>' +
    '<option value="image" ' + (cat === 'image' ? 'selected' : '') + '>绘图</option>' +
    '<option value="multimodal" ' + (cat === 'multimodal' ? 'selected' : '') + '>多模态</option>' +
    '<option value="other" ' + (cat === 'other' ? 'selected' : '') + '>其他</option>' +
    '</select>' +
    '<label class="tg" title="启用模型"><input type="checkbox" ' + (enabled !== false ? 'checked' : '') + ' class="ame" aria-label="启用模型"><span class="sl"></span></label>' +
    '<button class="icon-btn" onclick="copyRowVal(this)" title="复制模型 ID" aria-label="复制模型 ID"><i class="far fa-copy"></i></button>' +
    '<button class="icon-btn" onclick="testNewMdl(this)" title="测试模型" aria-label="测试模型"><i class="fas fa-plug"></i></button>' +
    '<button class="icon-btn" onclick="this.parentElement.remove()" title="移除模型" aria-label="移除模型"><i class="fas fa-times"></i></button>'
  c.appendChild(d)
  return true
}

let mdlCount = 1
function addMdlRow() {
  var midInp = document.getElementById('anew-mid')
  var mid = midInp ? midInp.value.trim() : ''
  var catSelect = document.getElementById('anew-mcat')
  var rawCat = catSelect ? catSelect.value : 'auto'

  if (mid) {
    if (!addModelRowToContainer('amodels', mid, rawCat, true)) {
      toast('该模型已在添加列表中', 'error')
      return
    }
    midInp.value = ''
    return
  }
  // 若未填写新模型 ID，则增加一行默认输入框
  addModelRowToContainer('amodels', '', 'auto', true)
}

function addMdlToForm(mid) {
  if (!addModelRowToContainer('amodels', mid, 'auto', true)) {
    toast('模型【' + mid + '】已存在于添加表单', 'info')
  }
}

// 一键拉取上游模型（添加表单态）
async function fetchUpstreamModelsForAdd() {
  var url = document.getElementById('aurl').value.trim()
  var apiType = document.getElementById('afmt').value
  var providerId = document.getElementById('aid').value.trim()
  var akeys = document.querySelectorAll('#akeys .aki')
  var apiKey = Array.from(akeys).map(function(inp) { return inp.value.trim() }).filter(Boolean)[0] || ''
  if (!url) { toast('请先输入 API 地址', 'error'); return }

  toast('正在请求上游模型列表...', 'info')
  try {
    var res = await fetch('/admin/api/fetch-upstream-models', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseUrl: url, apiType: apiType, apiKey: apiKey, providerId: providerId })
    })
    var data = await res.json()
    if (data.success && data.data && Array.isArray(data.data.models)) {
      var models = data.data.models
      if (models.length === 0) {
        toast('上游未返回任何可用模型', 'warn')
        return
      }
      var added = 0
      models.forEach(function(mid) {
        if (addModelRowToContainer('amodels', mid, 'auto', true)) added++
      })
      toast('成功拉取并添加 ' + added + ' 个新模型！', 'success')
    } else {
      toast(data.message || '拉取上游模型失败', 'error')
    }
  } catch (err) {
    toast('拉取上游模型网络请求异常', 'error')
  }
}

// 一键导入模型（添加表单态）
async function openBatchImportForAdd() {
  var text = await pMTextarea('批量导入模型 ID', '每行一个模型 ID，可直接复制粘贴多行')
  if (!text) return
  var lines = text.split(String.fromCharCode(10)).map(function(s) { return s.trim().replace(String.fromCharCode(13), '') }).filter(Boolean)
  if (lines.length === 0) return
  var added = 0
  lines.forEach(function(mid) {
    if (addModelRowToContainer('amodels', mid, 'auto', true)) added++
  })
  toast('已批量导入 ' + added + ' 个模型', 'success')
}

// 一键清空模型（添加表单态）
async function clearAllModelsForAdd() {
  if (!(await cM('确定要清空添加表单中的所有模型吗？'))) return
  document.getElementById('amodels').innerHTML = ''
  toast('已清空模型列表', 'info')
}

function testNewMdl(btn) {
  const inp = btn.parentElement.querySelector('.ami'), mid = inp.value.trim()
  if (!mid) { toast('请输入模型 ID', 'error'); return }
  const url = document.getElementById('aurl').value.trim()
    const akeys = document.querySelectorAll('#akeys .aki')
    const configuredKey = Array.from(akeys).map(function(inp) { return inp.value.trim() }).filter(Boolean)[0] || ''
    const apiType = document.getElementById('afmt').value
    const tr = document.getElementById('atestR')
    showSpinner(tr)
  const providerId = document.getElementById('aid').value.trim()
  const apiKey = configuredKey || (providerId === 'opencode' ? '' : 'dummy')
  testModelConnection(url, apiType, apiKey, mid, providerId).then(function(result) {
    showResult(tr, result.success, result.success ? '' : 'HTTP ' + result.status)
  })
}

function renderProviderCard(p) {
  const plist = document.getElementById('plist')
  const empty = plist.querySelector('.empty-state')
  if (empty) empty.remove()
  const article = document.createElement('article')
  article.className = 'pi'
  article.dataset.id = p.id
  article.innerHTML = '<div class="ps" onclick="tog(\\'' + p.id + '\\')" role="button" tabindex="0">' +
    '<div class="l"><i class="fas fa-chevron-right provider-chevron" id="ch-' + p.id + '"></i>' +
    '<span class="provider-avatar">' + escapeHtml(p.name.charAt(0).toUpperCase() || 'A') + '</span>' +
    '<div><h3>' + escapeHtml(p.name) + '</h3><div class="pu"><code>' + escapeHtml(p.id) + '</code><span>' + (p.apiType==='anthropic'?'Anthropic':'OpenAI') + '</span><span>' + p.apiKeys.length + ' Keys</span><span>' + p.models.length + ' 模型</span></div></div></div>' +
    '<div class="fc fx-s0" onclick="event.stopPropagation()"><label class="tg"><input type="checkbox" ' + (p.enabled?'checked':'') + ' id="en-' + p.id + '" onchange="togglePb(\\'' + p.id + '\\',this.checked)"><span class="sl"></span></label><span class="bd ' + (p.enabled?'bd-on':'bd-off') + '">' + (p.enabled?'已启用':'未启用') + '</span></div>' +
    '</div>' +
    '<div class="pd" id="dt-' + p.id + '">' +
    '<div class="detail-heading"><div><h3>编辑 ' + escapeHtml(p.name) + '</h3><p>暂存修改后，点击左侧统一保存即可生效。</p></div><span class="protocol-chip">' + (p.apiType==='anthropic'?'ANTHROPIC':'OPENAI') + '</span></div>' +
    '<div class="fr"><div class="fg"><label>名称</label><input type="text" id="nm-' + p.id + '" value="' + escapeHtml(p.name) + '" oninput="markUnsaved()"></div><div class="fg"><label>ID</label><input type="text" value="' + escapeHtml(p.id) + '" disabled></div></div>' +
    '<div class="fg"><label>API 地址</label><input type="url" id="url-' + p.id + '" value="' + escapeHtml(p.baseUrl) + '" oninput="markUnsaved()"></div>' +
    '<div class="fg"><label>API 格式</label><select id="at-' + p.id + '" class="select-sm" onchange="markUnsaved()"><option value="openai" ' + (p.apiType==='openai'?'selected':'') + '>OpenAI 兼容</option><option value="anthropic" ' + (p.apiType==='anthropic'?'selected':'') + '>Anthropic 兼容</option></select></div>' +
    '<fieldset class="form-group"><legend>上游 API Keys</legend><div id="keys-' + p.id + '">' +
    p.apiKeys.map(function(k, ki) {
      return '<div class="fc mb-3 field-row" data-kidx="' + ki + '"><input type="text" value="' + escapeHtml(k.key) + '" class="fx1" id="k-' + p.id + '-' + ki + '" oninput="markUnsaved()"><label class="tg"><input type="checkbox" ' + (k.enabled?'checked':'') + ' id="ken-' + p.id + '-' + ki + '" onchange="markUnsaved()"><span class="sl"></span></label><button class="icon-btn" onclick="copyRowVal(this)"><i class="far fa-copy"></i></button><button class="icon-btn" onclick="testKeyRow(\\'' + p.id + '\\',' + ki + ')"><i class="fas fa-plug"></i></button><button class="icon-btn" onclick="rmKeyRow(\\'' + p.id + '\\',' + ki + ')"><i class="fas fa-times"></i></button></div>'
    }).join('') +
    '</div><div class="fc mt-1 field-row"><input type="text" id="nk-' + p.id + '" placeholder="新的 API Key" class="fx1"><button class="btn btn-s" onclick="addKeyRow(\\'' + p.id + '\\')"><i class="fas fa-plus"></i>添加</button></div></fieldset>' +
    '<fieldset class="form-group">' +
    '<div class="fc justify-between mb-2" style="flex-wrap: wrap; gap: 8px;">' +
    '<legend style="margin-bottom: 0;">模型列表 (' + p.models.length + ')</legend>' +
    '<div class="fc" style="gap: 6px;">' +
    '<button type="button" class="btn btn-s btn-sm" onclick="fetchUpstreamModelsForEdit(\\'' + p.id + '\\')" title="向端点请求并自动一键添加所有拉取的可用模型"><i class="fas fa-download"></i>一键添加拉取的模型</button>' +
    '<button type="button" class="btn btn-s btn-sm" onclick="openBatchImportForEdit(\\'' + p.id + '\\')" title="批量输入多行模型 ID"><i class="fas fa-file-import"></i>一键批量粘贴</button>' +
    '<button type="button" class="btn btn-d btn-sm" onclick="clearAllModelsForEdit(\\'' + p.id + '\\')" title="清空该提供商下的所有模型"><i class="fas fa-trash"></i>一键删除所有模型</button>' +
    '</div></div>' +
    '<div id="ml-' + p.id + '">' +
    p.models.map(function(m, mi) {
      var cat = m.category || detectModelCategory(m.id)
      var isDead = m.status === 'dead'
      var isCooling = !isDead && (m.status === 'cooling' || (m.cooldownUntil && m.cooldownUntil > Date.now()))
      var badge = '<span class="status-chip status-chip--ok" id="mstatus-' + p.id + '-' + mi + '" title="运行正常">正常</span>'
      if (isDead) badge = '<span class="status-chip status-chip--err" id="mstatus-' + p.id + '-' + mi + '" title="连续失败已熔断">永久失效</span>'
      else if (isCooling) badge = '<span class="status-chip status-chip--warn" id="mstatus-' + p.id + '-' + mi + '" title="冷却中">冷却中</span>'

      return '<div class="fc mb-3 field-row" data-idx="' + mi + '">' +
        '<input type="text" value="' + escapeHtml(m.id) + '" class="fx1" id="mid-' + p.id + '-' + mi + '" oninput="markUnsaved()">' +
        '<select class="select-sm" id="mcat-' + p.id + '-' + mi + '" onchange="changeModelCategory(\\'' + p.id + '\\',\\'' + m.id + '\\',this.value,' + mi + ')" style="width: 82px;" title="模型分类（手动优先）">' +
        '<option value="text" ' + (cat==='text'?'selected':'') + '>文本</option>' +
        '<option value="image" ' + (cat==='image'?'selected':'') + '>绘图</option>' +
        '<option value="multimodal" ' + (cat==='multimodal'?'selected':'') + '>多模态</option>' +
        '<option value="other" ' + (cat==='other'?'selected':'') + '>其他</option>' +
        '</select>' +
        badge +
        '<button class="btn btn-s btn-sm" id="munblock-' + p.id + '-' + mi + '" style="' + (isDead?'':'display:none;') + '" onclick="unblockModel(\\'' + p.id + '\\',\\'' + m.id + '\\',' + mi + ')" title="解封此模型，清零失败计数器并恢复正常"><i class="fas fa-unlock"></i>解封</button>' +
        '<label class="tg"><input type="checkbox" ' + (m.enabled?'checked':'') + ' id="men-' + p.id + '-' + mi + '" onchange="markUnsaved()"><span class="sl"></span></label>' +
        '<button class="icon-btn" onclick="copyRowVal(this)"><i class="far fa-copy"></i></button>' +
        '<button class="icon-btn" onclick="testMdl(\\'' + p.id + '\\',\\'' + m.id + '\\',' + mi + ')"><i class="fas fa-plug"></i></button>' +
        '<button class="icon-btn" onclick="rmMdl(\\'' + p.id + '\\',' + mi + ')"><i class="fas fa-times"></i></button>' +
        '</div>'
    }).join('') +
    '</div>' +
    '<div class="fc mt-1 field-row">' +
    '<input type="text" id="nmid-' + p.id + '" placeholder="新的模型 ID" class="fx1">' +
    '<select id="nmcat-' + p.id + '" class="select-sm" style="width: 82px;" title="新模型分类">' +
    '<option value="auto">自动分类</option><option value="text">文本</option><option value="image">绘图</option><option value="multimodal">多模态</option><option value="other">其他</option>' +
    '</select>' +
    '<button class="btn btn-s" onclick="addMdl(\\'' + p.id + '\\')"><i class="fas fa-plus"></i>添加</button>' +
    '</div></fieldset>' +
    '<div class="detail-actions"><div id="tr-' + p.id + '"></div><div><button class="btn btn-d" onclick="del(\\'' + p.id + '\\')"><i class="fas fa-trash"></i>删除</button><button class="btn btn-p" onclick="stageProvChanges(\\'' + p.id + '\\')"><i class="fas fa-check"></i>暂存修改</button></div></div>' +
    '</div>'
  plist.prepend(article)
}

function stageNewProv() {
  const nm = document.getElementById('anm').value.trim(), id = document.getElementById('aid').value.trim()
  const url = document.getElementById('aurl').value.trim(), apiType = document.getElementById('afmt').value
  const aki = document.querySelectorAll('#akeys .aki')
  const keys = Array.from(aki).map(inp => {
    const k = inp.value.trim()
    const en = inp.parentElement.querySelector('.ake')?.checked ?? true
    return k ? { key: k, enabled: en } : null
  }).filter(Boolean)
  const amiRows = document.querySelectorAll('#amodels .field-row')
  const models = Array.from(amiRows).map(row => {
    const inp = row.querySelector('.ami')
    if (!inp) return null
    const mid = inp.value.trim()
    const en = row.querySelector('.ame')?.checked ?? true
    const catSelect = row.querySelector('.amcat')
    const rawCat = catSelect ? catSelect.value : 'auto'
    const cat = (rawCat && rawCat !== 'auto') ? rawCat : detectModelCategory(mid)
    return mid ? {
      id: mid,
      enabled: en,
      category: cat,
      isManualCategory: rawCat !== 'auto',
      status: 'healthy',
      failCount: 0
    } : null
  }).filter(Boolean)
  const enabled = document.getElementById('aen').checked
  if (!nm || !id || !url) { toast('请填写名称、ID 和 API 地址', 'error'); return }
  if (stagedProviders.some(p => p.id === id)) { toast('提供商 ID 已存在，请使用其他 ID', 'error'); return }
  const newP = { id, name: nm, baseUrl: url, apiType, apiKeys: keys, models, enabled }
  stagedProviders.unshift(newP)
  renderProviderCard(newP)
  renderTierPools()
  hideAdd()
  markUnsaved()
  toast('已暂存提供商【' + nm + '】，请点击左侧「统一保存」持久化到 KV', 'success')
}

// provider api keys (edit)
function getKeys(id) {
  const c = document.getElementById('keys-' + id)
  const items = c.querySelectorAll('[data-kidx]')
  return Array.from(items).map(item => {
    const idx = parseInt(item.dataset.kidx)
    const k = document.getElementById('k-' + id + '-' + idx).value.trim()
    const en = document.getElementById('ken-' + id + '-' + idx).checked
    return k ? { key: k, enabled: en } : null
  }).filter(Boolean)
}

function addKeyRow(id) {
  const inp = document.getElementById('nk-' + id), k = inp.value.trim()
  if (!k) { toast('请输入 API Key', 'error'); return }
  const c = document.getElementById('keys-' + id), cnt = c.querySelectorAll('[data-kidx]').length
  const d = document.createElement('div')
  d.className = 'fc mb-3 field-row'
  d.dataset.kidx = cnt
  d.innerHTML = '<input type="text" value="' + k + '" class="fx1" id="k-' + id + '-' + cnt + '" placeholder="API Key"><label class="tg"><input type="checkbox" checked id="ken-' + id + '-' + cnt + '"><span class="sl"></span></label><button class="icon-btn" onclick="copyRowVal(this)" title="复制 Key" aria-label="复制 Key"><i class="far fa-copy"></i></button><button class="icon-btn" onclick="testKeyRow(\\'' + id + '\\',' + cnt + ')" title="测试 Key" aria-label="测试 Key"><i class="fas fa-plug"></i></button><button class="icon-btn" onclick="rmKeyRow(\\'' + id + '\\',' + cnt + ')" title="移除 Key" aria-label="移除 Key"><i class="fas fa-times"></i></button>'
  c.appendChild(d)
  inp.value = ''
  inp.focus()
}

function rmKeyRow(id, idx) {
  const c = document.getElementById('keys-' + id)
  c.querySelectorAll('[data-kidx]').forEach(item => {
    if (parseInt(item.dataset.kidx) === idx) item.remove()
  })
}

async function testKeyRow(id, idx) {
  const k = document.getElementById('k-' + id + '-' + idx).value.trim()
  const url = document.getElementById('url-' + id).value.trim()
  if (!k) { toast('请输入 API Key', 'error'); return }
  const apiType = document.getElementById('at-' + id).value
  const tr = document.getElementById('tr-' + id)
  showSpinner(tr)
  const result = await testKeyConnection(url, apiType, k, id)
  showResult(tr, result.success, result.success ? '' : 'HTTP ' + result.status)
  if (result.success && result.data) {
    showEditModelsList(id, result.data.data || [])
  }
}

// opencode 编辑表单 — 获取模型（复用 testKeyConnection 逻辑）
async function fetchEditModels(id) {
  const url = document.getElementById('url-' + id).value.trim()
  const keys = getKeys(id)
  const apiKey = keys.length > 0 ? keys[0].key : ''
  const apiType = document.getElementById('at-' + id).value
  const tr = document.getElementById('tr-' + id)
  showSpinner(tr)
  const result = await testKeyConnection(url, apiType, apiKey, id)
  showResult(tr, result.success, result.success ? '' : escapeHtml(result.message || '获取模型失败'))
  if (result.success && result.data) {
    showEditModelsList(id, result.data.data || [])
  }
}

function showEditModelsList(id, models) {
  const cid = 'mel-' + id
  let el = document.getElementById(cid)
  if (!el) {
    // 以 API Keys fieldset 为锚点插入，结构与添加态的 #amc 对称
    const keysFs = document.getElementById('keys-' + id).closest('fieldset')
    el = document.createElement('aside')
    el.id = cid
    el.className = 'mdl-list-panel'
    el.innerHTML = modelPanelHeading(cid, id) + '<div id="melc-' + id + '"></div>'
    keysFs.insertAdjacentElement('afterend', el)
  }
  el.classList.remove('hd')
  document.getElementById('melc-' + id).innerHTML = renderModelGrid(models, id, id)
}

function addMdlToEdit(id, mid) {
  document.getElementById('nmid-' + id).value = mid
  addMdl(id)
}

// 获取提供商模型配置（编辑态），保持健康标记、失败计数与手动分类
function getMdl(id) {
  var c = document.getElementById('ml-' + id)
  if (!c) return []
  var items = c.querySelectorAll('[data-idx]')
  var p = stagedProviders.find(function(x) { return x.id === id })
  var existingModels = (p && p.models) ? p.models : []

  return Array.from(items).map(function(item) {
    var idx = parseInt(item.dataset.idx)
    var midInp = document.getElementById('mid-' + id + '-' + idx)
    if (!midInp) return null
    var mid = midInp.value.trim()
    var menInp = document.getElementById('men-' + id + '-' + idx)
    var en = menInp ? menInp.checked : true
    var catSelect = document.getElementById('mcat-' + id + '-' + idx)
    var category = catSelect ? catSelect.value : detectModelCategory(mid)

    // 继承原有运行标记、失败计数器与冷却时间
    var old = existingModels.find(function(m) { return m.id === mid }) || {}
    var res = Object.assign({}, old, {
      id: mid,
      enabled: en,
      category: category,
      isManualCategory: catSelect ? true : Boolean(old.isManualCategory),
      status: old.status || 'healthy',
      failCount: typeof old.failCount === 'number' ? old.failCount : 0
    })
    if (old.cooldownUntil) res.cooldownUntil = old.cooldownUntil
    return mid ? res : null
  }).filter(Boolean)
}

function stageProvChanges(id) {
  const p = stagedProviders.find(x => x.id === id)
  if (!p) return
  const nm = document.getElementById('nm-' + id).value.trim()
  const url = document.getElementById('url-' + id).value.trim()
  const apiType = document.getElementById('at-' + id).value
  const keys = getKeys(id)
  const models = getMdl(id)
  const en = document.getElementById('en-' + id).checked
  p.name = nm
  p.baseUrl = url
  p.apiType = apiType
  p.apiKeys = keys
  p.models = models
  p.enabled = en
  renderTierPools()
  markUnsaved()
  toast('已暂存提供商【' + nm + '】修改，点击左侧统一保存写入 KV', 'success')
}

// 向编辑提供商添加单条模型
function addMdlToProvider(providerId, mid, category) {
  var c = document.getElementById('ml-' + providerId)
  if (!c) return false
  // 查重：判断该提供商是否已有同名模型
  var existing = Array.from(c.querySelectorAll('[id^="mid-' + providerId + '-"]')).map(function(inp) { return inp.value.trim().toLowerCase() })
  if (existing.includes(mid.toLowerCase())) return false

  var cnt = c.querySelectorAll('[data-idx]').length
  var cat = (category && category !== 'auto') ? category : detectModelCategory(mid)
  var d = document.createElement('div')
  d.className = 'fc mb-3 field-row'
  d.dataset.idx = cnt
  d.innerHTML = '<input type="text" value="' + escapeHtml(mid) + '" class="fx1" id="mid-' + escapeHtml(providerId) + '-' + cnt + '" placeholder="模型 ID" oninput="markUnsaved()">' +
    '<select class="select-sm" id="mcat-' + escapeHtml(providerId) + '-' + cnt + '" onchange="changeModelCategory(\\'' + escapeHtml(providerId) + '\\',\\'' + escapeHtml(mid) + '\\',this.value,' + cnt + ')" style="width: 82px;" title="模型分类（手动优先）">' +
    '<option value="text" ' + (cat === 'text' ? 'selected' : '') + '>文本</option>' +
    '<option value="image" ' + (cat === 'image' ? 'selected' : '') + '>绘图</option>' +
    '<option value="multimodal" ' + (cat === 'multimodal' ? 'selected' : '') + '>多模态</option>' +
    '<option value="other" ' + (cat === 'other' ? 'selected' : '') + '>其他</option>' +
    '</select>' +
    '<span class="status-chip status-chip--ok" id="mstatus-' + escapeHtml(providerId) + '-' + cnt + '" title="运行正常">正常</span>' +
    '<button class="btn btn-s btn-sm" id="munblock-' + escapeHtml(providerId) + '-' + cnt + '" style="display:none;" onclick="unblockModel(\\'' + escapeHtml(providerId) + '\\',\\'' + escapeHtml(mid) + '\\',' + cnt + ')" title="解封此模型"><i class="fas fa-unlock"></i>解封</button>' +
    '<label class="tg"><input type="checkbox" checked id="men-' + escapeHtml(providerId) + '-' + cnt + '" onchange="markUnsaved()"><span class="sl"></span></label>' +
    '<button class="icon-btn" onclick="copyRowVal(this)" title="复制模型 ID" aria-label="复制模型 ID"><i class="far fa-copy"></i></button>' +
    '<button class="icon-btn" id="tm-' + escapeHtml(providerId) + '-' + cnt + '" title="测试模型" aria-label="测试模型"><i class="fas fa-plug"></i></button>' +
    '<button class="icon-btn" id="rm-' + escapeHtml(providerId) + '-' + cnt + '" title="移除模型" aria-label="移除模型"><i class="fas fa-times"></i></button>'
  c.appendChild(d)

  document.getElementById('tm-' + providerId + '-' + cnt).addEventListener('click', function() { testMdl(providerId, mid, cnt) })
  document.getElementById('rm-' + providerId + '-' + cnt).addEventListener('click', function() { rmMdl(providerId, cnt) })

  // 同步到内存中的 stagedProviders
  var p = stagedProviders.find(function(x) { return x.id === providerId })
  if (p) {
    if (!p.models) p.models = []
    p.models.push({
      id: mid,
      enabled: true,
      category: cat,
      isManualCategory: category !== 'auto' && Boolean(category),
      status: 'healthy',
      failCount: 0
    })
  }
  return true
}

// 管理员手动分类（优先级高于自动分类，暂存内存，统一保存时写入 KV）
function changeModelCategory(providerId, modelId, newCat, modelIdx) {
  var p = stagedProviders.find(function(x) { return x.id === providerId })
  if (p && p.models) {
    var m = p.models.find(function(x) { return x.id === modelId }) || p.models[modelIdx]
    if (m) {
      m.category = newCat
      m.isManualCategory = true
    }
  }
  markUnsaved()
  toast('已手动调整模型【' + modelId + '】分类为【' + newCat + '】（暂存中）', 'info')
}

// 模型一键解封（重置连续失败计数器与熔断状态，恢复为正常健康状态）
function unblockModel(providerId, modelId, modelIdx) {
  var p = stagedProviders.find(function(x) { return x.id === providerId })
  if (p && p.models) {
    var m = p.models.find(function(x) { return x.id === modelId }) || p.models[modelIdx]
    if (m) {
      m.failCount = 0
      m.status = 'healthy'
      delete m.cooldownUntil
    }
  }
  // 更新前端界面上的状态标签和解封按钮
  var badge = document.getElementById('mstatus-' + providerId + '-' + modelIdx)
  if (badge) {
    badge.className = 'status-chip status-chip--ok'
    badge.innerText = '正常'
    badge.title = '运行正常'
  }
  var unblockBtn = document.getElementById('munblock-' + providerId + '-' + modelIdx)
  if (unblockBtn) {
    unblockBtn.style.display = 'none'
  }
  markUnsaved()
  toast('已成功解封模型【' + modelId + '】，连续失败计数器已清零（暂存中，需统一保存生效）', 'success')
}

// 一键重置冷却模型：仅清理处于冷却期（cooling）的模型状态，恢复正常调度；严格不重置已熔断永久失效的模型及失败计数器
function resetCoolingModels() {
  var count = 0
  stagedProviders.forEach(function(p) {
    if (!p.models) return
    p.models.forEach(function(m) {
      if (m.status === 'cooling' || (m.cooldownUntil && m.cooldownUntil > Date.now())) {
        if (m.status !== 'dead') {
          m.status = 'healthy'
          delete m.cooldownUntil
          count++
        }
      }
    })
  })
  if (count === 0) {
    toast('当前暂无处于冷却中的模型', 'info')
    return
  }
  // 刷新前端所有冷却中的状态徽章
  document.querySelectorAll('.status-chip--warn').forEach(function(chip) {
    chip.className = 'status-chip status-chip--ok'
    chip.innerText = '正常'
    chip.title = '运行正常'
  })
  markUnsaved()
  toast('已成功重置 ' + count + ' 个冷却模型（暂存中，请点击统一保存生效）', 'success')
}

// 一键拉取上游模型（编辑表单态）
async function fetchUpstreamModelsForEdit(providerId) {
  var url = document.getElementById('url-' + providerId).value.trim()
  var apiType = document.getElementById('at-' + providerId).value
  var keys = getKeys(providerId)
  var apiKey = keys.length > 0 ? keys[0].key : ''
  if (!url) { toast('请先配置 API 地址', 'error'); return }

  toast('正在向上游端点请求模型列表...', 'info')
  try {
    var res = await fetch('/admin/api/fetch-upstream-models', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseUrl: url, apiType: apiType, apiKey: apiKey, providerId: providerId })
    })
    var data = await res.json()
    if (data.success && data.data && Array.isArray(data.data.models)) {
      var models = data.data.models
      if (models.length === 0) {
        toast('上游未返回任何可用模型', 'warn')
        return
      }
      var added = 0
      models.forEach(function(mid) {
        if (addMdlToProvider(providerId, mid, 'auto')) added++
      })
      markUnsaved()
      toast('成功拉取并增加 ' + added + ' 个新模型（暂存中）', 'success')
    } else {
      toast(data.message || '拉取上游模型失败', 'error')
    }
  } catch (err) {
    toast('拉取上游模型请求失败', 'error')
  }
}

// 一键批量导入（编辑表单态）
async function openBatchImportForEdit(providerId) {
  var text = await pMTextarea('批量导入模型到该提供商', '每行一个模型 ID，可直接复制粘贴多行')
  if (!text) return
  var lines = text.split(String.fromCharCode(10)).map(function(s) { return s.trim().replace(String.fromCharCode(13), '') }).filter(Boolean)
  if (lines.length === 0) return
  var added = 0
  lines.forEach(function(mid) {
    if (addMdlToProvider(providerId, mid, 'auto')) added++
  })
  markUnsaved()
  toast('成功批量导入 ' + added + ' 个新模型（暂存中）', 'success')
}

// 一键清空模型（编辑表单态）
async function clearAllModelsForEdit(providerId) {
  if (!(await cM('确定要清空该提供商下的所有模型吗？（暂存状态，点击统一保存生效）'))) return
  var c = document.getElementById('ml-' + providerId)
  if (c) c.innerHTML = ''
  var p = stagedProviders.find(function(x) { return x.id === providerId })
  if (p) p.models = []
  markUnsaved()
  toast('已清空该提供商下的所有模型（暂存中）', 'info')
}

async function del(id) {
  if (!(await cM('确定要删除此提供商？（该提供商下的模型将自动脱离梯队池，暂存状态，点击左侧统一保存后写入 KV）'))) return
  stagedProviders = stagedProviders.filter(x => x.id !== id)
  const pi = document.querySelector('.pi[data-id="' + id + '"]')
  if (pi) pi.remove()

  // 删除提供商：该提供商全部模型自动脱离所有梯队变为普通模型
  if (stagedTiers) {
    if (stagedTiers.tier1 && Array.isArray(stagedTiers.tier1.models)) {
      stagedTiers.tier1.models = stagedTiers.tier1.models.filter(m => m.providerId !== id)
    }
    if (stagedTiers.tier2 && Array.isArray(stagedTiers.tier2.models)) {
      stagedTiers.tier2.models = stagedTiers.tier2.models.filter(m => m.providerId !== id)
    }
    if (stagedTiers.tier3 && Array.isArray(stagedTiers.tier3.models)) {
      stagedTiers.tier3.models = stagedTiers.tier3.models.filter(m => m.providerId !== id)
    }
    renderTierPools()
  }

  markUnsaved()
  toast('已标记删除提供商并自动移出梯队池，请点击统一保存生效', 'success')
}

function addMdl(id) {
  const inp = document.getElementById('nmid-' + id), mid = inp.value.trim()
  if (!mid) { toast('请输入模型 ID', 'error'); return }
  const catSelect = document.getElementById('nmcat-' + id)
  const rawCat = catSelect ? catSelect.value : 'auto'
  if (!addMdlToProvider(id, mid, rawCat)) {
    toast('该模型已存在于当前提供商配置中', 'error')
    return
  }
  inp.value = ''
  markUnsaved()
  toast('已添加模型【' + mid + '】（暂存中）', 'success')
}

function rmMdl(id, idx) {
  const c = document.getElementById('ml-' + id)
  c.querySelectorAll('[data-idx]').forEach(item => {
    if (parseInt(item.dataset.idx) === idx) item.remove()
  })
  markUnsaved()
}

async function testMdl(id, mid, idx) {
  const tr = document.getElementById('tr-' + id)
  showSpinner(tr)
  try {
    const r = await fetch('/admin/api/providers/' + encodeURIComponent(id) + '/test-model', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modelId: mid })
    })
    const d = await r.json()
    if (d.success && d.data) {
      showResult(tr, d.data.success, d.data.success ? '' : (d.data.message || '连接失败'))
    } else {
      showResult(tr, false, d.message || '测试失败')
    }
  } catch (e) { showResult(tr, false, '请求失败') }
}

// 转发 Key 生成与管理（内存暂存机制）
async function genKey() {
  const name = await pM('输入 Key 名称（可选）')
  if (name === null) return
  showM('<h3><i class="fas fa-key c-p"></i> 生成转发 Key</h3><div class="fg"><label>有效期</label><select id="exp"><option value="30d">30 天</option><option value="90d">90 天</option><option value="180d">180 天</option><option value="1y">1 年</option><option value="forever" selected>永久</option></select></div><div class="fa"><button class="btn btn-s" id="gKc">取消</button><button class="btn btn-p" id="gKo">生成</button></div>')
  document.getElementById('gKc').addEventListener('click', closeM)
  document.getElementById('gKo').addEventListener('click', function() { doGenKey(document.getElementById('exp').value, name) })
}

function renderProxyKeyCard(k) {
  const list = document.querySelector('.key-list')
  if (!list) return
  const empty = list.querySelector('.empty-state')
  if (empty) empty.remove()
  const article = document.createElement('article')
  article.className = 'ki'
  article.dataset.id = k.id
  const expStr = k.expiresAt ? '有效至 ' + new Date(k.expiresAt).toLocaleDateString() : '永久有效'
  const maskedKey = k.key.length > 12 ? k.key.substring(0, 8) + '*****' + k.key.substring(k.key.length - 4) : k.key
  article.innerHTML = '<div class="key-main"><span class="key-icon" aria-hidden="true"><i class="fas fa-key"></i></span>' +
    '<div><div class="kv"><span id="kv-' + escapeHtml(k.id) + '" data-full="' + escapeHtml(k.key) + '" data-vis="0">' + escapeHtml(maskedKey) + '</span>' +
    '<button class="icon-btn" onclick="toggleKeyVis(\\'' + k.id + '\\')" title="显示或隐藏" aria-label="显示或隐藏 Key"><i class="far fa-eye"></i></button>' +
    '<button class="icon-btn" onclick="copyText(\\'' + escapeHtml(k.key) + '\\',this)" title="复制" aria-label="复制 Key"><i class="far fa-copy"></i></button></div>' +
    '<div class="key-meta"><h3>' + escapeHtml(k.name) + '</h3><span class="key-meta__sep">-</span><p>创建于 ' + new Date(k.createdAt).toLocaleDateString() + ' · ' + expStr + '</p></div></div></div>' +
    '<div class="key-actions"><label class="tg"><input type="checkbox" ' + (k.enabled ? 'checked' : '') + ' onchange="toggleProxyKey(\\'' + k.id + '\\',this.checked)" aria-label="启用 ' + escapeHtml(k.name) + '"><span class="sl"></span></label>' +
    '<span class="bd ' + (k.enabled ? 'bd-on' : 'bd-off') + '">' + (k.enabled ? '已启用' : '已禁用') + '</span><button class="bd bd-del" onclick="rmKey(\\'' + k.id + '\\')"><i class="fas fa-trash"></i>删除</button></div>'
  list.appendChild(article)
}

function doGenKey(exp, name) {
  closeM()
  const randomBytes = new Uint8Array(16)
  crypto.getRandomValues(randomBytes)
  const hex = Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0')).join('')
  const keyStr = 'sk-gw-' + hex
  const id = 'key_' + Date.now().toString(36)
  const now = Date.now()
  let expiresAt = null
  if (exp === '30d') expiresAt = now + 30 * 86400000
  else if (exp === '90d') expiresAt = now + 90 * 86400000
  else if (exp === '180d') expiresAt = now + 180 * 86400000
  else if (exp === '1y') expiresAt = now + 365 * 86400000

  const newKeyObj = {
    id: id,
    name: name || 'API Key',
    key: keyStr,
    enabled: true,
    createdAt: now,
    expiresAt: expiresAt
  }
  stagedProxyKeys.push(newKeyObj)
  markUnsaved()
  renderProxyKeyCard(newKeyObj)
  showM('<h3><i class="fas fa-check-circle c-s"></i> 生成成功（已暂存）</h3><p>请妥善保存，切勿泄露：</p><div class="mk">' + escapeHtml(keyStr) + '</div><p style="color:var(--color-muted);font-size:13px;margin-top:8px;">提示：Key 已暂存在内存草稿中，请点击左侧「统一保存」持久化到 KV。</p><div class="fa"><button class="btn btn-p" onclick="closeM()">完成</button></div>')
}

async function rmKey(id) {
  if (!(await cM('确定要删除此 Key？（暂存状态，点击左侧统一保存后生效）'))) return
  stagedProxyKeys = stagedProxyKeys.filter(x => x.id !== id)
  const ki = document.querySelector('.ki[data-id="' + id + '"]')
  if (ki) ki.remove()
  markUnsaved()
  toast('已暂存删除 Key，请点击统一保存生效', 'success')
}

function togglePb(id, checked) {
  const p = stagedProviders.find(x => x.id === id)
  if (p) p.enabled = checked
  const pi = document.querySelector('.pi[data-id="' + id + '"]')
  if (pi) {
    const b = pi.querySelector('.ps .bd')
    if (b) { b.textContent = checked ? '已启用' : '未启用'; b.className = 'bd ' + (checked ? 'bd-on' : 'bd-off') }
  }
  markUnsaved()
}

function toggleKeyVis(id) {
  const el = document.getElementById('kv-' + id)
  const full = el.dataset.full
  const vis = el.dataset.vis === '1'
  if (vis) {
    el.textContent = full.length > 12
      ? full.substring(0, 8) + '*****' + full.substring(full.length - 4)
      : full
    el.dataset.vis = '0'
  } else {
    el.textContent = full
    el.dataset.vis = '1'
  }
}

function toggleProxyKey(id, checked) {
  const k = stagedProxyKeys.find(x => x.id === id)
  if (k) k.enabled = checked
  const ki = document.querySelector('.ki[data-id="' + id + '"]')
  if (ki) {
    const b = ki.querySelector('.key-actions .bd')
    if (b) { b.textContent = checked ? '已启用' : '已禁用'; b.className = 'bd ' + (checked ? 'bd-on' : 'bd-off') }
  }
  markUnsaved()
}

// 收集同步所有当前已展开或修改的 DOM 表单数据
function syncAllProviderInputsFromDOM() {
  document.querySelectorAll('.pi[data-id]').forEach(function(pi) {
    const id = pi.dataset.id
    const p = stagedProviders.find(x => x.id === id)
    if (!p) return
    const nmEl = document.getElementById('nm-' + id)
    if (nmEl) p.name = nmEl.value.trim()
    const urlEl = document.getElementById('url-' + id)
    if (urlEl) p.baseUrl = urlEl.value.trim()
    const atEl = document.getElementById('at-' + id)
    if (atEl) p.apiType = atEl.value
    const enEl = document.getElementById('en-' + id)
    if (enEl) p.enabled = enEl.checked
    p.apiKeys = getKeys(id)
    p.models = getMdl(id)
  })
}

// 统一保存：将所有提供商、Key 及调试配置一次性打包写入 KV
async function triggerBatchSave() {
  const btn = document.getElementById('batchSaveBtn')
  const mBtn = document.getElementById('mobileBatchSaveBtn')
  const origText = btn ? btn.innerHTML : ''
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>保存中...</span>' }
  if (mBtn) { mBtn.disabled = true }

  syncAllProviderInputsFromDOM()

  const debugToggle = document.getElementById('debugModeToggle')
  const debugMode = debugToggle ? Boolean(debugToggle.checked) : false
  const maxCacheInput = document.getElementById('maxCacheInput')
  const flushIntervalInput = document.getElementById('flushIntervalInput')
  const maxCacheItems = maxCacheInput ? (parseInt(maxCacheInput.value, 10) || 20) : 20
  const flushIntervalSec = flushIntervalInput ? (parseInt(flushIntervalInput.value, 10) || 30) : 30

  const payload = {
    providers: stagedProviders,
    proxyKeys: stagedProxyKeys,
    tiers: stagedTiers,
    customRoutes: stagedCustomRoutes,
    debugConfig: {
      debugMode: debugMode,
      maxCacheItems: maxCacheItems,
      flushIntervalSec: flushIntervalSec
    }
  }

  try {
    const res = await fetch('/admin/api/batch-save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    const d = await res.json()
    if (d.success) {
      unsavedChangesCount = 0
      updateUnsavedUI()
      toast('统一保存成功！所有配置已安全持久化至 KV', 'success')
    } else {
      aM('统一保存失败: ' + escapeHtml(d.message || 'KV 写入异常') + '<br><br><b>您的修改未丢失，已完整保留在内存暂存草稿中，您可以检查网络后再次重试统一保存。</b>', 'error')
    }
  } catch (err) {
    aM('请求异常: ' + escapeHtml(String(err)) + '<br><br><b>您的修改未丢失，已完整保留在内存暂存草稿中，您可以稍后重试统一保存。</b>', 'error')
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = origText }
    if (mBtn) { mBtn.disabled = false }
    updateUnsavedUI()
  }
}

// ===== 指定自定义路由管理逻辑 =====
function renderCustomRoutes() {
  const container = document.getElementById('customRoutesContainer')
  if (!container) return
  if (!stagedCustomRoutes || stagedCustomRoutes.length === 0) {
    container.innerHTML = '<div class="empty-state"><i class="fas fa-route" aria-hidden="true"></i><h3>暂无自定义路由规则</h3><p>自定义路由优先级最高，可强制将别名路由映射至具体模型或梯队池。</p><button class="btn btn-p" type="button" onclick="addCustomRouteRow()">添加路由规则</button></div>'
    return
  }

  container.innerHTML = stagedCustomRoutes.map(function(rule, idx) {
    return '<article class="ki" style="display: flex; flex-direction: column; gap: 8px;" data-id="' + escapeHtml(rule.id) + '">' +
      '<div class="fr" style="gap: 8px; align-items: center; width: 100%;">' +
        '<div class="fg" style="margin: 0; flex: 1;"><label style="font-size: 11px;">请求别名 (Alias)</label><input type="text" value="' + escapeHtml(rule.alias) + '" placeholder="如: gpt-4o" oninput="updateCustomRoute(' + idx + ',\\\'' + 'alias' + '\\\',this.value)"></div>' +
        '<div class="fg" style="margin: 0; flex: 1;"><label style="font-size: 11px;">目标模型/梯队池 (Target)</label><input type="text" value="' + escapeHtml(rule.target) + '" placeholder="如: flagship/auto 或 deepseek/deepseek-chat" oninput="updateCustomRoute(' + idx + ',\\\'' + 'target' + '\\\',this.value)"></div>' +
        '<div class="fg" style="margin: 0; flex: 1.2;"><label style="font-size: 11px;">规则说明 (可选)</label><input type="text" value="' + escapeHtml(rule.description || '') + '" placeholder="如: 官方 gpt-4o 强行映射至第一梯队" oninput="updateCustomRoute(' + idx + ',\\\'' + 'description' + '\\\',this.value)"></div>' +
      '</div>' +
      '<div style="display: flex; align-items: center; justify-content: space-between; border-top: 1px solid var(--color-rule); padding-top: 6px; width: 100%;">' +
        '<div class="fc" style="gap: 8px;">' +
          '<label class="tg"><input type="checkbox" ' + (rule.enabled ? 'checked' : '') + ' onchange="updateCustomRoute(' + idx + ',\\\'' + 'enabled' + '\\\',this.checked)"><span class="sl"></span></label>' +
          '<span class="bd ' + (rule.enabled ? 'bd-on' : 'bd-off') + '">' + (rule.enabled ? '已启用' : '已禁用') + '</span>' +
        '</div>' +
        '<button class="bd bd-del" type="button" onclick="removeCustomRouteRow(' + idx + ')"><i class="fas fa-trash" aria-hidden="true"></i>删除</button>' +
      '</div>' +
    '</article>'
  }).join('')
}

function addCustomRouteRow() {
  if (!stagedCustomRoutes) stagedCustomRoutes = []
  stagedCustomRoutes.push({
    id: 'route_' + Date.now().toString(36),
    alias: '',
    target: 'flagship/auto',
    description: '',
    enabled: true
  })
  renderCustomRoutes()
  markUnsaved()
}

function updateCustomRoute(idx, field, value) {
  if (stagedCustomRoutes && stagedCustomRoutes[idx]) {
    stagedCustomRoutes[idx][field] = value
    markUnsaved()
  }
}

function removeCustomRouteRow(idx) {
  if (stagedCustomRoutes) {
    stagedCustomRoutes.splice(idx, 1)
    renderCustomRoutes()
    markUnsaved()
  }
}

// 系统日志与调试模式交互
async function fetchLogs() {
  const tbody = document.getElementById('logsTableBody')
  if (!tbody) return
  try {
    const res = await fetch('/admin/api/logs')
    const d = await res.json()
    if (d.success && d.data) {
      if (d.data.debugConfig) {
        const cfg = d.data.debugConfig
        const toggle = document.getElementById('debugModeToggle')
        if (toggle) toggle.checked = !!cfg.debugMode
        updateDebugLabels(!!cfg.debugMode)
        const mi = document.getElementById('maxCacheInput')
        if (mi && cfg.maxCacheItems) mi.value = cfg.maxCacheItems
        const fi = document.getElementById('flushIntervalInput')
        if (fi && cfg.flushIntervalSec) fi.value = cfg.flushIntervalSec
      }
      const logs = d.data.logs || []
      if (logs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 24px; color: var(--color-muted);">暂无日志记录（调试模式下会实时记录报错与超时）</td></tr>'
        return
      }
      tbody.innerHTML = logs.map(function(log) {
        const timeStr = new Date(log.timestamp).toLocaleString()
        const statusClass = (log.statusCode >= 200 && log.statusCode < 400) ? 'status-chip--ok' : 'status-chip--err'
        return '<tr>' +
          '<td>' + escapeHtml(timeStr) + '</td>' +
          '<td><code>' + escapeHtml(log.model || '-') + '</code></td>' +
          '<td><code>' + escapeHtml(log.key ? (log.key.length > 12 ? log.key.substring(0,8) + '...' : log.key) : '-') + '</code></td>' +
          '<td>' + (log.durationMs || 0) + ' ms</td>' +
          '<td><span class="status-chip ' + statusClass + '">' + log.statusCode + '</span></td>' +
          '<td>' + escapeHtml(log.failReason || '正常') + '</td>' +
          '<td>' + escapeHtml(log.ip || '-') + '</td>' +
          '</tr>'
      }).join('')
    }
  } catch (e) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 24px; color: var(--color-danger);">加载日志失败</td></tr>'
  }
}

async function clearLogs() {
  if (!(await cM('确定要清空内存中保存的日志吗？'))) return
  try {
    const res = await fetch('/admin/api/logs', { method: 'DELETE' })
    const d = await res.json()
    if (d.success) {
      toast('日志已清空', 'success')
      fetchLogs()
    } else {
      toast(d.message || '清空失败', 'error')
    }
  } catch (e) {
    toast('请求失败', 'error')
  }
}

function updateDebugLabels(isDebug) {
  const lbl = document.getElementById('debugModeLabel')
  if (lbl) {
    lbl.textContent = isDebug
      ? '当前模式：调试模式（仅记录报错与超时并在下方展示）'
      : '当前模式：正式模式（内存缓存 + 30秒落盘）'
  }
}

async function handleDebugToggle(checked) {
  updateDebugLabels(checked)
  try {
    const res = await fetch('/admin/api/debug-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ debugMode: checked })
    })
    const d = await res.json()
    if (d.success) {
      toast(checked ? '已切换为调试模式，未落地缓存已全部落盘' : '已切换为正式模式，启用批量缓存落盘', 'success')
      fetchLogs()
    } else {
      toast(d.message || '切换失败', 'error')
    }
  } catch (e) {
    toast('切换请求失败', 'error')
  }
}

// 页面加载后自动加载三大梯队池、自定义路由与日志
renderTierPools()
renderCustomRoutes()
fetchLogs()

// 显式将常用的点击处理函数挂载到 window 上，保证 HTML onclick 全局可用
window.triggerBatchSave = triggerBatchSave;
window.resetCoolingModels = resetCoolingModels;
window.genKey = genKey;
window.fetchLogs = fetchLogs;
window.clearLogs = clearLogs;
window.handleDebugToggle = handleDebugToggle;
window.addCustomRouteRow = addCustomRouteRow;
window.updateCustomRoute = updateCustomRoute;
window.removeCustomRouteRow = removeCustomRouteRow;
window.importAllPulledModels = importAllPulledModels;

// 中文说明：根据点击和 URL 锚点同步侧栏选中态，避免导航始终停留在“概览”。
const adminNavLinks = Array.from(document.querySelectorAll('.admin-nav a[href^="#"]'))
function setActiveAdminNav(hash) {
  const targetHash = adminNavLinks.some(function (link) { return link.getAttribute('href') === hash }) ? hash : '#overview'
  adminNavLinks.forEach(function (link) {
    const active = link.getAttribute('href') === targetHash
    link.classList.toggle('is-active', active)
    if (active) link.setAttribute('aria-current', 'page')
    else link.removeAttribute('aria-current')
  })
}
adminNavLinks.forEach(function (link) {
  link.addEventListener('click', function () { setActiveAdminNav(link.getAttribute('href') || '#overview') })
})
window.addEventListener('hashchange', function () { setActiveAdminNav(location.hash) })
setActiveAdminNav(location.hash)
</script>
</body></html>`)
}