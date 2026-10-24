import {openAsBlob} from 'node:fs';
import {stat} from 'node:fs/promises';
import {basename, extname} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {CliError, number} from './errors.mjs';
import {saveFile} from './io.mjs';

export class Client {
  constructor({url, cookie, timeout = 180, fetchImpl = fetch, signal}) {
    Object.assign(this, {url, cookie, fetchImpl, signal});
    this.timeout = number(timeout, '--timeout', {min: 1, max: 3600}) * 1000;
  }

  async request(path, {method = 'GET', data, body, headers = {}, raw = false, authenticated = true, timeoutMs, staticAsset = false} = {}) {
    const target = new URL(path, this.url);
    const allowedStatic = staticAsset && method === 'GET' && /^\/(?:covers\/[a-z0-9-]+\.webp|liquid-glass\.png)$/.test(target.pathname);
    if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\') || target.origin !== this.url || !(target.pathname.startsWith('/api/') || target.pathname === '/healthz' || allowedStatic)) throw new CliError('只允许请求当前站点的 /api/ 或 /healthz 接口。');
    const requestHeaders = new Headers(headers);
    requestHeaders.set('Accept', raw ? '*/*' : 'application/json');
    if (authenticated && this.cookie) requestHeaders.set('Cookie', this.cookie);
    if (!['GET', 'HEAD'].includes(method)) requestHeaders.set('Origin', this.url);
    if (data !== undefined) { requestHeaders.set('Content-Type', 'application/json'); body = JSON.stringify(data); }
    const timeoutSignal = AbortSignal.timeout(Math.max(1, Math.min(this.timeout, timeoutMs ?? this.timeout)));
    const signal = this.signal ? AbortSignal.any([timeoutSignal, this.signal]) : timeoutSignal;
    let response;
    try {
      response = await this.fetchImpl(target, {method, headers: requestHeaders, body, signal, redirect: 'manual'});
    } catch {
      if (this.signal?.aborted) throw new CliError('已取消。', {code: 'CANCELLED', exitCode: 130});
      throw new CliError(timeoutSignal.aborted ? '请求超时；提交结果可能已被服务端接收，请使用原 request-key 查询或重试。' : '无法连接站点，请检查地址、网络和服务状态。', {code: timeoutSignal.aborted ? 'TIMEOUT' : 'NETWORK', exitCode: timeoutSignal.aborted ? 6 : 1});
    }
    if (response.status >= 300 && response.status < 400) throw new CliError('站点返回了跳转，请核对最终站点地址或导入浏览器 Cookie。', {code: 'REDIRECT', exitCode: 3, status: response.status});
    if (raw && response.ok) return response;
    let result;
    try { result = await response.json(); } catch {
      throw new CliError('站点未返回 JSON，请检查站点地址、登录或网关配置。', {code: 'RESPONSE', exitCode: 1, status: response.status});
    }
    if (!response.ok) {
      throw new CliError(result.error?.message || `接口请求失败（HTTP ${response.status}）。`, {
        code: result.error?.code || 'HTTP', status: response.status,
        exitCode: [401,403].includes(response.status) ? 3 : response.status === 409 ? 4 : 1,
        details: result.current ? {current: result.current} : undefined
      });
    }
    return raw ? response : result;
  }

  async upload(path, file, {kind, image = false, id} = {}) {
    const info = await stat(file);
    const limit = image ? 8 * 1024 * 1024 : kind === 'upload-abc' ? 200000 : 100 * 1024 * 1024;
    if (!info.isFile() || info.size < 1 || info.size > limit) throw new CliError(`上传文件必须是 1–${limit} 字节的普通文件。`);
    const extension = extname(file).toLowerCase();
    const types = image ? {'.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.webp':'image/webp'} : kind === 'upload-abc' ? {'.abc':'text/plain','.txt':'text/plain','.md':'text/plain'} : {'.mp3':'audio/mpeg','.wav':'audio/wav','.flac':'audio/flac','.m4a':'audio/mp4','.aac':'audio/aac','.ogg':'audio/ogg'};
    if (!types[extension]) throw new CliError(`不支持此扩展名，可用：${Object.keys(types).join(', ')}。`);
    const headers = {'Content-Type': types[extension], 'Content-Length': String(info.size)};
    if (!image) Object.assign(headers, {'X-File-Name': encodeURIComponent(basename(file)), 'X-Asset-Kind': kind});
    const result = await this.request(path, {method: 'PUT', body: await openAsBlob(file, {type: types[extension]}), headers});
    return id ? {...result, id} : result;
  }

  async download(path, output, options) {
    const response = await this.request(path, {raw: true, staticAsset: options?.staticAsset});
    if (!response.body) throw new CliError('下载内容为空。', {code: 'RESPONSE', exitCode: 1});
    return saveFile(output, response.body, {...options, signal: this.signal});
  }

  async editState(namespace, edit) {
    const path = '/api/state/' + namespace;
    const document = await this.request(path);
    const data = structuredClone(document.data || {});
    const value = await edit(data);
    const saved = await this.request(path, {method: 'PUT', data: {data, revision: document.revision}});
    return {revision: saved.revision, ...value};
  }
}

export async function waitFor(client, id, {cover = false, interval = 8, waitTimeout = 1800, progress = () => {}, sleep = delay} = {}) {
  interval = number(interval, '--interval', {min: cover ? 8 : 5, max: 300});
  waitTimeout = number(waitTimeout, '--wait-timeout', {min: 1, max: 86400});
  const deadline = Date.now() + waitTimeout * 1000;
  const path = `/api/${cover ? 'covers' : 'generations'}/${id}/sync`;
  let lastStatus;
  while (Date.now() < deadline) {
    const result = await client.request(path, {method: 'POST', data: {}, timeoutMs: deadline - Date.now()});
    const item = result[cover ? 'cover' : 'job'];
    if (!item || typeof item.status !== 'string') throw new CliError('任务响应格式无效。', {code: 'RESPONSE', exitCode: 1});
    if (item.status !== lastStatus) { progress(`${id}: ${item.status}`); lastStatus = item.status; }
    if (item.status === 'succeeded' || (cover && item.status === 'fallback')) return result;
    if (['failed','unknown'].includes(item.status)) throw new CliError(item.error || `任务状态为 ${item.status}。`, {code: 'JOB_' + item.status.toUpperCase(), exitCode: 5, details: result});
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    await sleep(Math.min(interval * 1000, remaining), undefined, {signal: client.signal});
  }
  throw new CliError('等待超时，后台任务仍可继续；使用 jobs wait 或 covers wait 继续查询。', {code: 'WAIT_TIMEOUT', exitCode: 6, details: {id}});
}
