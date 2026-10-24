import {readFile, mkdir, open, rename, chmod, rm} from 'node:fs/promises';
import {dirname, resolve, join} from 'node:path';
import {homedir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {CliError} from './errors.mjs';

export function origin(value) {
  let url;
  try { url = new URL(value); } catch { throw new CliError('站点地址必须是完整的 http:// 或 https:// 地址。'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new CliError('站点地址只能包含协议、主机和端口，例如 http://127.0.0.1:4173。');
  }
  return url.origin;
}

export function configPath(options, env) {
  return resolve(options.config || env.SANZO_CONFIG || join(env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'sanzo', 'config.json'));
}

export async function readConfig(path) {
  try {
    const data = JSON.parse(await readFile(path, 'utf8'));
    if (!data || typeof data !== 'object' || Array.isArray(data) || (data.sessions !== undefined && (!data.sessions || typeof data.sessions !== 'object' || Array.isArray(data.sessions)))) throw Error('shape');
    return data;
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw new CliError('无法读取 CLI 配置，请检查 JSON 格式和文件权限。', {code: 'CONFIG'});
  }
}

export async function writeConfig(path, data) {
  await mkdir(dirname(path), {recursive: true, mode: 0o700});
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    const file = await open(temporary, 'wx', 0o600);
    try { await file.writeFile(JSON.stringify(data, null, 2) + '\n'); } finally { await file.close(); }
    await rename(temporary, path);
    await chmod(path, 0o600);
  } finally { await rm(temporary, {force: true}); }
}

export function validateCookie(value) {
  if (typeof value !== 'string' || !value.trim() || /[\r\n\x00-\x1f\x7f]/.test(value) || value.length > 16384 || !value.includes('=')) throw new CliError('Cookie 格式无效；请输入请求的 Cookie 值，不含 Cookie: 前缀。');
  return value.trim();
}
