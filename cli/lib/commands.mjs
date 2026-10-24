import {randomUUID} from 'node:crypto';
import {CliError, required, choice, number, identifier} from './errors.mjs';
import {origin, validateCookie, writeConfig} from './config.mjs';
import {stdinText, secret, textInput, jsonInput, saveFile} from './io.mjs';
import {waitFor} from './client.mjs';

const string = description => ({type: 'string', description});
const boolean = description => ({type: 'boolean', description});
const outputOptions = {output: string('保存路径（必填）'), force: boolean('覆盖已有文件')};
const waitOptions = {wait: boolean('等待任务完成'), interval: string('轮询间隔秒数，默认 8'), 'wait-timeout': string('最长等待秒数，默认 1800')};
const submitOptions = {...waitOptions, 'request-key': string('16–100 位幂等提交标识，默认随机 UUID')};
const musicOptions = {
  ...submitOptions, title: string('曲名，留空时服务端自动起名'), styles: string('音乐风格，可用 @文件'),
  lyrics: string('歌词，可用 @文件 或 -'), description: string('创作描述'), instrumental: boolean('纯音乐'),
  gender: string('auto / female / male'), language: string('歌词语言代码，默认 zh'), bpm: string('40–220'),
  keyscale: string('例如 C major'), 'time-signature': string('2 / 3 / 4 / 6'), workspace: string('工作区 ID')
};
const namespaces = ['workspace','uploads','training','explore','people'];
const presetVoices = [
  {id: 'preset:warm', name: '温暖女声'}, {id: 'preset:clear', name: '清澈男声'}, {id: 'preset:narrator', name: '沉稳旁白'}
];
const models = [
  ['ace-step','Songs','ACE-Step-V15-XL'], ['minimax-music','Songs','MiniMax Music 3'], ['yue2','Songs','YUE2'],
  ['yue2-abc','ABC','YUE2 乐谱与音频'], ['qwen-voice-design','Speech','Qwen 音色设计'],
  ['qwen-voice-clone','Speech','Qwen 音色克隆'], ['index-voice-clone','Speech','Index TTS 情绪语音'],
  ['cover-inference','Studio','原曲歌词与 ABC 解析'], ['yue2-cover','Studio','旋律复用翻唱'],
  ['seedvc-speech','Studio','语音变声'], ['seedvc-song','Studio','歌曲变声']
].map(([id, group, name]) => ({id, group, name}));

function checkWait(ctx) {
  if (ctx.options.interval !== undefined) number(ctx.options.interval, '--interval', {min: ctx.command.path.startsWith('covers') ? 8 : 5, max: 300});
  if (ctx.options['wait-timeout'] !== undefined) number(ctx.options['wait-timeout'], '--wait-timeout', {min: 1, max: 86400});
}

function wait(ctx, id, cover = false) {
  return waitFor(ctx.client, identifier(id, '任务 ID', true), {cover, interval: ctx.options.interval,
    waitTimeout: ctx.options['wait-timeout'], progress: ctx.progress, ...(ctx.sleepImpl ? {sleep: ctx.sleepImpl} : {})});
}

function requestKey(ctx, provided) {
  const key = ctx.options['request-key'] || provided || randomUUID();
  if (!/^[a-zA-Z0-9_-]{16,100}$/.test(key)) throw new CliError('request-key 必须为 16–100 位字母、数字、下划线或连字符。');
  ctx.progress('request-key: ' + key);
  return key;
}

async function submit(ctx, payload) {
  checkWait(ctx);
  const key = requestKey(ctx, payload.requestKey);
  try {
    let result = await ctx.client.request('/api/generations', {method: 'POST', data: {...payload, requestKey: key}});
    if (!result.job?.id) throw new CliError('任务响应缺少 ID。', {code: 'RESPONSE', exitCode: 1});
    if (['failed','unknown'].includes(result.job.status)) throw new CliError(result.job.error || '生成任务失败。', {code: 'JOB_' + result.job.status.toUpperCase(), exitCode: 5, details: result});
    if (ctx.options.wait) result = await wait(ctx, result.job.id);
    return {...result, requestKey: key};
  } catch (error) {
    error.details = {...error.details, requestKey: key};
    throw error;
  }
}

async function music(ctx, abc = false) {
  const o = ctx.options;
  const model = abc ? 'yue2-abc' : choice(o.model || 'ace-step', ['ace-step','minimax-music','yue2'], '--model');
  const styles = await textInput(required(o.styles, '--styles'), ctx);
  const lyrics = o.lyrics === undefined ? '' : await textInput(o.lyrics, ctx);
  if (!o.instrumental && !lyrics.trim()) throw new CliError('请提供 --lyrics，或使用 --instrumental。');
  return submit(ctx, {model, type: abc ? 'abc' : 'songs', styles, lyrics, title: o.title || '', description: o.description || '',
    instrumental: !!o.instrumental, gender: choice(o.gender || 'auto', ['auto','female','male'], '--gender'),
    language: o.language || 'zh', requestedBpm: o.bpm === undefined ? null : number(o.bpm, '--bpm', {min: 40, max: 220}),
    keyscale: o.keyscale || '', timesignature: o['time-signature'] === undefined ? '' : choice(o['time-signature'], ['2','3','4','6'], '--time-signature'),
    workspace: o.workspace || (abc ? 'abc' : 'default')});
}

function draftFromJob(job) {
  const input = job.input, analysis = input.model === 'cover-inference';
  const type = analysis || input.model === 'yue2-abc' ? 'abc' : input.type === 'speech' ? 'speech' : 'songs';
  return {id: 'generation-' + job.id, jobId: job.id, type, title: input.title || '未命名作品', kind: job.assetId ? 'generated' : 'draft',
    jobStatus: job.status, jobError: job.error, assetId: job.assetId || null, workspace: input.workspace || (type === 'songs' ? 'default' : type),
    styles: input.coverStyles || input.styles || '', lyrics: input.lyrics || input.structuredLyrics || input.inferredLyrics || '',
    description: input.description || '', art: 'liquid-glass.png', form: {...input, ...(analysis ? {abcFlow: 'score'} : {})}};
}

async function upload(ctx, voice = false) {
  const file = ctx.args[0], o = ctx.options;
  const kind = voice ? 'speech' : o.kind || (/\.(abc|txt|md)$/i.test(file) ? 'abc' : 'music');
  choice(kind, ['music','speech','abc','voice','style'], '--kind');
  const id = identifier(o.id || 'upload-' + randomUUID());
  const result = await ctx.client.upload('/api/assets/' + id, file, {kind: ['voice','style'].includes(kind) ? kind : 'upload-' + kind, id});
  try {
    await ctx.client.editState('uploads', data => {
      data.items ??= [];
      if (!data.items.some(item => item.id === id)) data.items.push({id, ...(o.name ? {name: o.name} : {}), trashed: false});
    });
  } catch (error) {
    error.details = {...error.details, uploaded: result, note: '文件已上传；元数据未保存。可用 assets rename 补充显示名称。'};
    throw error;
  }
  return result;
}

async function recycle(ctx, id, trashed) {
  identifier(id);
  const {assets} = await ctx.client.request('/api/assets');
  const asset = assets.find(item => item.id === id);
  if (!asset) throw new CliError('未找到素材。');
  if (['music','speech'].includes(asset.kind)) {
    const document = await ctx.client.request('/api/state/workspace');
    let draft = document.data?.drafts?.find(d => d.assetId === id);
    if (!draft) {
      const jobId = identifier(id.replace(/^music-/, ''), '生成任务 ID', true);
      draft = draftFromJob((await ctx.client.request('/api/generations/' + jobId)).job);
    }
    await ctx.client.editState('workspace', data => {
      data.drafts ??= [];
      let found = data.drafts.find(d => d.assetId === id);
      if (!found) { found = draft; data.drafts.unshift(found); }
      found.trashed = trashed;
      if (trashed) found.removedAt = Date.now(); else delete found.removedAt;
    });
  }
  // Metadata also drives the reference-voice picker and uploaded-material trash.
  return ctx.client.editState('uploads', data => {
    data.items ??= [];
    let item = data.items.find(a => a.id === id);
    if (!item) { item = {id}; data.items.push(item); }
    item.trashed = trashed;
    if (trashed) item.removedAt = Date.now(); else delete item.removedAt;
    return {id, trashed};
  });
}

async function trashItems(ctx) {
  const workspace = await ctx.client.request('/api/state/workspace');
  const uploads = await ctx.client.request('/api/state/uploads');
  const items = [...(workspace.data?.drafts || []).filter(d => d.trashed).map(d => ({id: d.id, assetId: d.assetId, title: d.title}))];
  for (const item of uploads.data?.items || []) if (item.trashed && !items.some(d => d.assetId === item.id)) items.push({id: item.id, assetId: item.id, title: item.name});
  return {items};
}

async function purge(ctx, id) {
  const items = (await trashItems(ctx)).items;
  const item = items.find(d => d.id === id || d.assetId === id);
  if (!item) throw new CliError('请先将该素材或作品移入回收站。');
  if (item.assetId) {
    try { await ctx.client.request('/api/assets/' + identifier(item.assetId), {method: 'DELETE'}); }
    catch (error) { if (error.status !== 404) throw error; }
  }
  try {
    await ctx.client.editState('workspace', data => {
      const removed = (data.drafts || []).filter(d => d.id === item.id || (item.assetId && d.assetId === item.assetId));
      const ids = new Set(removed.map(d => d.id));
      data.generationSeen = [...new Set([...(data.generationSeen || []), ...removed.map(d => d.jobId).filter(Boolean)])];
      data.drafts = (data.drafts || []).filter(d => !ids.has(d.id));
      for (const album of data.albums || []) album.tracks = (album.tracks || []).filter(track => !ids.has(track));
      data.liked = (data.liked || []).filter(track => !ids.has(track));
    });
    await ctx.client.editState('uploads', data => { data.items = (data.items || []).filter(a => a.id !== item.assetId); });
  } catch (error) {
    error.details = {...error.details, id, fileDeleted: !!item.assetId, note: '文件清理已完成；状态清理发生冲突，可使用同一 ID 再次 purge 完成清理。'};
    throw error;
  }
  return {id, deleted: true};
}

function yes(ctx) { if (!ctx.options.yes) throw new CliError('永久删除需要 --yes。'); }

export function createCommands() {
  const commands = [];
  const add = (path, usage, description, options, handler) => commands.push({path, usage, description, options, handler});
  add('config show', '', '查看站点和配置路径（不输出会话）', {}, async c => ({url: c.url, config: c.configPath, authenticated: !!c.client.cookie}));
  add('config set-url', '<url>', '设置默认站点地址', {}, async c => { c.config.url = origin(c.args[0]); await writeConfig(c.configPath, c.config); return {url: c.config.url}; });
  add('auth login', '--email <email>', '使用自托管账号登录', {email: string('登录邮箱'), 'password-stdin': boolean('从标准输入读取密码')}, async c => {
    const email = required(c.options.email, '--email');
    const password = await secret(c, c.options['password-stdin']);
    const response = await c.client.request('/api/auth/login', {method: 'POST', data: {email, password}, authenticated: false, raw: true});
    const cookie = /(?:^|,\s*)sanzo_session=([A-Za-z0-9_-]{43})(?:;|$)/.exec(response.headers.get('set-cookie') || '')?.[1];
    if (!cookie) throw new CliError('登录成功但未收到会话 Cookie。', {code: 'SESSION', exitCode: 3});
    c.config.sessions ??= {}; c.config.sessions[c.url] = {cookie: 'sanzo_session=' + cookie};
    c.config.url = c.url; await writeConfig(c.configPath, c.config);
    return {loggedIn: true, url: c.url, email};
  });
  add('auth accept', '--invite <url>', '接受一次性邀请并设置密码', {invite: string('完整邀请链接或邀请 token'), 'password-stdin': boolean('从标准输入读取密码')}, async c => {
    let token = required(c.options.invite, '--invite');
    if (/^https?:/.test(token)) {
      const invite = new URL(token);
      if (invite.origin !== c.url) throw new CliError('邀请链接与当前站点不一致；请先设置 --url。');
      token = new URLSearchParams(invite.hash.slice(1)).get('invite');
    }
    if (!/^[A-Za-z0-9_-]{43}$/.test(token || '')) throw new CliError('邀请格式无效。');
    return c.client.request('/api/auth/accept', {method: 'POST', data: {token, password: await secret(c, c.options['password-stdin'])}, authenticated: false});
  });
  add('auth import-cookie', '--cookie-stdin', '导入当前站点的浏览器 Cookie（支持托管站点）', {'cookie-stdin': boolean('从标准输入读取 Cookie')}, async c => {
    if (!c.options['cookie-stdin']) throw new CliError('请使用 --cookie-stdin 从标准输入传入 Cookie。');
    const cookie = validateCookie((await stdinText(c)).replace(/\r?\n$/, ''));
    const previous = c.client.cookie; c.client.cookie = cookie;
    let account;
    try { account = await c.client.request('/api/account'); } catch (error) { c.client.cookie = previous; throw error; }
    c.config.sessions ??= {}; c.config.sessions[c.url] = {cookie}; c.config.url = c.url;
    await writeConfig(c.configPath, c.config);
    return {loggedIn: true, url: c.url, profile: account.profile};
  });
  add('auth status', '', '查看当前账号与容量', {}, c => c.client.request('/api/account'));
  add('auth logout', '', '退出自托管会话并清除本地会话', {}, async c => {
    let serverSessionRevoked = false;
    try { await c.client.request('/api/auth/logout', {method: 'POST', data: {}}); serverSessionRevoked = true; }
    catch (error) { if (![401,404,405].includes(error.status)) throw error; }
    if (c.config.sessions) delete c.config.sessions[c.url];
    await writeConfig(c.configPath, c.config);
    return {loggedOut: true, serverSessionRevoked};
  });
  add('health', '', '检查自托管服务健康状态', {}, c => c.client.request('/healthz', {authenticated: false}));
  add('account show', '', '查看账号、容量与部署类型', {}, c => c.client.request('/api/account'));
  add('account rename', '<name>', '修改账号昵称', {}, c => c.client.request('/api/account', {method: 'PUT', data: {name: c.args[0]}}));
  add('models', '', '列出已接入的模型', {}, async () => ({models, unavailable: ['Sounds / Woosh','模型训练']}));

  const actions = ['polish','polish-song','inspire','styles','lyrics','brief','timing','cover','translate','name','emotion'];
  add('assistant', '<action>', 'AI 写词、翻译、风格、命名与情绪辅助', {kind: string('songs / speech / abc / sounds'), target: string('编辑字段'), text: string('文本、@文件 或 -'), context: string('上下文 JSON 或 @文件')}, async c => {
    const action = choice(c.args[0], actions, 'action');
    const kind = choice(c.options.kind || (action === 'emotion' ? 'speech' : 'songs'), ['songs','speech','abc','sounds'], '--kind');
    const target = c.options.target || (action === 'emotion' ? 'emotion-description' : action === 'name' ? (kind === 'songs' ? 'lyrics' : kind) : ['translate','lyrics'].includes(action) ? 'lyrics' : action === 'cover' ? 'cover' : kind === 'songs' ? 'description' : kind);
    return c.client.request('/api/assistant', {method: 'POST', data: {action, kind, target, text: c.options.text === undefined ? '' : await textInput(c.options.text, c), context: c.options.context ? await jsonInput(c.options.context, c) : {}}});
  });
  add('songs create', '--styles <text> [--lyrics <text> | --instrumental]', '生成歌曲', {...musicOptions, model: string('ace-step / minimax-music / yue2')}, c => music(c));
  add('abc create', '--styles <text> [--lyrics <text> | --instrumental]', '生成 ABC 乐谱与歌曲', musicOptions, c => music(c, true));
  add('speech design', '--text <text>', 'Qwen 音色设计', {...submitOptions, text: string('台词、@文件 或 -'), voice: string('soft / bright / deep / energetic'), description: string('自定义音色描述，可用 @文件'), title: string('作品名')}, async c => submit(c, {
    type: 'speech', speechModel: 'design', model: 'qwen-voice-design', title: c.options.title || '',
    designText: await textInput(required(c.options.text, '--text'), c), designVoice: choice(c.options.voice || 'soft', ['soft','bright','deep','energetic'], '--voice'),
    voiceDescription: c.options.description ? await textInput(c.options.description, c) : ''
  }));
  add('speech clone', '--text <text> --voice <id>', 'Qwen / Index TTS 音色克隆', {...submitOptions, text: string('台词、@文件 或 -'), voice: string('预设或个人素材 ID'), model: string('qwen-tts / index-tts'), emotion: string('八项 0–1 情绪向量的 JSON'), title: string('作品名')}, async c => {
    const ttsModel = choice(c.options.model || 'qwen-tts', ['qwen-tts','index-tts'], '--model');
    if (c.options.emotion && ttsModel !== 'index-tts') throw new CliError('--emotion 需要 --model index-tts。');
    const emotionVector = c.options.emotion ? await jsonInput(c.options.emotion, c) : Array(8).fill(0);
    if (!Array.isArray(emotionVector) || emotionVector.length !== 8 || emotionVector.some(v => typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1)) throw new CliError('情绪向量必须包含 8 项 0–1 数值。');
    return submit(c, {type: 'speech', speechModel: 'tts', ttsModel, model: ttsModel === 'index-tts' ? 'index-voice-clone' : 'qwen-voice-clone',
      title: c.options.title || '', speechText: await textInput(required(c.options.text, '--text'), c), voiceSource: 'library', libraryVoice: required(c.options.voice, '--voice'),
      ...(ttsModel === 'index-tts' ? {emotionVector} : {})});
  });
  add('voices list', '', '列出预设与个人音色参考', {}, async c => {
    const {assets} = await c.client.request('/api/assets');
    const document = await c.client.request('/api/state/uploads');
    return {presets: presetVoices, voices: assets.filter(a => ['speech','upload-speech','voice'].includes(a.kind) && !document.data?.items?.some(i => i.id === a.id && i.trashed))};
  });
  add('voices upload', '<file>', '上传个人音色参考', {id: string('自定义素材 ID'), name: string('显示名称')}, c => upload(c, true));
  add('studio analyze', '--source <asset-id>', '解析原曲歌词与 ABC', {...submitOptions, source: string('原曲素材 ID')}, c => submit(c, {model: 'cover-inference', type: 'analysis', studioTool: 'cover', sourceAsset: identifier(c.options.source, '--source')}));
  add('studio cover', '--source <id> --analysis <job-id>', '复用解析旋律翻唱', {...submitOptions, source: string('原曲素材 ID'), analysis: string('已完成的解析任务 ID'), lyrics: string('新歌词、@文件 或 -，留空生成器乐'), styles: string('新风格，可用 @文件'), language: string('歌词语言代码'), title: string('作品名')}, async c => submit(c, {
    model: 'yue2-cover', type: 'songs', studioTool: 'cover', sourceAsset: identifier(c.options.source, '--source'), analysisJobId: identifier(c.options.analysis, '--analysis', true),
    title: c.options.title || '', language: c.options.language || 'zh', lyrics: c.options.lyrics === undefined ? '' : await textInput(c.options.lyrics, c), styles: c.options.styles ? await textInput(c.options.styles, c) : ''
  }));
  add('studio convert', '--source <id> --voice <id>', 'SeedVC 语音或歌曲变声', {...submitOptions, source: string('原始音频素材 ID'), voice: string('目标音色 ID'), kind: string('speech / song，默认 song'), title: string('作品名')}, c => {
    const kind = choice(c.options.kind || 'song', ['song','speech'], '--kind');
    return submit(c, {model: kind === 'song' ? 'seedvc-song' : 'seedvc-speech', type: kind === 'song' ? 'songs' : 'speech', studioTool: kind,
      sourceAsset: identifier(c.options.source, '--source'), referenceAsset: required(c.options.voice, '--voice'), title: c.options.title || ''});
  });

  add('jobs list', '', '列出最近 100 个生成任务', {status: string('按状态筛选'), model: string('按模型 ID 筛选')}, async c => {
    const {jobs} = await c.client.request('/api/generations');
    return {jobs: jobs.filter(job => (!c.options.status || job.status === c.options.status) && (!c.options.model || job.input.model === c.options.model))};
  });
  add('jobs create', '--data <json|@file|->', '用完整 JSON 提交任意已接入工作流', {...submitOptions, data: string('生成参数 JSON')}, async c => {
    const data = await jsonInput(c.options.data, c);
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new CliError('--data 必须是 JSON 对象。');
    return submit(c, data);
  });
  add('jobs get', '<id>', '查看任务详情与原始结果', {}, c => c.client.request('/api/generations/' + identifier(c.args[0], '任务 ID', true)));
  add('jobs sync', '<id>', '同步一次任务状态', {}, c => c.client.request('/api/generations/' + identifier(c.args[0], '任务 ID', true) + '/sync', {method: 'POST', data: {}}));
  add('jobs wait', '<id>', '等待生成任务完成', {interval: waitOptions.interval, 'wait-timeout': waitOptions['wait-timeout']}, c => wait(c, c.args[0]));
  add('jobs lyrics', '<id>', '重新整理原曲解析的歌词', {}, c => c.client.request('/api/generations/' + identifier(c.args[0], '任务 ID', true) + '/lyrics', {method: 'POST', data: {}}));
  add('jobs download', '<id> --output <file>', '下载音频、ABC 或歌词', {...outputOptions, format: string('audio / abc / lyrics，默认 audio')}, async c => {
    required(c.options.output, '--output');
    const format = choice(c.options.format || 'audio', ['audio','abc','lyrics'], '--format');
    const {job} = await c.client.request('/api/generations/' + identifier(c.args[0], '任务 ID', true));
    if (format === 'audio') {
      if (!job.assetId) throw new CliError('任务尚无已保存音频。');
      return c.client.download('/api/assets/' + identifier(job.assetId), c.options.output, {force: c.options.force});
    }
    const text = format === 'abc' ? job.input.abcNotation : job.input.structuredLyrics || job.input.inferredLyrics || job.input.lyrics;
    if (!text) throw new CliError(`任务暂无 ${format} 内容。`);
    return saveFile(c.options.output, text + '\n', {force: c.options.force});
  });
  add('jobs save', '<id>', '将生成结果保存为网站工作区作品', {}, async c => {
    const {job} = await c.client.request('/api/generations/' + identifier(c.args[0], '任务 ID', true));
    return c.client.editState('workspace', data => {
      data.drafts ??= [];
      const draft = draftFromJob(job), found = data.drafts.find(d => d.jobId === job.id);
      if (found) {
        // Preserve user edits, album references, trash status, and artwork.
        Object.assign(found, {assetId: job.assetId, jobStatus: job.status, jobError: job.error});
        if (job.assetId) found.kind = 'generated';
        found.form ??= {};
        if (job.input.abcNotation && !found.form.abcNotation) found.form.abcNotation = job.input.abcNotation;
        if (!found.lyrics) found.lyrics = draft.lyrics;
      } else data.drafts.unshift(draft);
      return {draft: found || draft};
    });
  });

  add('assets list', '', '列出全部已保存素材', {kind: string('按服务端 kind 筛选')}, async c => {
    const {assets} = await c.client.request('/api/assets');
    return {assets: assets.filter(a => !c.options.kind || a.kind === c.options.kind)};
  });
  add('assets upload', '<file>', '上传歌曲、语音、乐谱或参考素材', {kind: string('music / speech / abc / voice / style'), id: string('自定义素材 ID'), name: string('显示名称')}, c => upload(c));
  add('assets download', '<id> --output <file>', '下载素材文件', outputOptions, c => {
    required(c.options.output, '--output');
    return c.client.download('/api/assets/' + identifier(c.args[0]), c.options.output, {force: c.options.force});
  });
  add('assets rename', '<id> <name>', '修改素材显示名称', {}, async c => {
    const id = identifier(c.args[0]), name = c.args[1];
    if (name.length > 120) throw new CliError('名称不能超过 120 个字符。');
    const {assets} = await c.client.request('/api/assets');
    if (!assets.some(a => a.id === id)) throw new CliError('素材不存在。');
    const result = await c.client.editState('uploads', data => { data.items ??= []; let item = data.items.find(a => a.id === id); if (!item) { item = {id}; data.items.push(item); } item.name = name; return {id, name}; });
    if (assets.some(a => a.id === id && ['music','speech'].includes(a.kind))) {
      await c.client.editState('workspace', data => { const draft = data.drafts?.find(d => d.assetId === id); if (draft) draft.materialName = name; });
    }
    return result;
  });
  add('assets trash', '<id>', '将素材移入回收站', {}, c => recycle(c, c.args[0], true));
  add('assets restore', '<id>', '恢复回收站素材', {}, c => recycle(c, c.args[0], false));
  add('trash list', '', '列出上传素材与生成作品回收站', {}, trashItems);
  add('trash restore', '<id>', '恢复素材或无音频的工作区作品', {}, async c => {
    const item = (await trashItems(c)).items.find(d => d.id === c.args[0] || d.assetId === c.args[0]);
    if (!item) throw new CliError('回收站中未找到此 ID。');
    if (item.assetId) return recycle(c, item.assetId, false);
    return c.client.editState('workspace', data => { const draft = data.drafts.find(d => d.id === item.id); draft.trashed = false; delete draft.removedAt; return {id: item.id, restored: true}; });
  });
  add('trash purge', '<id> --yes', '永久删除回收站中的文件及作品记录', {yes: boolean('确认永久删除')}, c => { yes(c); return purge(c, c.args[0]); });
  add('trash empty', '--yes', '永久清空回收站', {yes: boolean('确认永久删除')}, async c => {
    yes(c); const deleted = [], failed = [];
    for (const item of (await trashItems(c)).items) {
      try { deleted.push(await purge(c, item.id)); } catch (error) { failed.push({id: item.id, message: error.message, details: error.details}); }
    }
    if (failed.length) throw new CliError('部分回收站项目清理失败。', {code: 'PARTIAL', exitCode: 1, details: {deleted, failed}});
    return {deleted};
  });

  add('state get', '<namespace>', '读取带 revision 的云端状态', {}, c => c.client.request('/api/state/' + choice(c.args[0], namespaces, 'namespace')));
  add('state put', '<namespace> --data <json> --revision <n>', '按版本号保存云端状态', {data: string('完整 data JSON、@文件 或 -'), revision: string('读取时的 revision（必填）')}, async c => c.client.request('/api/state/' + choice(c.args[0], namespaces, 'namespace'), {
    method: 'PUT', data: {data: await jsonInput(c.options.data, c), revision: number(required(c.options.revision, '--revision'), '--revision')}
  }));
  add('workspaces list', '', '列出工作区', {}, async c => ({workspaces: (await c.client.request('/api/state/workspace')).data?.workspaces || []}));
  add('workspaces create', '<name>', '创建工作区', {}, c => c.client.editState('workspace', data => {
    data.workspaces ??= [];
    if (data.workspaces.filter(w => !['speech','abc'].includes(w.id)).length >= 20) throw new CliError('最多创建 20 个工作区。');
    const workspace = {id: 'workspace-' + randomUUID(), name: c.args[0]}; data.workspaces.push(workspace); return {workspace};
  }));
  add('workspaces rename', '<id> <name>', '重命名工作区', {}, c => c.client.editState('workspace', data => {
    const workspace = data.workspaces?.find(w => w.id === c.args[0]); if (!workspace) throw new CliError('工作区不存在。'); workspace.name = c.args[1]; return {workspace};
  }));
  add('workspaces move', '<draft-id> <workspace-id>', '移动作品到工作区', {}, c => c.client.editState('workspace', data => {
    if (!['default','speech','abc'].includes(c.args[1]) && !data.workspaces?.some(w => w.id === c.args[1])) throw new CliError('工作区不存在。');
    const draft = data.drafts?.find(d => d.id === c.args[0]); if (!draft) throw new CliError('作品不存在，请先 jobs save。');
    draft.workspace = c.args[1]; if (draft.form) draft.form.workspace = c.args[1]; return {draft};
  }));
  add('albums list', '', '列出专辑', {}, async c => ({albums: (await c.client.request('/api/state/workspace')).data?.albums || []}));
  add('albums create', '<title>', '创建专辑', {description: string('专辑描述')}, c => c.client.editState('workspace', data => {
    data.albums ??= []; const album = {id: 'album-' + randomUUID(), title: c.args[0], description: c.options.description || '', tracks: [], art: 'liquid-glass.png', updated: '刚刚编辑'}; data.albums.unshift(album); return {album};
  }));
  add('albums update', '<id>', '修改专辑标题或描述', {title: string('新标题'), description: string('新描述')}, c => c.client.editState('workspace', data => {
    const album = data.albums?.find(a => a.id === c.args[0]); if (!album) throw new CliError('专辑不存在。');
    if (!c.options.title && c.options.description === undefined) throw new CliError('需要 --title 或 --description。');
    if (c.options.title) album.title = c.options.title; if (c.options.description !== undefined) album.description = c.options.description; return {album};
  }));
  for (const action of ['add','remove']) add('albums ' + action, '<album-id> <draft-id>', action === 'add' ? '将歌曲加入专辑' : '从专辑移除歌曲', {}, c => c.client.editState('workspace', data => {
    const album = data.albums?.find(a => a.id === c.args[0]); if (!album) throw new CliError('专辑不存在。'); album.tracks ??= [];
    if (action === 'add') {
      const draft = data.drafts?.find(d => d.id === c.args[1] && !d.trashed); if (!draft || draft.type && draft.type !== 'songs') throw new CliError('请指定未删除的歌曲作品 ID，必要时先 jobs save。');
      if (!album.tracks.includes(draft.id)) album.tracks.push(draft.id);
    } else album.tracks = album.tracks.filter(id => id !== c.args[1]);
    return {album};
  }));
  add('albums delete', '<id> --yes', '删除专辑记录', {yes: boolean('确认删除专辑')}, c => { yes(c); return c.client.editState('workspace', data => {
    if (!data.albums?.some(a => a.id === c.args[0])) throw new CliError('专辑不存在。'); data.albums = data.albums.filter(a => a.id !== c.args[0]); return {id: c.args[0], deleted: true};
  }); });

  add('covers list', '', '列出所有封面任务', {}, c => c.client.request('/api/covers'));
  add('covers create', '<song|album> <target-id>', '生成或重做封面', {...submitOptions, prompt: string('视觉描述，可用 @文件'), auto: boolean('已有封面时复用')}, async c => {
    checkWait(c); const type = choice(c.args[0], ['song','album'], '封面类型'), id = identifier(c.args[1]); const key = requestKey(c);
    try {
      let result = await c.client.request(`/api/covers/${type}/${id}`, {method: 'POST', data: {requestKey: key, prompt: c.options.prompt ? await textInput(c.options.prompt, c) : '', auto: !!c.options.auto}});
      if (c.options.wait) result = await wait(c, result.cover.id, true);
      return {...result, requestKey: key};
    } catch (error) { error.details = {...error.details, requestKey: key}; throw error; }
  });
  add('covers upload', '<song|album> <target-id> <file>', '上传 JPG / PNG / WebP 封面', {}, c => c.client.upload(`/api/covers/${choice(c.args[0], ['song','album'], '封面类型')}/${identifier(c.args[1])}`, c.args[2], {image: true}));
  add('covers sync', '<id>', '同步一次封面任务', {}, c => c.client.request('/api/covers/' + identifier(c.args[0], '封面任务 ID', true) + '/sync', {method: 'POST', data: {}}));
  add('covers wait', '<id>', '等待封面完成或回退到备用图', {interval: waitOptions.interval, 'wait-timeout': waitOptions['wait-timeout']}, c => wait(c, c.args[0], true));
  add('covers download', '<song|album> <target-id> --output <file>', '下载已保存封面或备用图', outputOptions, async c => {
    required(c.options.output, '--output'); const type = choice(c.args[0], ['song','album'], '封面类型');
    const cover = (await c.client.request('/api/covers')).covers.find(item => item.targetType === type && item.targetId === c.args[1]);
    if (!cover?.art) throw new CliError('未找到封面。');
    return c.client.download(cover.art.startsWith('/') ? cover.art : '/' + cover.art, c.options.output, {force: c.options.force, staticAsset: true});
  });
  add('releases list', '', '浏览最近 100 首公开歌曲', {}, c => c.client.request('/api/releases'));
  add('releases publish', '<job-id>', '发布已生成歌曲到网站探索页', {}, c => c.client.request('/api/releases/' + identifier(c.args[0], '任务 ID', true), {method: 'POST', data: {}}));
  add('releases unpublish', '<job-id>', '取消歌曲发布', {}, c => c.client.request('/api/releases/' + identifier(c.args[0], '任务 ID', true), {method: 'DELETE'}));
  add('releases download', '<job-id> --output <file>', '下载公开歌曲音频或封面', {...outputOptions, format: string('audio / cover，默认 audio')}, c => {
    required(c.options.output, '--output');
    return c.client.download(`/api/releases/${identifier(c.args[0], '任务 ID', true)}/${choice(c.options.format || 'audio', ['audio','cover'], '--format')}`, c.options.output, {force: c.options.force});
  });

  add('admin users', '', '列出站点账号与容量', {}, c => c.client.request('/api/admin/users'));
  add('admin invite', '<email>', '生成 24 小时有效的一次性邀请链接', {}, c => c.client.request('/api/admin/invites', {method: 'POST', data: {email: c.args[0]}}));
  add('admin user-update', '<id>', '调整账号启用状态或容量', {enabled: string('true / false'), 'quota-bytes': string('容量字节数，0–1 TiB')}, c => {
    const data = {};
    if (c.options.enabled !== undefined) data.enabled = choice(c.options.enabled, ['true','false'], '--enabled') === 'true';
    if (c.options['quota-bytes'] !== undefined) data.quotaBytes = number(c.options['quota-bytes'], '--quota-bytes', {max: 1099511627776});
    if (!Object.keys(data).length) throw new CliError('需要 --enabled 或 --quota-bytes。');
    return c.client.request('/api/admin/users/' + identifier(c.args[0], '账号 ID', true), {method: 'PATCH', data});
  });
  const opsOptions = {days: string('时间范围天数'), limit: string('每页条数'), offset: string('分页偏移'), actor: string('账号 ID'), level: string('日志级别'), category: string('日志类别'), status: string('任务状态筛选'), fresh: boolean('刷新健康检查')};
  for (const section of ['overview','events','tasks','export']) add('admin ' + section, '', '查询运行诊断 ' + section, {...opsOptions, ...(section === 'export' ? outputOptions : {})}, async c => {
    const query = new URLSearchParams();
    for (const key of Object.keys(opsOptions)) if (c.options[key] !== undefined) query.set(key, key === 'fresh' ? '1' : c.options[key]);
    const result = await c.client.request('/api/admin/operations/' + section + '?' + query);
    return c.options.output ? saveFile(c.options.output, JSON.stringify(result, null, 2) + '\n', {force: c.options.force}) : result;
  });
  add('api', '<method> <path>', '访问当前站点的其他 API', {data: string('JSON 或 @文件 或 -'), yes: boolean('确认 DELETE 请求'), ...outputOptions}, async c => {
    const method = choice(c.args[0].toUpperCase(), ['GET','POST','PUT','PATCH','DELETE','HEAD'], 'method');
    if (!c.args[1].startsWith('/api/')) throw new CliError('API 路径必须以 /api/ 开头。');
    if (method === 'DELETE') yes(c);
    if (c.options.output && method !== 'GET') throw new CliError('--output 仅用于 GET 下载。');
    if (['GET','HEAD'].includes(method) && c.options.data) throw new CliError('GET / HEAD 不接受 --data。');
    if (c.options.output) return c.client.download(c.args[1], c.options.output, {force: c.options.force});
    if (method === 'HEAD') { const r = await c.client.request(c.args[1], {method, raw: true}); return {status: r.status, headers: Object.fromEntries([...r.headers].filter(([k]) => k !== 'set-cookie'))}; }
    return c.client.request(c.args[1], {method, ...(c.options.data ? {data: await jsonInput(c.options.data, c)} : {})});
  });
  return commands;
}
