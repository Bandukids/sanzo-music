import {requireSignIn,clearAuthSession} from './auth-session.js';
let pending = false;
export const isAssistantBusy = () => pending;
export async function requestAssistant(input) {
  if(!await requireSignIn())throw Error('登录后即可使用 AI 创作。');
  if (pending) throw new Error('请等待当前 AI 任务完成。');
  pending = true;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 55000);
  try {
    const response = await fetch('/api/assistant', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), signal: controller.signal });
    let data;
    try { data = await response.json(); } catch { throw new Error('AI 服务暂不可用，请稍后重试。'); }
    if (!response.ok) {if(response.status===401){clearAuthSession();await requireSignIn();}throw new Error(data.error?.message || 'AI 服务暂不可用，请稍后重试。');}
    if (!data.result || typeof data.result !== 'object') throw new Error('AI 没有返回完整结果，请重试。');
    return data.result;
  } catch (error) {
    if (controller.signal.aborted) throw new Error('AI 响应较慢，请稍后重试。');
    if (error instanceof TypeError) throw new Error('网络连接中断，请稍后重试。');
    throw error;
  } finally { clearTimeout(timer); pending = false; }
}
export async function withAIButton(button, label, task) {
  if (isAssistantBusy() || button.disabled) return;
  const buttons = [...document.querySelectorAll('[data-ai-action]')];
  const states = buttons.map(item => [item, item.disabled]);
  const content = button.innerHTML;
  buttons.forEach(item => { item.disabled = true; });
  button.setAttribute('aria-busy', 'true');
  button.textContent = label;
  try { return await task(); }
  finally {
    button.innerHTML = content;
    button.removeAttribute('aria-busy');
    states.forEach(([item, disabled]) => { item.disabled = disabled; });
  }
}
