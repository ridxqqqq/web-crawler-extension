/* 网络爬虫 — 后台 Service Worker
 * 负责快捷键 Ctrl+Shift+X：向当前标签页注入 lib.js 与 panel.js（panel.js 自带开关逻辑）。
 * 注入失败时用扩展图标角标给出短暂提示（受限页面无法注入是浏览器安全限制）。
 */
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'toggle-panel') return;
  let tab = null;
  try {
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || typeof tab.id !== 'number') return;
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['lib.js'] });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['panel.js'] });
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    console.warn('[网络爬虫] 注入失败:', msg);
    badgeFail(tab && tab.id, msg);
  }
});

function badgeFail(tabId, message) {
  if (typeof tabId !== 'number') return;
  try {
    chrome.action.setBadgeBackgroundColor({ color: '#c0392b' });
    chrome.action.setBadgeText({ tabId: tabId, text: '✕' });
    setTimeout(() => {
      chrome.action.setBadgeText({ tabId: tabId, text: '' }).catch(() => { });
    }, 2500);
  } catch (e) { }
  // 方便排查：受限页面类型
  if (/chrome-extension:\/\/ URL/i.test(message)) {
    console.info('[网络爬虫] 当前标签页属于其他扩展（如内置 PDF 查看器），浏览器禁止注入。');
  }
}
