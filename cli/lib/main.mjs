import {parseArgs} from 'node:util';
import {Client} from './client.mjs';
import {CliError} from './errors.mjs';
import {origin, configPath, readConfig, validateCookie} from './config.mjs';
import {createCommands} from './commands.mjs';

export const VERSION = '0.1.0';
const globalOptions = {
  help: {type: 'boolean', short: 'h', description: '显示帮助'},
  version: {type: 'boolean', short: 'v', description: '显示版本'},
  url: {type: 'string', description: '站点地址（优先于 SANZO_URL 和配置）'},
  config: {type: 'string', description: '配置路径（优先于 SANZO_CONFIG）'},
  json: {type: 'boolean', description: '紧凑 JSON 输出及结构化错误'},
  timeout: {type: 'string', description: '单次请求超时秒数，默认 180'}
};

export function help(commands, command, prefix = '') {
  let text = command ? `sanzo ${command.path} ${command.usage}\n${command.description}\n` : `SANZO Music CLI ${VERSION}\n用法：sanzo <命令> [选项]\n`;
  if (!command) {
    text += '\n命令：\n';
    for (const item of commands.filter(c => !prefix || c.path.startsWith(prefix + ' ') || c.path === prefix)) text += `  ${item.path.padEnd(23)} ${item.description}\n`;
  }
  text += '\n选项：\n';
  for (const [name, spec] of Object.entries({...globalOptions, ...command?.options})) text += `  --${name}${spec.type === 'string' ? ' <value>' : ''}\t${spec.description}\n`;
  text += '\n文本支持 @文件 和 -（标准输入）。详细文档：cli/README.md\n';
  return text;
}

export async function run(argv, {env = process.env, stdin = process.stdin, stdout = process.stdout, stderr = process.stderr, fetchImpl = fetch, sleepImpl, signal} = {}) {
  const commands = createCommands();
  let options = {json: argv.includes('--json')};
  try {
    const allOptions = {...globalOptions};
    for (const command of commands) Object.assign(allOptions, command.options);
    let parsed;
    try { parsed = parseArgs({args: argv, options: allOptions, allowPositionals: true, strict: true, allowNegative: false}); }
    catch (error) { throw new CliError(error.message); }
    options = parsed.values;
    if (options.version) { stdout.write(VERSION + '\n'); return 0; }
    let positionals = parsed.positionals;
    if (positionals[0] === 'help') { options.help = true; positionals = positionals.slice(1); }
    const command = [...commands].sort((a,b) => b.path.split(' ').length - a.path.split(' ').length)
      .find(c => c.path.split(' ').every((part, index) => part === positionals[index]));
    const prefix = positionals.join(' ');
    if (options.help || !positionals.length) {
      if (prefix && !command && !commands.some(c => c.path.startsWith(prefix + ' '))) throw new CliError('未知命令：' + prefix);
      stdout.write(help(commands, command, prefix)); return 0;
    }
    if (!command) throw new CliError('未知命令；使用 sanzo --help 查看。');
    for (const name of Object.keys(options)) if (!Object.hasOwn(globalOptions, name) && !Object.hasOwn(command.options, name)) throw new CliError(`sanzo ${command.path} 不支持 --${name}。`);
    const args = positionals.slice(command.path.split(' ').length);
    // Positional arguments appear before options in every registered usage.
    const positionalUsage = command.usage.split(' --')[0];
    const count = (positionalUsage.startsWith('--') ? [] : positionalUsage.match(/<[^>]+>/g) || []).length;
    if (args.length !== count) throw new CliError(`用法：sanzo ${command.path} ${command.usage}`);
    const path = configPath(options, env), config = await readConfig(path);
    const url = origin(options.url || env.SANZO_URL || config.url || 'http://127.0.0.1:4173');
    const cookie = env.SANZO_COOKIE || config.sessions?.[url]?.cookie;
    const client = new Client({url, cookie: cookie ? validateCookie(cookie) : undefined, timeout: options.timeout, fetchImpl, signal});
    const result = await command.handler({options, args, command, configPath: path, config, url, client, stdin, stdout, stderr, signal, sleepImpl,
      progress: message => { if (!options.json) stderr.write(message + '\n'); }});
    stdout.write(JSON.stringify(result ?? {ok: true}, null, options.json ? 0 : 2) + '\n');
    return 0;
  } catch (error) {
    const cancelled = signal?.aborted;
    const exitCode = cancelled ? 130 : error.exitCode || 1;
    // Do not echo arbitrary exceptions, URLs, cookies, passwords or response bodies.
    const message = cancelled ? '已取消。' : error instanceof CliError ? error.message : '操作失败，请检查文件路径、权限和网络连接。';
    const payload = {error: {code: cancelled ? 'CANCELLED' : error.code || 'INTERNAL', message,
      ...(error.status ? {status: error.status} : {}), ...(error.details ? {details: error.details} : {})}};
    stderr.write(options.json ? JSON.stringify(payload) + '\n' : `${message}\n${error.details ? JSON.stringify(error.details, null, 2) + '\n' : ''}`);
    return exitCode;
  }
}
