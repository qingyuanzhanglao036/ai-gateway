export const CSS_CONTENT = `
/* 中文说明：方案 A「Cloud Workbench」统一首页、登录页和管理页的设计语言；不涉及后端逻辑。 */
/* Hallmark · genre: modern-minimal · macrostructure: Workbench · design-system: design.md · designed-as-app
 * Hallmark · pre-emit critique: P5 H5 E4 S5 R5 V5
 */
:root {
  --color-paper: oklch(98.5% 0.004 250);
  --color-paper-a: oklch(98.5% 0.004 250 / .94);
  --color-paper-2: oklch(96.7% 0.006 250);
  --color-paper-3: oklch(94.8% 0.008 250);
  --color-ink: oklch(22% 0.020 258);
  --color-ink-2: oklch(34% 0.018 257);
  --color-muted: oklch(49% 0.016 255);
  --color-rule: oklch(89% 0.010 252);
  --color-rule-2: oklch(82% 0.014 252);
  --color-accent: oklch(52% 0.205 256);
  --color-accent-hover: oklch(46% 0.195 256);
  --color-accent-soft: oklch(94% 0.030 256);
  --color-accent-ink: oklch(99% 0.003 250);
  --color-focus: oklch(44% 0.180 256);
  --color-success: oklch(45% 0.120 158);
  --color-success-soft: oklch(95% 0.025 158);
  --color-success-ink: oklch(34% 0.092 158);
  --color-danger: oklch(50% 0.185 25);
  --color-danger-hover: oklch(45% 0.175 25);
  --color-danger-soft: oklch(96% 0.022 25);
  --color-danger-ink: oklch(38% 0.145 25);
  --color-graphite: oklch(22% 0.016 260);
  --color-graphite-2: oklch(28% 0.018 260);
  --color-graphite-rule: oklch(38% 0.020 258);
  --color-graphite-ink: oklch(92% 0.010 250);
  --color-overlay: oklch(18% 0.020 258 / .48);
  --shadow-panel: 0 18px 48px oklch(20% 0.020 258 / .10);
  --shadow-float: 0 8px 24px oklch(20% 0.020 258 / .12);

  --font-display: 'Space Grotesk', 'SF Pro Display', sans-serif;
  --font-body: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --font-mono: 'JetBrains Mono', 'SFMono-Regular', Consolas, monospace;

  --space-3xs: .25rem;
  --space-2xs: .375rem;
  --space-xs: .625rem;
  --space-sm: .875rem;
  --space-md: 1.25rem;
  --space-lg: 1.75rem;
  --space-xl: 2.5rem;
  --space-2xl: 3.5rem;
  --space-3xl: 5rem;
  --space-4xl: 6.5rem;

  --text-xs: .75rem;
  --text-sm: .8125rem;
  --text-md: .9375rem;
  --text-lg: 1.125rem;
  --text-xl: 1.375rem;
  --text-2xl: clamp(1.75rem, 4vw, 2.75rem);

  --radius-control: .375rem;
  --radius-panel: .5rem;
  --radius-round: 999px;
  --control-h: 2.125rem;
  --control-h-sm: 1.75rem;
  --shell: 74rem;
  --ease-out: cubic-bezier(.16, 1, .3, 1);
  --dur-fast: 160ms;
  --dur-panel: 260ms;

  /* compatibility aliases for existing management scripts */
  --c-primary: var(--color-accent);
  --c-primary-hover: var(--color-accent-hover);
  --c-primary-glow: var(--color-accent-soft);
  --c-text: var(--color-ink-2);
  --c-text-dark: var(--color-ink);
  --c-text-secondary: var(--color-ink-2);
  --c-text-muted: var(--color-muted);
  --c-text-light: var(--color-muted);
  --c-bg: var(--color-paper-2);
  --c-bg-white: var(--color-paper);
  --c-bg-light: var(--color-paper-2);
  --c-bg-alt: var(--color-paper-2);
  --c-border: var(--color-rule);
  --c-border-dark: var(--color-rule-2);
  --c-success: var(--color-success);
  --c-success-bg: var(--color-success-soft);
  --c-success-text: var(--color-success-ink);
  --c-danger: var(--color-danger);
  --c-danger-bg: var(--color-danger-soft);
  --c-danger-text: var(--color-danger-ink);
  --c-info-bg: var(--color-accent-soft);
  --c-info-text: var(--color-focus);
  --c-overlay: var(--color-overlay);
}

*, *::before, *::after { box-sizing: border-box; }
html, body { margin: 0; min-width: 0; overflow-x: clip; scroll-behavior: smooth; }
body {
  min-height: 100dvh;
  background: var(--color-paper-2);
  color: var(--color-ink-2);
  font-family: var(--font-body);
  font-size: var(--text-sm);
  line-height: 1.6;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
}
button, input, textarea, select { font: inherit; }
button, a, input, select, textarea { -webkit-tap-highlight-color: transparent; }
a { color: inherit; }
h1, h2, h3, p, figure, dl, dd { margin: 0; }
h1, h2, h3 { color: var(--color-ink); font-family: var(--font-display); font-style: normal; font-weight: 600; letter-spacing: -.025em; line-height: 1.12; overflow-wrap: anywhere; min-width: 0; }
code, pre { font-family: var(--font-mono); }
fieldset { min-width: 0; }
html:focus-within { scroll-behavior: smooth; }
:target { scroll-margin-top: var(--space-lg); }
:focus { outline: 0; }
:focus-visible { outline: .125rem solid var(--color-focus); outline-offset: .125rem; }
::selection { background: var(--color-accent-soft); color: var(--color-ink); }

.shell { width: min(100% - calc(var(--space-sm) * 2), var(--shell)); margin-inline: auto; }
.site-page { display: flex; min-height: 100dvh; flex-direction: column; }
.site-page > main { flex: 1; }
.hd { display: none !important; }
.sr-only { position: absolute; width: .0625rem; height: .0625rem; padding: 0; margin: -.0625rem; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }

/* shared navigation */
.topbar { position: sticky; inset-block-start: 0; z-index: 100; min-height: 4rem; border-block-end: .0625rem solid var(--color-rule); background: var(--color-paper-a); color: var(--color-ink); backdrop-filter: blur(.75rem); }
.topbar__inner { min-height: 4rem; display: flex; align-items: center; justify-content: space-between; gap: var(--space-sm); }
.brand { min-width: 0; display: inline-flex; align-items: center; gap: var(--space-2xs); color: var(--color-ink); text-decoration: none; white-space: nowrap; }
.brand__mark { width: 2rem; height: 2rem; flex: 0 0 auto; display: grid; place-items: center; border: .0625rem solid var(--color-rule-2); border-radius: var(--radius-control); background: var(--color-paper); color: var(--color-accent); }
.brand__name, .brand strong { font-family: var(--font-display); font-size: var(--text-md); font-weight: 600; letter-spacing: -.02em; }
.brand__descriptor, .brand small { color: var(--color-muted); font-family: var(--font-mono); font-size: .625rem; font-weight: 500; letter-spacing: .08em; }
.topbar__actions { display: flex; align-items: center; gap: var(--space-2xs); }

/* buttons and controls */
.btn, .icon-btn, .model-token, .password-toggle, .admin-nav__link, .ps {
  border: .0625rem solid transparent;
  border-radius: var(--radius-control);
  cursor: pointer;
  text-decoration: none;
  white-space: nowrap;
  transition: background-color var(--dur-fast) ease, border-color var(--dur-fast) ease, color var(--dur-fast) ease, transform var(--dur-fast) ease;
}
.btn { min-height: var(--control-h-sm); padding-inline: var(--space-sm); display: inline-flex; align-items: center; justify-content: center; gap: var(--space-2xs); font-size: var(--text-sm); font-weight: 600; line-height: 1; }
.btn-p { border-color: var(--color-accent); background: var(--color-accent); color: var(--color-accent-ink); }
.btn-s { border-color: var(--color-rule-2); background: var(--color-paper); color: var(--color-ink-2); }
.btn-gh { border-color: transparent; background: transparent; color: var(--color-muted); }
.btn-g { border-color: var(--color-success-soft); background: var(--color-success-soft); color: var(--color-success-ink); }
.btn-d { border-color: var(--color-danger-soft); background: var(--color-danger-soft); color: var(--color-danger-ink); }
.icon-btn, .password-toggle { width: var(--control-h-sm); height: var(--control-h-sm); flex: 0 0 var(--control-h-sm); display: inline-grid; place-items: center; border-color: transparent; background: transparent; color: var(--color-muted); }
.icon-btn span { font-family: var(--font-body); font-size: var(--text-xs); }
.copy-control[data-state='success'] { border-color: var(--color-success); color: var(--color-success-ink); }
.copy-control[data-state='error'] { border-color: var(--color-danger); color: var(--color-danger-ink); }
.btn:active, .icon-btn:active, .model-token:active, .password-toggle:active, .ps:active { transform: translateY(.0625rem); }
.btn:disabled, .btn[aria-disabled='true'], .icon-btn:disabled, input:disabled, select:disabled { opacity: .55; cursor: not-allowed; }
.btn[data-state='loading'] .button-label { display: none; }
.btn:not([data-state='loading']) .button-loading { display: none; }
.btn[data-state='success'] { border-color: var(--color-success); background: var(--color-success); color: var(--color-paper); }
.button-loading { display: inline-flex; align-items: center; gap: var(--space-2xs); }

/* form controls */
input, textarea, select {
  width: 100%; height: var(--control-h); padding-inline: var(--space-xs); border: .0625rem solid var(--color-rule-2); border-radius: var(--radius-control); outline: .125rem solid transparent; outline-offset: .0625rem; background: var(--color-paper); color: var(--color-ink); transition: background-color var(--dur-fast) ease, border-color var(--dur-fast) ease;
}
input::placeholder, textarea::placeholder { color: var(--color-muted); opacity: .82; }
input:focus-visible, textarea:focus-visible, select:focus-visible { border-color: var(--color-ink-2); outline: .125rem solid var(--color-focus); outline-offset: .0625rem; }
input[aria-invalid='true'], textarea[aria-invalid='true'], select[aria-invalid='true'] { border-color: var(--color-danger); background: var(--color-danger-soft); }
textarea { min-height: 6rem; padding-block: var(--space-xs); resize: vertical; }
label, legend { color: var(--color-ink-2); font-size: var(--text-xs); font-weight: 600; }
.fg { min-width: 0; margin-block-end: var(--space-sm); }
.fg > label { display: block; margin-block-end: var(--space-2xs); }
.form-helper { min-height: 1lh; margin-block-start: var(--space-3xs); color: var(--color-muted); font-size: var(--text-xs); }
.input-wrap { position: relative; }
.input-wrap > i { position: absolute; inset-inline-start: var(--space-xs); inset-block-start: 50%; z-index: 1; color: var(--color-muted); transform: translateY(-50%); }
.input-wrap input { padding-inline-start: var(--space-xl); padding-inline-end: var(--space-xl); }
.password-toggle { position: absolute; inset-inline-end: 0; inset-block-start: 0; }
.select-sm { height: var(--control-h); }
.fr, .fr3 { display: grid; grid-template-columns: minmax(0, 1fr); gap: 0 var(--space-sm); }
.form-group { margin: 0 0 var(--space-md); padding: var(--space-sm); border: .0625rem solid var(--color-rule); border-radius: var(--radius-control); }
.form-group legend { padding-inline: var(--space-2xs); }
.field-row { min-width: 0; flex-wrap: nowrap; }
.field-row input { min-width: 0; }
/* 纯图标按钮相邻时收紧间距（负外边距抵消 .fc 的 gap） */
.fc > .icon-btn + .icon-btn { margin-inline-start: calc(var(--space-3xs) - var(--space-2xs)); }

/* switch */
.tg { position: relative; display: inline-block; width: 2.375rem; height: var(--control-h); flex: 0 0 2.375rem; margin: 0; }
.tg input { position: absolute; opacity: 0; width: .0625rem; height: .0625rem; }
.tg .sl { position: absolute; inset-inline: 0; inset-block-start: .5rem; height: 1.125rem; border-radius: var(--radius-round); background: var(--color-rule-2); cursor: pointer; transition: background-color var(--dur-fast) ease; }
.tg .sl::before { content: ''; position: absolute; width: .75rem; height: .75rem; inset-inline-start: .1875rem; inset-block-start: .1875rem; border-radius: 50%; background: var(--color-paper); box-shadow: 0 .0625rem .125rem var(--color-overlay); transition: transform var(--dur-fast) var(--ease-out); }
.tg input:checked + .sl { background: var(--color-accent); }
.tg input:checked + .sl::before { transform: translateX(1.25rem); }
.tg input:focus-visible + .sl { outline: .125rem solid var(--color-focus); outline-offset: .125rem; }
.tg input:disabled + .sl { opacity: .55; cursor: not-allowed; }

/* home workbench */
.home-page { background: var(--color-paper); }
.home-hero { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--space-xl); padding-block: var(--space-2xl); }
.home-hero__copy { align-self: center; min-width: 0; }
.eyebrow { margin-block-end: var(--space-sm); display: flex; align-items: center; gap: var(--space-2xs); color: var(--color-muted); font-family: var(--font-mono); font-size: .6875rem; font-weight: 600; letter-spacing: .08em; }
.eyebrow > span { width: .75rem; height: .125rem; background: var(--color-accent); }
.home-hero h1 { max-width: 12ch; font-size: var(--text-2xl); }
.home-hero__lede { max-width: 60ch; margin-block-start: var(--space-md); color: var(--color-muted); font-size: var(--text-md); }
.endpoint-box { max-width: 40rem; margin-block-start: var(--space-lg); display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; border: .0625rem solid var(--color-rule-2); border-radius: var(--radius-control); background: var(--color-paper-2); }
.endpoint-box__label { grid-column: 1 / -1; padding: var(--space-2xs) var(--space-xs) 0; color: var(--color-muted); font-family: var(--font-mono); font-size: .625rem; font-weight: 600; letter-spacing: .08em; }
.endpoint-box code { min-width: 0; padding: var(--space-2xs) var(--space-xs) var(--space-xs); overflow: hidden; color: var(--color-ink); font-size: var(--text-xs); text-overflow: ellipsis; white-space: nowrap; }
.endpoint-box .icon-btn { width: auto; padding-inline: var(--space-sm); display: flex; gap: var(--space-2xs); border-inline-start-color: var(--color-rule); border-radius: 0; }
.request-panel { min-width: 0; overflow: clip; border: .0625rem solid var(--color-graphite-rule); border-radius: var(--radius-panel); background: var(--color-graphite); color: var(--color-graphite-ink); box-shadow: var(--shadow-panel); }
.request-panel figcaption, .request-panel__foot { min-height: 3rem; padding-inline: var(--space-sm); display: flex; align-items: center; justify-content: space-between; gap: var(--space-sm); border-block-end: .0625rem solid var(--color-graphite-rule); color: var(--color-graphite-ink); font-family: var(--font-mono); font-size: .625rem; letter-spacing: .04em; }
.protocol-state { display: inline-flex; align-items: center; gap: var(--space-2xs); color: var(--color-graphite-ink); white-space: nowrap; }
.protocol-state i { width: .4375rem; height: .4375rem; border-radius: 50%; background: var(--color-success); }
.request-panel pre { margin: 0; min-height: 18rem; padding: var(--space-md); overflow: auto; background: var(--color-graphite); color: var(--color-graphite-ink); font-size: clamp(.6875rem, 2vw, .8125rem); line-height: 1.8; }
.request-panel pre code { white-space: pre; }
.syntax-command, .syntax-key { color: oklch(75% 0.130 256); }
.syntax-string { color: oklch(83% 0.060 154); }
.request-panel__foot { border-block-start: .0625rem solid var(--color-graphite-rule); border-block-end: 0; color: oklch(72% 0.012 250); }
.request-panel__foot code { color: var(--color-graphite-ink); }
.metrics-strip { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); border-block: .0625rem solid var(--color-rule); }
.metric { min-width: 0; padding-block: var(--space-md); display: flex; flex-direction: column; gap: var(--space-3xs); border-inline-end: .0625rem solid var(--color-rule); }
.metric:nth-child(even) { border-inline-end: 0; }
.metric:nth-child(n+3) { border-block-start: .0625rem solid var(--color-rule); }
.metric__value { color: var(--color-ink); font-family: var(--font-display); font-size: var(--text-xl); font-weight: 600; line-height: 1; }
.metric__label { color: var(--color-muted); font-size: var(--text-xs); }
.directory { padding-block: var(--space-2xl) var(--space-3xl); }
.section-heading { margin-block-end: var(--space-lg); display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--space-sm); align-items: end; }
.section-heading h2 { font-size: var(--text-xl); }
.section-heading p { max-width: 65ch; margin-block-start: var(--space-2xs); color: var(--color-muted); }
.search-field { position: relative; width: 100%; }
.search-field > i { position: absolute; inset-inline-start: var(--space-xs); inset-block-start: 50%; color: var(--color-muted); transform: translateY(-50%); }
.search-field input { padding-inline-start: var(--space-lg); }
.provider-index { border-block-start: none; display: flex; flex-direction: column; gap: var(--space-md); margin-block-start: var(--space-md); } /* 重构：已配置模型索引升级为卡片网格布局，外层无顶边框，改用整齐的 Flex 卡片间距 */

/* 双维度筛选工具栏 */
.filter-toolbar { display: flex; flex-direction: column; gap: var(--space-xs); margin-block-start: var(--space-xs); margin-block-end: var(--space-md); padding: 12px 16px; background: var(--color-paper-2); border-radius: var(--radius-panel); border: 1px solid var(--color-rule); }
.filter-group { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.filter-label { font-size: var(--text-xs); font-weight: 600; color: var(--color-ink-2); display: inline-flex; align-items: center; gap: 4px; min-width: 3.5rem; }
.filter-btn { display: inline-flex; align-items: center; gap: 6px; font-size: var(--text-xs); font-weight: 500; padding: 4px 10px; border-radius: var(--radius-round); background: var(--color-paper); border: 1px solid var(--color-rule); color: var(--color-ink-2); cursor: pointer; transition: all var(--dur-fast); white-space: nowrap; user-select: none; }
.filter-btn:hover { border-color: var(--color-muted); background: var(--color-paper-2); }
.filter-btn.active { background: var(--color-accent-soft); color: var(--color-focus); border-color: var(--color-focus); font-weight: 600; }
.filter-btn .count-num { opacity: 0.6; font-size: .6875rem; font-family: var(--font-mono); }

/* 重构：提供商外壳卡片 */
.provider-row { min-width: 0; padding: var(--space-md) var(--space-lg); display: flex; flex-direction: column; gap: var(--space-md); border: .0625rem solid var(--color-rule-2); border-radius: var(--radius-panel); background: var(--color-paper-2); transition: all var(--dur-fast) ease; }
.provider-row:hover { border-color: var(--color-accent); box-shadow: 0 4px 16px rgba(0, 0, 0, 0.03); }
.provider-row__header { display: flex; flex-direction: column; gap: var(--space-xs); border-block-end: 1px dashed var(--color-rule); padding-block-end: 12px; }
@media (min-width: 32rem) {
  .provider-row__header { flex-direction: row; align-items: center; justify-content: space-between; gap: var(--space-md); }
}
.provider-row__identity { min-width: 0; display: flex; align-items: center; gap: var(--space-sm); }
.provider-row__title-wrap { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.provider-row__stats-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; font-size: var(--text-xs); color: var(--color-muted); margin-block-start: 4px; }
.provider-row__stats-row span { display: inline-flex; align-items: center; gap: 4px; }

/* 重构：子卡格栅网格 */
.provider-row__models-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px; width: 100%; }
.model-grid-item { background: var(--color-paper); border: 1px solid var(--color-rule); border-radius: 8px; padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; position: relative; transition: all var(--dur-fast); cursor: pointer; user-select: none; }
.model-grid-item:hover { border-color: var(--color-accent); box-shadow: 0 2px 8px rgba(0,0,0,0.03); transform: translateY(-1px); }
.model-grid-item__header { display: flex; align-items: center; justify-content: space-between; gap: 8px; width: 100%; }
.model-grid-item__name { font-family: var(--font-mono); font-size: .8125rem; font-weight: 600; color: var(--color-ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; }
.model-grid-item .copy-btn { border: none; background: transparent; color: var(--color-muted); opacity: 0.4; cursor: pointer; padding: 2px; font-size: .75rem; transition: all var(--dur-fast); display: flex; align-items: center; justify-content: center; }
.model-grid-item:hover .copy-btn { opacity: 0.8; color: var(--color-ink); }
.model-grid-item[data-state="success"] { border-color: var(--color-success); background: var(--color-success-soft); }
.model-grid-item[data-state="success"] .model-grid-item__name { color: var(--color-success-ink); }
.model-grid-item[data-state="success"] .copy-btn { color: var(--color-success-ink); opacity: 1; }

.model-grid-item__badges { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; }

/* 细分子卡片徽章 */
.tag-cat, .tag-claw, .tag-health, .tag-latency { display: inline-flex; align-items: center; gap: 2px; font-size: .625rem; font-weight: 600; padding: 1px 4px; border-radius: 3px; white-space: nowrap; border: 1px solid transparent; }
.tag-cat--text { background: oklch(97% 0.015 240); color: oklch(35% 0.11 240); border-color: oklch(91% 0.03 240); }
.tag-cat--image { background: oklch(97% 0.02 300); color: oklch(38% 0.13 300); border-color: oklch(91% 0.04 300); }
.tag-cat--multimodal { background: oklch(97% 0.03 70); color: oklch(42% 0.13 70); border-color: oklch(92% 0.04 70); }
.tag-cat--other { background: var(--color-paper-3); color: var(--color-muted); border-color: var(--color-rule); }

.tag-claw--yes { background: oklch(96% 0.015 150); color: oklch(40% 0.12 150); border-color: oklch(90% 0.03 150); }
.tag-claw--no { background: var(--color-paper-3); color: var(--color-muted); border-color: var(--color-rule); }

.tag-health--ok { background: var(--color-success-soft); color: var(--color-success-ink); border-color: oklch(88% 0.02 142); }
.tag-health--warn { background: oklch(96% 0.015 85); color: oklch(50% 0.12 85); border-color: oklch(90% 0.03 85); }
.tag-health--err { background: var(--color-danger-soft); color: var(--color-danger-ink); border-color: oklch(88% 0.02 20); }

.tag-latency { background: var(--color-accent-soft); color: var(--color-focus); border-color: oklch(88% 0.02 256); }

.provider-row__mark, .provider-avatar { width: 2.75rem; height: 2.75rem; flex: 0 0 auto; display: grid; place-items: center; border: none; border-radius: var(--radius-control); background: var(--color-accent-soft); color: var(--color-focus); font-family: var(--font-display); font-weight: 700; font-size: var(--text-md); } /* 优化：字母头像改用品牌淡底色，无边框设计更显扁平化高端质感 */
.provider-row h3 { font-size: var(--text-md); font-weight: 600; color: var(--color-ink); margin: 0; }
.provider-row__identity p { margin-block-start: var(--space-3xs); display: flex; flex-wrap: wrap; gap: var(--space-2xs); color: var(--color-muted); font-size: var(--text-xs); align-items: center; }
.provider-row__identity code { color: var(--color-ink-2); background: var(--color-paper-2); padding: 1px 4px; border-radius: 4px; }
.provider-row__models { min-width: 0; display: flex; flex-wrap: wrap; gap: var(--space-2xs); }
.model-token { max-width: 100%; min-height: var(--control-h-sm); padding: 4px 10px; display: inline-flex; align-items: center; gap: var(--space-2xs); border: .0625rem solid var(--color-rule); border-radius: var(--radius-round); font-size: var(--text-xs); font-weight: 500; transition: all var(--dur-fast) ease; background: var(--color-paper-2); color: var(--color-ink-2); } /* 重构：调用名变更为高级药丸胶囊形态，自带过渡 */
.model-token code { overflow: hidden; font-size: var(--text-xs); text-overflow: ellipsis; white-space: nowrap; font-family: var(--font-mono); }
.model-token i { color: currentColor; opacity: 0.7; } /* 图标颜色随文字主色而定，带轻微不透明度 */
.model-token i.far.fa-copy { margin-inline-start: 4px; opacity: 0.4; transition: opacity var(--dur-fast); }
.model-token:hover i.far.fa-copy { opacity: 0.8; }
/* 优化：三种核心模型分类药丸的精美彩色搭配，低饱和度安全色彩，保证护眼与高对比度 */
.model-token--text { background: oklch(97% 0.015 240); color: oklch(35% 0.11 240); border-color: oklch(91% 0.03 240); }
.model-token--text:hover { background: oklch(95% 0.02 240); border-color: oklch(80% 0.06 240); }
.model-token--image { background: oklch(97% 0.02 300); color: oklch(38% 0.13 300); border-color: oklch(91% 0.04 300); }
.model-token--image:hover { background: oklch(94% 0.03 300); border-color: oklch(80% 0.08 300); }
.model-token--multimodal { background: oklch(97% 0.03 70); color: oklch(42% 0.13 70); border-color: oklch(92% 0.04 70); }
.model-token--multimodal:hover { background: oklch(94% 0.04 70); border-color: oklch(82% 0.08 70); }
.model-token--other { background: var(--color-paper-3); color: var(--color-muted); border-color: var(--color-rule); }
.model-token--other:hover { background: var(--color-paper-2); border-color: var(--color-muted); }
.status-badge, .bd, .protocol-chip, .status-dot { display: inline-flex; align-items: center; justify-content: center; gap: var(--space-2xs); width: max-content; min-height: 1.75rem; padding-inline: var(--space-xs); border-radius: var(--radius-round); font-size: var(--text-xs); font-weight: 600; white-space: nowrap; }
.status-badge i, .status-dot i { width: .4375rem; height: .4375rem; border-radius: 50%; background: currentColor; }
.status-badge--on, .bd-on, .status-dot--online { background: var(--color-success-soft); color: var(--color-success-ink); }
.bd-off { background: var(--color-paper-3); color: var(--color-muted); }
.bd-info, .protocol-chip { background: var(--color-accent-soft); color: var(--color-focus); }
/* 删除类徽标按钮：形状同 .bd 胶囊，颜色保持危险态 */
.bd-del { border: .0625rem solid transparent; background: var(--color-danger-soft); color: var(--color-danger-ink); font-family: inherit; cursor: pointer; transition: background-color var(--dur-fast) ease, color var(--dur-fast) ease; }
.bd-del:hover { background: var(--color-danger); color: var(--color-paper); }
.empty-inline { color: var(--color-muted); font-size: var(--text-xs); }
.empty-state { padding: var(--space-xl) var(--space-sm); display: flex; flex-direction: column; align-items: center; gap: var(--space-xs); border: .0625rem dashed var(--color-rule-2); border-radius: var(--radius-panel); background: var(--color-paper-2); color: var(--color-muted); text-align: center; }
.empty-state > i { font-size: var(--text-lg); color: var(--color-muted); }
.empty-state h3 { font-size: var(--text-md); }
.empty-state p { max-width: 55ch; }
.site-footer { border-block-start: .0625rem solid var(--color-rule); background: var(--color-paper-2); color: var(--color-muted); }
.admin-main > .site-footer { margin-block-start: auto; }
.site-footer__inner { padding-block: var(--space-md); display: flex; flex-direction: column; align-items: flex-start; gap: var(--space-2xs); font-size: var(--text-xs); }
.site-footer a { text-underline-offset: .125rem; }
.site-footer__link { color: inherit; text-decoration: none; }

/* authentication split */
.auth-page { background: var(--color-paper); }
.auth-shell { width: min(100%, var(--shell)); min-height: calc(100dvh - 4rem); margin-inline: auto; display: grid; grid-template-columns: minmax(0, 1fr); }
.auth-context, .auth-form-wrap { min-width: 0; padding: var(--space-xl) var(--space-sm); }
.auth-context { display: flex; flex-direction: column; justify-content: center; border-block-end: .0625rem solid var(--color-rule); background: var(--color-paper-2); color: var(--color-ink-2); }
.auth-context h1 { max-width: 11ch; font-size: clamp(2.25rem, 6vw, 4rem); }
.auth-context > p:not(.eyebrow) { max-width: 58ch; margin-block-start: var(--space-md); color: var(--color-muted); font-size: var(--text-md); }
.auth-facts { margin-block-start: var(--space-xl); border-block-start: .0625rem solid var(--color-rule); }
.auth-facts > div { padding-block: var(--space-sm); display: grid; grid-template-columns: minmax(7rem, .7fr) minmax(0, 1.3fr); gap: var(--space-sm); border-block-end: .0625rem solid var(--color-rule); }
.auth-facts dt { color: var(--color-muted); font-size: var(--text-xs); }
.auth-facts dd { min-width: 0; color: var(--color-ink); font-size: var(--text-xs); overflow-wrap: anywhere; }
.auth-form-wrap { display: grid; place-items: center; background: var(--color-paper); color: var(--color-ink-2); }
.auth-form { width: min(100%, 27rem); }
.auth-form__heading { margin-block-end: var(--space-lg); display: flex; align-items: center; gap: var(--space-sm); }
.auth-form__icon, .panel-heading__mark { width: 2.75rem; height: 2.75rem; flex: 0 0 auto; display: grid; place-items: center; border: .0625rem solid var(--color-rule-2); border-radius: var(--radius-control); background: var(--color-paper-2); color: var(--color-accent); }
.auth-form h2 { font-size: var(--text-xl); }
.auth-form__heading p { margin-block-start: var(--space-3xs); color: var(--color-muted); }
.auth-form .al { margin-block-end: var(--space-sm); }
.btn-submit { width: 100%; margin-block-start: var(--space-sm); }

/* admin control plane */
.admin-page { background: var(--color-paper-2); }
.admin-shell { min-height: 100dvh; }
.admin-rail { display: none; }
.admin-main { min-width: 0; min-height: 100dvh; display: flex; flex-direction: column; }
.admin-topbar { position: sticky; inset-block-start: 0; z-index: 90; min-height: 4rem; padding-inline: var(--space-sm); display: flex; align-items: center; justify-content: space-between; gap: var(--space-2xs); border-block-end: .0625rem solid var(--color-rule); background: var(--color-paper-a); backdrop-filter: blur(.75rem); }
.admin-topbar nav { min-width: 0; display: flex; align-items: center; gap: var(--space-3xs); overflow-x: auto; }
.admin-topbar nav a { min-height: var(--control-h); padding-inline: var(--space-xs); display: inline-flex; align-items: center; color: var(--color-muted); font-size: var(--text-xs); font-weight: 600; text-decoration: none; white-space: nowrap; }
.admin-content { width: 100%; max-width: 82rem; margin-inline: auto; padding: var(--space-lg) var(--space-sm) var(--space-3xl); }
.admin-overview { margin-block-end: var(--space-xl); }
.admin-heading { margin-block-end: var(--space-lg); display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--space-md); align-items: end; }
.admin-heading h1 { font-size: clamp(2rem, 5vw, 3rem); }
.admin-heading > div > p:not(.eyebrow) { max-width: 65ch; margin-block-start: var(--space-2xs); color: var(--color-muted); }
.admin-heading__actions { display: flex; flex-wrap: wrap; gap: var(--space-2xs); }
.admin-metrics { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); border: .0625rem solid var(--color-rule); border-radius: var(--radius-panel); background: var(--color-paper); }
.admin-metrics > div { min-width: 0; padding: var(--space-sm); border-inline-end: .0625rem solid var(--color-rule); border-block-end: .0625rem solid var(--color-rule); }
.admin-metrics > div:nth-child(even) { border-inline-end: 0; }
.admin-metrics > div:nth-child(n+3) { border-block-end: 0; }
.admin-metrics > div > span:not(.status-dot) { color: var(--color-ink); font-family: var(--font-display); font-size: var(--text-xl); font-weight: 600; line-height: 1; }
.admin-metrics p { margin-block-start: var(--space-xs); color: var(--color-ink); font-weight: 600; }
.admin-metrics small { color: var(--color-muted); font-size: var(--text-xs); }
.workspace-section { margin-block-start: var(--space-xl); }
.section-heading--admin { padding-block-end: var(--space-md); border-block-end: .0625rem solid var(--color-rule); }
.section-heading--admin code { font-size: var(--text-xs); }
.af-w { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--space-sm); margin-block-end: var(--space-md); }
.add-form-panel, .mdl-list-panel { min-width: 0; padding: var(--space-md); border: .0625rem solid var(--color-rule-2); border-radius: var(--radius-panel); background: var(--color-paper-2); }
.panel-heading { margin-block-end: var(--space-md); display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-sm); }
.panel-heading > div { min-width: 0; display: flex; align-items: center; gap: var(--space-xs); }
.panel-heading h3 { font-size: var(--text-md); }
.panel-heading p { color: var(--color-muted); font-size: var(--text-xs); }
.mdl-list-panel { max-height: 36rem; overflow-y: auto; margin-bottom: 20px;}
.panel-actions, .detail-actions { display: flex; flex-direction: column; align-items: stretch; gap: var(--space-sm); }
.panel-actions > div, .detail-actions > div { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: var(--space-2xs); }
.switch-label { min-height: var(--control-h); display: flex; align-items: center; justify-content: space-between; gap: var(--space-sm); }
.gp, .key-list { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--space-xs); }
.provider-list { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--space-sm); }
@media (min-width: 48rem) {
  .provider-list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: start;
  }
}
.pi, .ki { min-width: 0; max-width: 100%; box-sizing: border-box; border: .0625rem solid var(--color-rule); border-radius: var(--radius-control); background: var(--color-paper); }
.ps { min-height: 4.75rem; padding: var(--space-xs); display: flex; align-items: center; justify-content: space-between; gap: var(--space-sm); cursor: pointer; }
.ps .l { min-width: 0; display: flex; align-items: center; gap: var(--space-xs); }
.ps .l > div { min-width: 0; }
.ps h3 { font-size: var(--text-md); }
.provider-chevron { width: 1rem; flex: 0 0 auto; color: var(--color-muted); transition: transform var(--dur-fast) var(--ease-out); }
.pu { margin-block-start: var(--space-3xs); display: flex; flex-wrap: wrap; gap: var(--space-2xs); color: var(--color-muted); font-size: var(--text-xs); }
.pu > *:not(:last-child)::after { content: '·'; margin-inline-start: var(--space-2xs); color: var(--color-rule-2); }
.pd { display: none; padding: var(--space-md); border-block-start: .0625rem solid var(--color-rule); background: var(--color-paper-2); width: 100%; max-width: 100%; box-sizing: border-box; }
.pd.open { display: block; }
.detail-heading { margin-block-end: var(--space-md); display: flex; align-items: center; justify-content: space-between; gap: var(--space-sm); }
.detail-heading h3 { font-size: var(--text-lg); }
.detail-heading p { margin-block-start: var(--space-3xs); color: var(--color-muted); font-size: var(--text-xs); }
.detail-actions { padding-block-start: var(--space-sm); border-block-start: .0625rem solid var(--color-rule); }
.detail-actions > div:first-child { flex: 1; justify-content: flex-start; }
.ki { padding: var(--space-sm); display: flex; flex-direction: column; gap: var(--space-sm); }
.key-main { min-width: 0; display: flex; align-items: flex-start; gap: var(--space-xs); }
.key-main > div { min-width: 0; }
.key-icon { width: 2.5rem; height: 2.5rem; flex: 0 0 auto; display: grid; place-items: center; border: .0625rem solid var(--color-rule); border-radius: var(--radius-control); background: var(--color-paper-2); color: var(--color-accent); }
.kv { min-width: 0; display: flex; align-items: center; gap: var(--space-3xs); color: var(--color-ink-2); font-family: var(--font-mono); font-size: var(--text-xs); }
.kv > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.kv .icon-btn { width: var(--control-h-sm); }
.key-main h3 { margin-block-start: var(--space-3xs); font-size: var(--text-sm); }
.key-main p { color: var(--color-muted); font-size: var(--text-xs); }
/* Key 名称与创建时间一行显示 */
.key-meta { min-width: 0; display: flex; align-items: baseline; gap: var(--space-2xs); }
.key-meta h3 { margin-block-start: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.key-meta p { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.key-meta__sep { color: var(--color-muted); flex: 0 0 auto; }
.key-actions { display: flex; align-items: center; justify-content: flex-end; gap: var(--space-2xs); }

/* feedback, model list and modal */
.al { min-height: var(--control-h); padding: var(--space-xs); display: flex; align-items: center; gap: var(--space-2xs); border: .0625rem solid transparent; border-radius: var(--radius-control); font-size: var(--text-xs); }
.al-s { border-color: var(--color-success); background: var(--color-success-soft); color: var(--color-success-ink); margin-top: 20px; }
.al-e { border-color: var(--color-danger); background: var(--color-danger-soft); color: var(--color-danger-ink); }
.al-i { border-color: var(--color-accent); background: var(--color-accent-soft); color: var(--color-focus); }
.toast { position: fixed; inset-block-start: var(--space-sm); inset-inline-end: var(--space-sm); z-index: 9998; width: min(calc(100% - calc(var(--space-sm) * 2)), 24rem); box-shadow: var(--shadow-float); }
.modal-o { position: fixed; inset: 0; z-index: 9999; padding: var(--space-sm); display: grid; place-items: center; background: var(--color-overlay); color: var(--color-ink-2); }
.modal { width: min(100%, 27rem); max-height: min(80dvh, 40rem); overflow-y: auto; padding: var(--space-md); border: .0625rem solid var(--color-rule-2); border-radius: var(--radius-panel); background: var(--color-paper); color: var(--color-ink-2); box-shadow: var(--shadow-panel); animation: modal-in var(--dur-panel) var(--ease-out); }
.modal h3 { margin-block-end: var(--space-xs); font-size: var(--text-lg); }
.modal p { margin-block-end: var(--space-sm); color: var(--color-muted); }
.modal .fa { margin-block-start: var(--space-sm); display: flex; justify-content: flex-end; gap: var(--space-2xs); }
.mk { margin-block: var(--space-xs); padding: var(--space-sm); border: .0625rem solid var(--color-rule); border-radius: var(--radius-control); background: var(--color-paper-2); color: var(--color-ink); font-family: var(--font-mono); font-size: var(--text-xs); overflow-wrap: anywhere; user-select: all; }
.mdl-item { min-width: 0; min-height: var(--control-h-sm); padding-inline: var(--space-2xs); display: flex; align-items: center; gap: var(--space-2xs); border: .0625rem solid var(--color-rule); border-radius: var(--radius-control); background: var(--color-paper); color: var(--color-ink-2); font-size: var(--text-xs); }
.mdl-item .fx1 { min-width: 0; white-space: normal; overflow-wrap: anywhere; }
.mdl-item i:first-child { color: var(--color-muted); }
.mdl-add-btn { flex-shrink: 0; width: var(--control-h-sm); min-height: 0; font-size: var(--text-md); line-height: 2; }
.grid-2-gap6 { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--space-2xs); }
@keyframes modal-in { from { opacity: 0; transform: translateY(var(--space-xs)); } to { opacity: 1; transform: none; } }

/* compatibility utilities used by existing interaction code */
.fc { display: flex; align-items: center; gap: var(--space-2xs); }
.fx1 { flex: 1; min-width: 0; }
.fx-s0 { flex-shrink: 0; }
.flex-col { display: flex; flex-direction: column; }
.jc-c { justify-content: center; }
.gap-8, .gp8 { gap: var(--space-2xs); }
.gp3, .gp4 { gap: var(--space-3xs); }
.gp6 { gap: var(--space-2xs); }
.mt-1 { margin-block-start: var(--space-3xs); }
.mt-2, .mt-8 { margin-block-start: var(--space-2xs); }
.mt-3, .mt-6 { margin-block-start: var(--space-2xs); }
.mb-2, .mb-10 { margin-block-end: var(--space-2xs); }
.mb-3, .mb-4 { margin-block-end: var(--space-3xs); }
.m-16-0 { margin-block: var(--space-sm); }
.input-mt-6 { margin-block-start: var(--space-2xs); }
.p-14, .p-10-12 { padding: var(--space-xs); }
.fw { width: 100%; }
.fw-4 { font-weight: 400; }
.fw-6 { font-weight: 600; }
.fw-7 { font-weight: 700; }
.fs-xs, .fs-65, .fs-77 { font-size: var(--text-xs); }
.fs-sm, .fs-s, .fs-88 { font-size: var(--text-sm); }
.fs-1 { font-size: var(--text-md); }
.fs-xxs { font-size: .625rem; }
.w12, .w14, .w16 { width: 1rem; }
.c-p { color: var(--color-accent); }
.c-l, .c-muted, .mu { color: var(--color-muted); }
.c-s { color: var(--color-success); }

/* 复制成功态需压过 .model-token i / .mdl-item i:first-child 的 muted 色（0,2,0 > 0,1,1） */
.model-token i.c-s, .mdl-item i.c-s, .mdl-item i:first-child.c-s { color: var(--color-success); }
.c-d { color: var(--color-danger); }
.mu { font-size: var(--text-xs); }
.tc { text-align: center; }
.va-m { vertical-align: middle; }
.ov { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cp { cursor: pointer; user-select: none; }
.cd { padding: var(--space-3xs) var(--space-2xs); border-radius: var(--radius-control); background: var(--color-paper-2); color: var(--color-ink); font-family: var(--font-mono); font-size: var(--text-xs); }
.copy-icon { color: var(--color-muted); font-size: var(--text-xs); }

@media (hover: hover) and (pointer: fine) {
  .btn-p:hover { border-color: var(--color-accent-hover); background: var(--color-accent-hover); }
  .btn-s:hover, .btn-gh:hover, .icon-btn:hover, .password-toggle:hover { border-color: var(--color-rule-2); background: var(--color-paper-2); color: var(--color-ink); }
  .btn-g:hover { border-color: var(--color-success); }
  .btn-d:hover { border-color: var(--color-danger); background: var(--color-danger); color: var(--color-paper); }
  input:hover, textarea:hover, select:hover { background: var(--color-paper-2); }
  .model-token:hover { border-color: var(--color-accent); color: var(--color-focus); }
  .provider-row:hover, .pi:hover, .ki:hover { border-color: var(--color-rule-2); }
  .ps:hover { background: var(--color-paper-2); }
  .admin-nav__link:hover { background: var(--color-paper-2); color: var(--color-ink); }
}

@media (min-width: 40rem) {
  .shell { width: min(100% - calc(var(--space-lg) * 2), var(--shell)); }
  .home-hero { padding-block: var(--space-3xl); }
  .metrics-strip { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .metric { padding-inline: var(--space-md); }
  .metric:first-child { padding-inline-start: 0; }
  .metric:last-child { border-inline-end: 0; }
  .metric:nth-child(even) { border-inline-end: .0625rem solid var(--color-rule); }
  .metric:nth-child(n+3) { border-block-start: 0; }
  .section-heading { grid-template-columns: minmax(0, 1fr) minmax(16rem, .45fr); }
  .provider-row { grid-template-columns: minmax(14rem, .8fr) minmax(0, 1.8fr) auto; }
  .site-footer__inner { flex-direction: row; align-items: center; justify-content: space-between; }
  .auth-context, .auth-form-wrap { padding: var(--space-2xl); }
  .fr { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .fr3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .admin-content { padding-inline: var(--space-lg); }
  .admin-heading, .section-heading--admin { grid-template-columns: minmax(0, 1fr) auto; }
  .admin-heading__actions { justify-content: flex-end; }
  .admin-metrics { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .admin-metrics > div { border-block-end: 0; }
  .admin-metrics > div:nth-child(even) { border-inline-end: .0625rem solid var(--color-rule); }
  .admin-metrics > div:last-child { border-inline-end: 0; }
  .panel-actions, .detail-actions { flex-direction: row; align-items: center; justify-content: space-between; }
  .ki { flex-direction: row; align-items: center; justify-content: space-between; }
  .grid-2-gap6 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (min-width: 60rem) {
  .home-hero { grid-template-columns: minmax(0, .9fr) minmax(28rem, 1.1fr); align-items: center; gap: var(--space-2xl); }
  .auth-shell { grid-template-columns: minmax(0, 1.05fr) minmax(25rem, .95fr); }
  .auth-context { border-block-end: 0; border-inline-end: .0625rem solid var(--color-rule); }
  .admin-shell { display: grid; grid-template-columns: 15rem minmax(0, 1fr); }
  .admin-rail { position: sticky; inset-block-start: 0; height: 100dvh; padding: var(--space-md) var(--space-sm); display: flex; flex-direction: column; border-inline-end: .0625rem solid var(--color-rule); background: var(--color-paper); color: var(--color-ink-2); }
  .admin-rail__brand { padding-inline: var(--space-xs); }
  .admin-rail__brand > span:last-child { display: flex; flex-direction: column; line-height: 1.2; }
  .admin-nav { margin-block-start: var(--space-xl); display: grid; gap: var(--space-3xs); }
  .admin-nav__link { min-height: var(--control-h); padding-inline: var(--space-xs); display: grid; grid-template-columns: 1.25rem minmax(0, 1fr) auto; align-items: center; gap: var(--space-2xs); color: var(--color-muted); font-weight: 600; }
  .admin-nav__link b { min-width: 1.5rem; padding-inline: var(--space-3xs); border-radius: var(--radius-round); background: var(--color-paper-3); color: var(--color-muted); font-family: var(--font-mono); font-size: .625rem; text-align: center; }
  .admin-nav__link.is-active { background: var(--color-accent-soft); color: var(--color-focus); }
  .admin-rail__foot { margin-block-start: auto; display: grid; gap: var(--space-3xs); }
  .admin-topbar { display: none; }
  .admin-content { padding-block-start: var(--space-xl); }
  .grid-2-gap6 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .pd { padding: var(--space-lg); }
}

@media (min-width: 80rem) {
  .admin-content { padding-inline: var(--space-xl); }
}

@media (max-width: 48rem) {
  /* 移动端品牌与动作按键响应式适配 */
  .brand__descriptor { display: none; }
  .topbar__actions .btn-gh { display: none; }
  .topbar__actions .btn, .topbar--auth .btn { padding-inline: var(--space-xs); }
  .request-panel figcaption { align-items: flex-start; flex-direction: column; justify-content: center; gap: 0; }
  .protocol-state { font-size: .5625rem; }
  .provider-avatar { display: none; }
  .ps { align-items: flex-start; }
  .ps > .fc { flex-direction: column; align-items: flex-end; }
  
  /* 移动端输入行折行与自适应，避免输入框被压扁（排除已独立布局的模型紧凑卡片） */
  .field-row:not(.model-card-compact) { flex-wrap: wrap !important; gap: 6px !important; }
  .field-row:not(.model-card-compact) > input.fx1, 
  .field-row:not(.model-card-compact) > input[type="text"], 
  .field-row:not(.model-card-compact) > input[type="url"] { flex: 1 1 100% !important; min-width: 0 !important; }
  .field-row:not(.model-card-compact) > .btn { flex: 1 1 auto; }
  .admin-topbar .brand__name { display: none; }
  .admin-heading__actions .btn { width: 100%; justify-content: center; }

  /* 移动端顶部导航横向滑动保护 */
  .admin-topbar nav {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
    padding-bottom: 2px;
  }
  .admin-topbar nav::-webkit-scrollbar { display: none; }

  /* 移动端按键触摸面积优化 */
  .btn-sm {
    min-height: 2rem !important;
    padding: 3px 8px !important;
    font-size: .8125rem !important;
  }

  /* 移动端自定义路由模型池高度自适应 */
  .route-models-scroll {
    max-height: 150px;
    gap: 6px;
  }

  /* 移动端梯队池与模型卡片自适应单列 */
  .tier-pools-grid, .tier-grid {
    grid-template-columns: 1fr !important;
  }
  .tier-pool-box {
    padding: var(--space-sm);
  }
  .tier-model-item {
    flex-wrap: wrap;
    gap: 4px;
  }
  .tier-model-item__info {
    flex: 1 1 100%;
  }

  /* 移动端控制台内边距与字体优化 */
  .admin-content {
    padding-inline: var(--space-xs);
    padding-block-start: var(--space-md);
  }
  .admin-heading h1 {
    font-size: 1.75rem;
  }
}

@media (pointer: coarse) {
  .btn, .model-token, .password-toggle, input, select { min-height: var(--control-h); }
  .icon-btn, .password-toggle { width: var(--control-h); height: var(--control-h); flex-basis: var(--control-h); }
}

@media (prefers-reduced-motion: reduce) {
  html, body { scroll-behavior: auto; }
  *, *::before, *::after { animation-duration: .001ms !important; animation-iteration-count: 1 !important; transition-duration: .001ms !important; }
  .modal { transform: none; }
}

/* 统一保存与系统日志模块样式 */
.bd-warn { background: oklch(88% 0.14 85); color: oklch(25% 0.08 85); border-radius: var(--radius-round); font-weight: 600; font-size: .6875rem; padding: .125rem .5rem; }
.admin-rail__save { margin-block-start: var(--space-sm); padding: var(--space-xs); border-radius: var(--radius-panel); background: var(--color-paper-2); border: .0625rem solid var(--color-rule); }
.log-panel { background: var(--color-paper); border: .0625rem solid var(--color-rule); border-radius: var(--radius-panel); padding: var(--space-md); margin-block-end: var(--space-md); }
.log-config-grid { display: flex; flex-wrap: wrap; gap: var(--space-md); align-items: center; justify-content: space-between; }
.log-table-wrap { overflow-x: auto; background: var(--color-paper); border: .0625rem solid var(--color-rule); border-radius: var(--radius-panel); }
.log-table { width: 100%; border-collapse: collapse; font-size: var(--text-sm); text-align: left; }
.log-table th { padding: var(--space-xs) var(--space-sm); background: var(--color-paper-2); color: var(--color-muted); font-weight: 600; border-block-end: .0625rem solid var(--color-rule); white-space: nowrap; }
.log-table td { padding: var(--space-xs) var(--space-sm); border-block-end: .0625rem solid var(--color-rule); color: var(--color-ink-2); white-space: nowrap; }
.log-table tr:last-child td { border-block-end: none; }
.log-table tr:hover td { background: var(--color-paper-2); }
.status-chip { display: inline-block; padding: .125rem .375rem; border-radius: var(--radius-control); font-family: var(--font-mono); font-size: .75rem; font-weight: 600; }
.status-chip--ok { background: var(--color-success-soft); color: var(--color-success-ink); }
.status-chip--warn { background: oklch(92% 0.12 85); color: oklch(35% 0.1 75); }
.status-chip--err { background: var(--color-danger-soft); color: var(--color-danger-ink); }

/* 模型分类标签 */
.cat-chip { display: inline-flex; align-items: center; gap: 3px; font-size: .6875rem; font-weight: 600; padding: .125rem .375rem; border-radius: 4px; white-space: nowrap; }
.cat-chip--text { background: oklch(93% 0.04 240); color: oklch(32% 0.08 240); }
.cat-chip--image { background: oklch(93% 0.08 320); color: oklch(35% 0.12 320); }
.cat-chip--multimodal { background: oklch(93% 0.07 160); color: oklch(32% 0.1 160); }
.cat-chip--other { background: oklch(93% 0.01 250); color: oklch(40% 0.02 250); }

/* 首页第一梯队池展示 */
.tier-section { margin-block-start: var(--space-lg); margin-block-end: var(--space-xl); }
.tier-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: var(--space-md); margin-block-start: var(--space-md); }
.tier-card { background: var(--color-paper); border: .0625rem solid var(--color-rule); border-radius: var(--radius-panel); padding: var(--space-md); display: flex; flex-direction: column; justify-content: space-between; gap: var(--space-sm); transition: border-color .2s ease, box-shadow .2s ease; }
.tier-card:hover { border-color: var(--color-brand); box-shadow: 0 4px 12px rgba(0,0,0,0.04); }
.tier-card__header { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-xs); }
.tier-card__title { font-size: var(--text-base); font-weight: 600; color: var(--color-ink); word-break: break-all; margin: 0; }
.tier-card__provider { font-size: var(--text-xs); color: var(--color-muted); display: flex; align-items: center; gap: 6px; margin-block-start: 2px; }
.tier-card__tags { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-block-start: 4px; }
.tier-card__actions { display: flex; align-items: center; justify-content: space-between; margin-block-start: var(--space-xs); padding-block-start: var(--space-xs); border-block-start: .0625rem solid var(--color-rule); }

/* 首页模型调用指引面板 */
.guide-section { background: var(--color-paper); border: .0625rem solid var(--color-rule); border-radius: var(--radius-panel); padding: var(--space-lg); margin-block-end: var(--space-xl); }
.guide-steps { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: var(--space-md); margin-block-end: var(--space-lg); }
.guide-step { background: var(--color-paper-2); border-radius: var(--radius-card); padding: var(--space-md); border: .0625rem solid var(--color-rule); }
.guide-step__num { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: 50%; background: var(--color-brand); color: #fff; font-size: 12px; font-weight: 700; margin-block-end: var(--space-xs); }
.guide-step h4 { margin: 0 0 4px 0; font-size: var(--text-sm); font-weight: 600; }
.guide-step p { margin: 0; font-size: var(--text-xs); color: var(--color-muted); line-height: 1.5; }
.code-tabs { display: flex; gap: 8px; border-block-end: .0625rem solid var(--color-rule); padding-block-end: 8px; margin-block-end: 12px; }
.code-tab-btn { background: none; border: none; padding: 6px 12px; font-size: 13px; font-weight: 600; color: var(--color-muted); cursor: pointer; border-radius: var(--radius-control); transition: all .15s; }
.code-tab-btn.active { background: var(--color-paper-2); color: var(--color-brand); }
.code-panel pre { background: var(--color-ink); color: #e2e8f0; padding: var(--space-md); border-radius: var(--radius-card); overflow-x: auto; font-family: var(--font-mono); font-size: 13px; line-height: 1.6; margin: 0; }

/* 紧凑按钮与文本域 */
.btn-sm { padding: .25rem .5rem !important; font-size: .75rem !important; min-height: 1.75rem !important; }
.batch-import-area { width: 100%; min-height: 140px; font-family: var(--font-mono); font-size: 13px; line-height: 1.5; padding: 8px; border-radius: var(--radius-control); border: 1px solid var(--color-rule); background: var(--color-paper); }

/* 三大梯队池后台管理与前台展示样式 */
.tier-pools-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 310px), 1fr)); gap: var(--space-md); margin-block-start: var(--space-md); }
.tier-pool-box { background: var(--color-paper); border: .0625rem solid var(--color-rule); border-radius: var(--radius-panel); padding: var(--space-md); display: flex; flex-direction: column; gap: var(--space-sm); box-shadow: 0 2px 6px rgba(0,0,0,0.02); }
.tier-pool-box__header { display: flex; flex-direction: column; gap: 6px; border-block-end: .0625rem solid var(--color-rule); padding-block-end: 8px; }
.tier-pool-box__header-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.tier-pool-box__header-sub { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.tier-pool-box__title { font-size: 14px; font-weight: 600; color: var(--color-ink); display: flex; align-items: center; gap: 6px; }
.tier-pool-box__alias { font-family: var(--font-mono); font-size: 11px; color: var(--color-accent); background: var(--color-accent-soft); padding: 2px 6px; border-radius: 4px; display: inline-flex; align-items: center; line-height: 1.3; }
.tier-pool-seats-ctrl { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; color: var(--color-muted); }
.tier-pool-seats-ctrl input { width: 52px; height: 24px; padding: 1px 4px; font-size: 12px; text-align: center; font-family: var(--font-mono); border: 1px solid var(--color-rule); border-radius: var(--radius-sm); background: var(--color-paper-2); color: var(--color-ink); box-sizing: border-box; }
.tier-seat-badge { font-family: var(--font-mono); font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: var(--radius-round); background: var(--color-paper-2); border: 1px solid var(--color-rule); color: var(--color-ink-2); white-space: nowrap; }
.tier-seat-badge--full { background: #fef3c7; color: #92400e; border-color: #fde68a; }

/* 规整统一的模型卡片：两行标准化流式卡片，杜绝参差不齐与大灰膏药 */
.tier-model-list { display: flex; flex-direction: column; gap: 6px; min-height: 60px; }
.tier-model-item { display: flex; flex-direction: column; gap: 5px; padding: 6px 8px; background: var(--color-paper-2); border: 1px solid var(--color-rule); border-radius: var(--radius-control); transition: border-color .15s ease, background .15s ease; box-sizing: border-box; }
.tier-model-item:hover { border-color: #cbd5e1; background: var(--color-paper); }
.tier-model-item__top { display: flex; align-items: center; gap: 6px; width: 100%; min-width: 0; }
.tier-model-idx { font-family: var(--font-mono); font-size: 11px; font-weight: 700; color: var(--color-brand); background: var(--color-brand-soft); padding: 1px 4px; border-radius: 3px; flex-shrink: 0; line-height: 1.2; }
.tier-model-prov { font-size: 10px; color: var(--color-muted); background: var(--color-paper-3); padding: 1px 4px; border-radius: 3px; white-space: nowrap; flex-shrink: 0; max-width: 65px; overflow: hidden; text-overflow: ellipsis; border: 1px solid var(--color-rule); line-height: 1.3; }
.tier-model-name { font-family: var(--font-mono); font-weight: 600; font-size: 12px; color: var(--color-ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; min-width: 0; }
.tier-model-del { color: var(--color-muted); background: transparent; border: none; cursor: pointer; padding: 2px 4px; border-radius: 3px; font-size: 11px; line-height: 1; flex-shrink: 0; transition: color .15s, background .15s; }
.tier-model-del:hover { color: #dc2626; background: #fee2e2; }
.tier-model-item__bottom { display: flex; align-items: center; justify-content: space-between; gap: 6px; width: 100%; min-width: 0; }
.tier-model-item__tags { display: inline-flex; align-items: center; gap: 4px; flex-shrink: 0; }
.tier-model-latencies { display: inline-flex; align-items: center; gap: 4px; }
.latency-badge { display: inline-flex; align-items: center; gap: 3px; font-family: var(--font-mono); font-size: 10px; font-weight: 500; padding: 1px 5px; border-radius: 3px; white-space: nowrap; border: 1px solid transparent; line-height: 1.3; }
.latency-badge--probe { background: #fef9c3; color: #854d0e; border-color: #fde047; }
.latency-badge--real { background: #ecfeff; color: #0e7490; border-color: #a5f3fc; }
.latency-badge--none { background: var(--color-paper-3); color: var(--color-muted); border-color: var(--color-rule); font-size: 10px; }

/* 正在连接的活跃主调度模型微光徽章 */
.tier-active-badge { display: inline-flex; align-items: center; gap: 3px; font-size: 10px; font-weight: 600; padding: 1px 5px; border-radius: 3px; background: #dcfce7; color: #15803d; border: 1px solid #86efac; line-height: 1.3; white-space: nowrap; }
.tier-active-dot { width: 5px; height: 5px; border-radius: 50%; background: #22c55e; display: inline-block; box-shadow: 0 0 5px rgba(34, 197, 94, 0.8); }

/* OpenClaw 专属认证徽章 */
.tier-claw-badge { display: inline-flex; align-items: center; gap: 3px; font-size: 10px; font-weight: 600; padding: 1px 5px; border-radius: 3px; background: #fef3c7; color: #b45309; border: 1px solid #fde68a; line-height: 1.3; white-space: nowrap; }

.tier-pool-form { display: flex; gap: 6px; align-items: center; margin-block-start: auto; padding-block-start: var(--space-xs); border-block-start: 1px dashed var(--color-rule); }

/* 自定义路由响应式布局与手机端体验优化 */
.route-inputs-row { display: flex; flex-direction: column; gap: 10px; width: 100%; }
@media (min-width: 48rem) {
  .route-inputs-row { flex-direction: row; align-items: flex-start; }
}
.route-panel-box { display: flex; flex-direction: column; gap: 8px; background: var(--color-paper-2); padding: 10px 12px; border-radius: var(--radius-control); border: 1px solid var(--color-rule); width: 100%; box-sizing: border-box; }
.route-models-scroll { display: flex; flex-wrap: wrap; gap: 5px; align-items: center; max-height: 120px; overflow-y: auto; -webkit-overflow-scrolling: touch; padding-right: 4px; border-top: 1px dashed var(--color-rule); padding-top: 6px; }

/* 模型列表头部操作栏：支持标题与按钮自适应折行防溢出 */
.models-header-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  box-sizing: border-box;
  margin-bottom: 8px;
}
.models-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  box-sizing: border-box;
}
.models-toolbar .btn {
  white-space: nowrap;
  font-size: 12px;
  height: 28px;
  padding: 0 8px;
  box-sizing: border-box;
}
@media (max-width: 640px) {
  .models-header-bar {
    flex-direction: column;
    align-items: flex-start;
  }
  .models-toolbar {
    width: 100%;
    display: flex;
    flex-wrap: wrap;
  }
  .models-toolbar .btn {
    flex: 1 1 auto;
    justify-content: center;
    font-size: 11px;
    padding: 0 6px;
  }
}

/* 提供商模型列表：精致紧凑双行卡片排版（电脑端字号适中紧凑，手机端严格对齐不乱折行） */
.model-card-compact {
  display: flex;
  flex-direction: column;
  gap: 4px;
  background: var(--color-paper);
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-control);
  padding: 5px 8px;
  margin-bottom: 5px;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  transition: border-color .15s ease, box-shadow .15s ease;
}
.model-card-compact:hover {
  border-color: var(--color-rule-2);
}
.model-card-compact .model-row-header {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
}
.model-card-compact .model-row-header .ami {
  flex: 1 1 0%;
  min-width: 0;
  height: 26px !important;
  font-size: 12px !important;
  font-family: var(--font-mono);
  padding: 0 6px !important;
  border-radius: var(--radius-control);
  border: 1px solid var(--color-rule-2);
  background: var(--color-paper-2);
  color: var(--color-ink);
  box-sizing: border-box;
}
.model-card-compact .model-row-header .ami:focus {
  background: var(--color-paper);
  border-color: var(--color-accent);
}
.model-card-compact .model-actions {
  display: flex;
  align-items: center;
  gap: 3px;
  flex-shrink: 0;
}
.model-card-compact .action-icon-btn {
  width: 26px;
  height: 26px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-control);
  border: 1px solid var(--color-rule);
  background: var(--color-paper-2);
  color: var(--color-muted);
  cursor: pointer;
  font-size: 11px;
  transition: all .15s;
  box-sizing: border-box;
}
.model-card-compact .action-icon-btn:hover {
  color: var(--color-ink);
  background: var(--color-paper);
  border-color: var(--color-rule-2);
}
.model-card-compact .action-icon-btn--danger:hover {
  color: var(--color-danger);
  border-color: var(--color-danger);
  background: var(--color-danger-soft, #fdf2f2);
}
.model-card-compact .model-row-badges {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  width: 100%;
  box-sizing: border-box;
}
.model-card-compact .select-mini {
  height: 20px !important;
  font-size: 11px !important;
  padding: 0 16px 0 4px !important;
  border-radius: 3px;
  border: 1px solid var(--color-rule-2);
  background: var(--color-paper);
  color: var(--color-ink);
  width: auto;
  min-width: 52px;
  max-width: 76px;
  margin: 0;
  outline: none;
  cursor: pointer;
  box-sizing: border-box;
}
.model-mini-badge {
  font-size: 10.5px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 0 5px;
  border-radius: 3px;
  font-weight: 500;
  white-space: nowrap;
  border: 1px solid transparent;
  line-height: 1;
}
.model-mini-badge--ok {
  border-color: #c2e7cc;
  background: #eafcf1;
  color: #146c2e;
}
.model-mini-badge--dead {
  border-color: #f8b4b4;
  background: #fdf2f2;
  color: #9b1c1c;
}
.model-mini-badge--warn {
  border-color: #fde047;
  background: #fef9c3;
  color: #713f12;
}
.model-mini-badge--claw {
  border-color: #dcd6f7;
  background: #f3efff;
  color: #512da8;
}
.model-mini-badge--btn {
  cursor: pointer;
  user-select: none;
  transition: all .15s ease;
}
.model-mini-badge--btn:hover {
  filter: brightness(0.95);
  transform: translateY(-1px);
  box-shadow: 0 1px 3px rgba(0,0,0,0.08);
}
.model-mini-badge--btn:active {
  transform: translateY(0);
}
.model-mini-badge--muted {
  border-color: var(--color-rule);
  background: var(--color-paper-2);
  color: var(--color-muted);
}
/* 微型精致开关（专为紧凑卡片定制） */
.tg-mini {
  position: relative;
  display: inline-block;
  width: 28px;
  height: 16px;
  flex: 0 0 28px;
  margin: 0;
}
.tg-mini input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}
.tg-mini .sl {
  position: absolute;
  inset: 0;
  border-radius: 8px;
  background: var(--color-rule-2);
  cursor: pointer;
  transition: background-color .15s ease;
}
.tg-mini .sl::before {
  content: '';
  position: absolute;
  width: 12px;
  height: 12px;
  left: 2px;
  top: 2px;
  border-radius: 50%;
  background: #ffffff;
  box-shadow: 0 1px 2px rgba(0,0,0,0.2);
  transition: transform .15s cubic-bezier(.16, 1, .3, 1);
}
.tg-mini input:checked + .sl {
  background: var(--color-accent);
}
.tg-mini input:checked + .sl::before {
  transform: translateX(12px);
}

/* 底部添加新模型条：电脑端横排，手机端上下对齐且字不截断 */
.add-model-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  box-sizing: border-box;
  margin-top: 5px;
}
.add-model-input {
  flex: 1 1 0%;
  min-width: 0;
  height: 28px !important;
  font-size: 12.5px !important;
  padding: 0 8px !important;
  border-radius: var(--radius-control);
  border: 1px solid var(--color-rule-2);
  background: var(--color-paper);
  color: var(--color-ink);
  box-sizing: border-box;
}
.add-model-controls {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
.add-model-select {
  height: 28px !important;
  font-size: 11.5px !important;
  padding: 0 18px 0 6px !important;
  min-width: 76px;
  border-radius: var(--radius-control);
  border: 1px solid var(--color-rule-2);
  background: var(--color-paper);
  color: var(--color-ink);
  box-sizing: border-box;
  cursor: pointer;
}
.add-model-btn {
  height: 28px !important;
  font-size: 11.5px !important;
  padding: 0 10px !important;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  box-sizing: border-box;
}
@media (max-width: 540px) {
  .add-model-bar {
    flex-direction: column;
    align-items: stretch;
    gap: 5px;
  }
  .add-model-input {
    width: 100% !important;
    flex: none;
    height: 30px !important;
    font-size: 12.5px !important;
  }
  .add-model-controls {
    width: 100%;
    display: flex;
    gap: 6px;
  }
  .add-model-select {
    flex: 1 1 50%;
    min-width: 0;
    height: 30px !important;
    font-size: 12px !important;
    padding: 0 20px 0 8px !important;
  }
  .add-model-btn {
    flex: 1 1 50%;
    justify-content: center;
    height: 30px !important;
    font-size: 12px !important;
  }
}
`
