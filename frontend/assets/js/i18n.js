/**
 * i18n.js — Lume 中英双语系统
 * 
 * 用法:
 *   1. HTML 元素加 data-i18n="key" 翻译文本内容
 *   2. data-i18n-placeholder="key" 翻译 placeholder
 *   3. data-i18n-title="key" 翻译 title
 *   4. JS 中用 t('key') 获取翻译文本
 *   5. 切换语言: setLang('zh') / setLang('en')
 */
(function () {
  'use strict';

  var STORE_KEY = 'lume_lang';
  var DEFAULT_LANG = 'zh';

  // ========== 翻译字典 ==========
  var DICT = {
    // ===== Sidebar =====
    'sidebar.new_chat':      { zh: '新建对话', en: 'New Chat' },
    'sidebar.workspace':     { zh: '工作区', en: 'Workspace' },
    'sidebar.devices':       { zh: '设备管理', en: 'Devices' },
    'sidebar.skills':        { zh: '技能库', en: 'Skills' },
    'sidebar.files':         { zh: '文件', en: 'Files' },
    'sidebar.timer':         { zh: '定时任务', en: 'Timer' },
    'sidebar.agent':         { zh: '智能体', en: 'Agent' },
    'sidebar.today':         { zh: '今天', en: 'Today' },
    'sidebar.this_week':     { zh: '本周', en: 'This Week' },
    'sidebar.earlier':       { zh: '更早', en: 'Earlier' },
    'sidebar.lumeclaw':      { zh: 'LumeClaw', en: 'LumeClaw' },
    'sidebar.checkin':       { zh: '每日签到', en: 'Daily Check-in' },
    'sidebar.usage_stats':   { zh: '用量统计', en: 'Usage Stats' },
    'sidebar.subscription':  { zh: '订阅管理', en: 'Subscription' },
    'sidebar.theme':         { zh: '切换主题', en: 'Toggle Theme' },
    'sidebar.feishu':        { zh: '飞书配置', en: 'Feishu Config' },
    'sidebar.change_pwd':    { zh: '修改密码', en: 'Change Password' },
    'sidebar.about':         { zh: '关于', en: 'About' },
    'sidebar.sign_out':      { zh: '退出登录', en: 'Sign Out' },
    'sidebar.language':      { zh: '语言 / Language', en: '语言 / Language' },
    'sidebar.credits':       { zh: '积分', en: 'credits' },

    // ===== Chat =====
    'chat.title':            { zh: 'Lume — AI 团队', en: 'Lume — AI Team' },
    'chat.notification':     { zh: '通知', en: 'Notifications' },
    'chat.read_all':         { zh: '全部已读', en: 'Mark all read' },
    'chat.no_notification':  { zh: '暂无通知', en: 'No notifications' },
    'chat.team_not_ready':   { zh: '你的 AI 团队还未配置完成', en: 'Your AI team is not configured yet' },
    'chat.configure_now':    { zh: '立即配置', en: 'Configure Now' },
    'chat.credits_recharge': { zh: '积分充值', en: 'Credits Recharge' },
    'chat.token_optional':   { zh: '验证令牌（可选）', en: 'Token (optional)' },
    'chat.save':             { zh: '保存配置', en: 'Save' },
    'chat.copy':             { zh: '复制', en: 'Copy' },
    'chat.corp_id':          { zh: '企业 ID (Corp ID)', en: 'Corp ID' },
    'chat.callback_url':     { zh: '回调地址', en: 'Callback URL' },
    'chat.current_pwd':      { zh: '当前密码', en: 'Current Password' },
    'chat.new_pwd':          { zh: '新密码', en: 'New Password' },
    'chat.confirm_pwd':      { zh: '确认新密码', en: 'Confirm Password' },
    'chat.change_pwd':       { zh: '修改密码', en: 'Change Password' },
    'chat.total_credits':    { zh: '总积分:', en: 'Total:' },
    'chat.recharge_credits': { zh: '充值积分:', en: 'Recharged:' },
    'chat.today_free':       { zh: '今日免费:', en: 'Today Free:' },
    'chat.estimated_avail':  { zh: '预计可用:', en: 'Estimated:' },
    'chat.about_tokens':     { zh: '约 {n} tokens', en: '~{n} tokens' },
    'chat.period_today':     { zh: '今日', en: 'Today' },
    'chat.period_week':      { zh: '本周', en: 'This Week' },
    'chat.period_month':     { zh: '本月', en: 'This Month' },
    'chat.period_total':     { zh: '总计', en: 'Total' },
    'chat.welcome_title':    { zh: '欢迎！让我们配置你的 AI 团队', en: 'Welcome! Let\'s set up your AI team' },
    'chat.welcome_desc':     { zh: '你的订阅已生效，接下来需要完成团队配置才能开始使用。', en: 'Your subscription is active. Complete team setup to get started.' },
    'chat.start_setup':      { zh: '开始配置', en: 'Start Setup' },
    'chat.later':            { zh: '稍后配置', en: 'Later' },
    'chat.hello_lingxi':     { zh: '你好！我是灵犀', en: 'Hi! I\'m Lingxi' },
    'chat.lingxi_desc':      { zh: '你的 AI 团队队长，来自星际的智能助手', en: 'Your AI team captain — your intelligent assistant' },
    'chat.what_do_you_do':   { zh: '请问你主要是做什么工作的？', en: 'What do you mainly do?' },
    'chat.suggest_config':   { zh: '根据你的需求，我建议配置', en: 'Based on your needs, I suggest' },
    'chat.config_done':      { zh: '配置完成!', en: 'Setup Complete!' },
    'chat.team_ready':       { zh: '你的 AI 团队已就绪，现在可以开始对话了', en: 'Your AI team is ready. Start chatting now!' },
    'chat.loading':          { zh: '加载中...', en: 'Loading...' },
    'chat.hello_lume':       { zh: '你好，我是 Lume', en: 'Hi, I\'m Lume' },
    'chat.send':             { zh: '发送', en: 'Send' },
    'chat.input_placeholder':{ zh: '输入消息... (Enter 发送, Shift+Enter 换行)', en: 'Type a message... (Enter to send, Shift+Enter for new line)' },
    'chat.delete_confirm':   { zh: '确认删除此对话？', en: 'Delete this conversation?' },
    'chat.clear_confirm':    { zh: '确认清空所有对话？', en: 'Clear all conversations?' },
    'chat.welcome_new':      { zh: '开始新的对话', en: 'Start a new conversation' },
    'chat.model':            { zh: '模型', en: 'Model' },
    'chat.switch_agent':     { zh: '切换智能体', en: 'Switch Agent' },
    'chat.current_agent':    { zh: '当前智能体', en: 'Current Agent' },

    // ===== Agent Workspace =====
    'ws.title':              { zh: '工作区 — Lume', en: 'Workspace — Lume' },
    'ws.no_agent':           { zh: '暂无 Agent，请在管理页添加', en: 'No agents yet. Add one from management.' },
    'ws.tab_desk':           { zh: '办公桌', en: 'Desk' },
    'ws.tab_task':           { zh: '任务', en: 'Tasks' },
    'ws.tab_log':            { zh: '日志', en: 'Logs' },
    'ws.live':               { zh: '实时', en: 'Live' },
    'ws.local':              { zh: '本地', en: 'Local' },
    'ws.member_title':       { zh: '团队成员', en: 'Team Members' },
    'ws.all_added':          { zh: '已添加全部成员', en: 'All members added' },
    'ws.available':          { zh: '可添加', en: 'Available' },
    'ws.no_tasks':           { zh: '暂无活跃任务', en: 'No active tasks' },
    'ws.no_logs':            { zh: '暂无工作日志', en: 'No work logs' },
    'ws.confirm_switch':     { zh: '确认切换模板？', en: 'Confirm switch template?' },
    'ws.save_snapshot':      { zh: '当前配置将自动保存为', en: 'Current config will be auto-saved as' },
    'ws.my_config':          { zh: '"我的配置"', en: '"My Config"' },
    'ws.switch_anytime':     { zh: '，可随时切换回来', en: '. You can switch back anytime.' },
    'ws.confirm_btn':        { zh: '确认切换', en: 'Confirm Switch' },
    'ws.cancel':             { zh: '取消', en: 'Cancel' },
    'ws.snapshot_hint':      { zh: '这是您的配置快照，可随时恢复到当前 Agent 配置', en: 'This is your config snapshot. Restore your Agent setup anytime.' },
    'ws.custom_tpl':         { zh: '自定义模板', en: 'Custom Template' },
    'ws.config_snapshot':    { zh: '配置快照', en: 'Config Snapshot' },
    'ws.restore':            { zh: '恢复此配置', en: 'Restore This Config' },
    'ws.update_snapshot':    { zh: '更新快照', en: 'Update Snapshot' },
    'ws.current':            { zh: '当前', en: 'Current' },
    'ws.tpl_members':        { zh: '团队成员', en: 'Team Members' },
    'ws.captain':            { zh: '队长', en: 'Captain' },
    'ws.recommend_wf':       { zh: '推荐启用工作流', en: 'Recommended Workflows' },
    'ws.wf_suitable':        { zh: '以下工作流适合你的团队', en: 'These workflows suit your team' },
    'ws.activate_all':       { zh: '全部启用', en: 'Activate All' },
    'ws.skip':               { zh: '稍后再说', en: 'Later' },
    'ws.activate_at':        { zh: '激活于', en: 'Activated at' },
    'ws.deactivate':         { zh: '停用', en: 'Deactivate' },

    // ===== Workflows =====
    'wf.title':              { zh: '工作流 — Lume', en: 'Workflows — Lume' },
    'wf.back':               { zh: '返回', en: 'Back' },
    'wf.all_servers':        { zh: '全部设备', en: 'All Devices' },
    'wf.official':           { zh: '官方', en: 'Official' },
    'wf.activated':          { zh: '已激活', en: 'Activated' },
    'wf.available':          { zh: '可用', en: 'Available' },
    'wf.custom':             { zh: '自定义', en: 'Custom' },
    'wf.confirmed':          { zh: '已确认', en: 'Confirmed' },
    'wf.pending':            { zh: '待确认', en: 'Pending' },
    'wf.deleted':            { zh: '已删除', en: 'Deleted' },
    'wf.no_active':          { zh: '暂无激活的工作流', en: 'No active workflows' },
    'wf.activate':           { zh: '激活', en: 'Activate' },
    'wf.deactivate':         { zh: '停用', en: 'Deactivate' },
    'wf.no_available':       { zh: '暂无可用工作流', en: 'No workflows available' },
    'wf.loading':            { zh: '加载中...', en: 'Loading...' },

    // ===== Market =====
    'mk.title':              { zh: '智能体市场 — Lume', en: 'Agent Market — Lume' },
    'mk.search_placeholder': { zh: '搜索智能体...', en: 'Search agents...' },
    'mk.all':                { zh: '全部', en: 'All' },
    'mk.official':           { zh: '官方', en: 'Official' },
    'mk.community':          { zh: '社区', en: 'Community' },
    'mk.install_confirm':    { zh: '确认安装', en: 'Confirm Install' },
    'mk.install_text':       { zh: '确定要将 {name} 添加到你的团队吗？', en: 'Add {name} to your team?' },
    'mk.cancel':             { zh: '取消', en: 'Cancel' },
    'mk.confirm_install':    { zh: '确认安装', en: 'Confirm Install' },
    'mk.installs':           { zh: '次安装', en: 'installs' },
    'mk.added':              { zh: '已添加到团队', en: 'Added to Team' },
    'mk.add':                { zh: '添加到团队', en: 'Add to Team' },
    'mk.rate':               { zh: '评价', en: 'Rate' },
    'mk.no_reviews':         { zh: '暂无评价', en: 'No reviews' },
    'mk.publish':            { zh: '发布智能体', en: 'Publish Agent' },
    'mk.publish_name':       { zh: '智能体名称', en: 'Agent Name' },
    'mk.publish_desc':       { zh: '简介', en: 'Description' },
    'mk.publish_category':   { zh: '分类', en: 'Category' },
    'mk.publish_tags':       { zh: '标签（逗号分隔）', en: 'Tags (comma separated)' },
    'mk.publish_btn':        { zh: '发布', en: 'Publish' },
    'mk.score':              { zh: '评分', en: 'Score' },

    // ===== Skills =====
    'sk.title':              { zh: '技能库 — Lume', en: 'Skills — Lume' },

    // ===== Servers =====
    'sv.title':              { zh: '设备管理 — Lume', en: 'Devices — Lume' },

    // ===== Cron =====
    'cr.title':              { zh: '定时任务 — Lume', en: 'Cron Jobs — Lume' },

    // ===== Knowledge =====
    'kn.title':              { zh: '知识库 — Lume', en: 'Knowledge — Lume' },

    // ===== Index =====
    'idx.title':             { zh: 'Lume — 一键开启你的 AI 团队', en: 'Lume — Your AI Team, One Click Away' },
    'idx.hero_title':        { zh: '你的 AI 团队，一键即达', en: 'Your AI Team, One Click Away' },
    'idx.hero_desc':         { zh: '灵犀云帮你快速搭建专属 AI 团队，让 AI 真正融入你的工作流', en: 'Lume helps you build your AI team instantly, integrating AI into your workflow' },
    'idx.get_started':       { zh: '立即开始', en: 'Get Started' },
    'idx.login':             { zh: '登录', en: 'Log In' },

    // ===== Common =====
    'common.loading':        { zh: '加载中...', en: 'Loading...' },
    'common.confirm':        { zh: '确认', en: 'Confirm' },
    'common.cancel':         { zh: '取消', en: 'Cancel' },
    'common.save':           { zh: '保存', en: 'Save' },
    'common.delete':         { zh: '删除', en: 'Delete' },
    'common.edit':           { zh: '编辑', en: 'Edit' },
    'common.close':          { zh: '关闭', en: 'Close' },
    'common.back':           { zh: '返回', en: 'Back' },
    'common.no_data':        { zh: '暂无数据', en: 'No data' },
    'common.success':        { zh: '操作成功', en: 'Success' },
    'common.error':          { zh: '操作失败', en: 'Error' },
    'common.refresh':        { zh: '刷新', en: 'Refresh' },
  };

  // ========== 当前语言 ==========
  var _lang = localStorage.getItem(STORE_KEY) || DEFAULT_LANG;

  function getLang() { return _lang; }

  function setLang(lang) {
    if (lang !== 'zh' && lang !== 'en') return;
    _lang = lang;
    localStorage.setItem(STORE_KEY, lang);
    applyAll();
    // 触发自定义事件，供页面做额外处理
    document.dispatchEvent(new CustomEvent('langchange', { detail: { lang: lang } }));
  }

  function toggleLang() {
    setLang(_lang === 'zh' ? 'en' : 'zh');
  }

  // ========== 翻译函数 ==========
  /**
   * t('key') — 返回当前语言的文本
   * t('key', { n: 10 }) — 替换 {n} 占位符
   */
  function t(key, params) {
    var entry = DICT[key];
    if (!entry) return key;
    var text = entry[_lang] || entry['zh'] || key;
    if (params) {
      Object.keys(params).forEach(function (k) {
        text = text.replace(new RegExp('\\{' + k + '\\}', 'g'), params[k]);
      });
    }
    return text;
  }

  // ========== DOM 扫描 ==========
  function applyAll() {
    // 翻译文本内容
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var key = el.getAttribute('data-i18n');
      var text = t(key);
      // 如果有参数，从 data-i18n-params 读取
      var params = el.getAttribute('data-i18n-params');
      if (params) {
        try {
          text = t(key, JSON.parse(params));
        } catch (e) { /* ignore */ }
      }
      el.textContent = text;
    });

    // 翻译 placeholder
    document.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
      el.placeholder = t(el.getAttribute('data-i18n-placeholder'));
    });

    // 翻译 title
    document.querySelectorAll('[data-i18n-title]').forEach(function (el) {
      el.title = t(el.getAttribute('data-i18n-title'));
    });

    // 翻译页面标题
    var pageTitle = document.documentElement.getAttribute('data-i18n-page-title');
    if (pageTitle) {
      document.title = t(pageTitle);
    }

    // 更新语言切换按钮状态
    document.querySelectorAll('.lang-switch-btn').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-lang') === _lang);
    });
  }

  // ========== 初始化 ==========
  function initI18n() {
    applyAll();
  }

  // 暴露到全局
  window.I18n = {
    t: t,
    getLang: getLang,
    setLang: setLang,
    toggleLang: toggleLang,
    applyAll: applyAll,
    init: initI18n,
    DICT: DICT
  };

  // DOM ready 时自动初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initI18n);
  } else {
    // DOMContentLoaded 已触发（脚本异步加载时可能发生）
    setTimeout(initI18n, 0);
  }
})();
