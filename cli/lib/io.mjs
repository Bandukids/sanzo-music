import {readFile, mkdir, open, link, rename, rm} from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {randomUUID} from 'node:crypto';
import {StringDecoder} from 'node:string_decoder';
import {CliError, required} from './errors.mjs';

export async function stdinText(ctx) {
  if (ctx.stdin.isTTY) throw new CliError('此选项需要通过标准输入传入内容。');
  if (ctx.stdinValue === undefined) {
    let text = '';
    const decoder = new StringDecoder('utf8');
    for await (const chunk of ctx.stdin) {
      text += typeof chunk === 'string' ? chunk : decoder.write(Buffer.from(chunk));
      if (Buffer.byteLength(text) > 1500000) throw new CliError('标准输入超过 1.5 MB。');
    }
    ctx.stdinValue = text + decoder.end();
  }
  return ctx.stdinValue;
}

export async function textInput(value, ctx) {
  required(value, '文本或 @文件');
  if (value === '-') return stdinText(ctx);
  return value.startsWith('@') ? readFile(value.slice(1), 'utf8') : value;
}

export async function jsonInput(value, ctx) {
  const text = await textInput(value, ctx);
  try { return JSON.parse(text); } catch { throw new CliError('JSON 格式无效。'); }
}

export async function secret(ctx, fromStdin) {
  if (fromStdin) {
    // Remove only the line ending: spaces can be part of a password.
    return (await stdinText(ctx)).replace(/\r?\n$/, '');
  }
  if (!ctx.stdin.isTTY || !ctx.stdin.setRawMode) throw new CliError('非交互登录请使用 --password-stdin。');
  ctx.stderr.write('密码：');
  const rawBefore = ctx.stdin.isRaw;
  ctx.stdin.setRawMode(true);
  ctx.stdin.resume();
  return new Promise((resolveSecret, reject) => {
    let value = '';
    const cleanup = () => {
      ctx.stdin.off('data', data);
      ctx.signal?.removeEventListener('abort', abort);
      ctx.stdin.setRawMode(rawBefore);
      ctx.stdin.pause();
      ctx.stderr.write('\n');
    };
    const abort = () => { cleanup(); reject(new CliError('已取消。', {code: 'CANCELLED', exitCode: 130})); };
    const data = chunk => {
      for (const character of chunk.toString('utf8')) {
        if (character === '\u0003' || character === '\u0004') return abort();
        if (character === '\r' || character === '\n') { cleanup(); resolveSecret(value); return; }
        if (character === '\u007f' || character === '\b') value = [...value].slice(0, -1).join('');
        else if (character >= ' ') value += character;
      }
    };
    ctx.stdin.on('data', data);
    ctx.signal?.addEventListener('abort', abort, {once: true});
    if (ctx.signal?.aborted) abort();
  });
}

export async function saveFile(path, source, {force = false, signal} = {}) {
  const output = resolve(required(path, '--output'));
  await mkdir(dirname(output), {recursive: true});
  const temporary = `${output}.${randomUUID()}.part`;
  try {
    const file = await open(temporary, 'wx', 0o600);
    try {
      if (typeof source === 'string') await file.writeFile(source);
      else await pipeline(Readable.fromWeb(source), createWriteStream(temporary, {fd: file.fd, autoClose: false}), {signal});
    } finally { await file.close(); }
    if (force) await rename(temporary, output);
    else await link(temporary, output); // Atomic no-clobber, including simultaneous downloads.
    return {output};
  } catch (error) {
    if (error.code === 'EEXIST') throw new CliError('目标文件已存在；使用 --force 覆盖。', {code: 'FILE_EXISTS'});
    throw error;
  } finally { await rm(temporary, {force: true}); }
}
