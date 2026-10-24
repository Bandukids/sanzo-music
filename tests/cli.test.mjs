import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, writeFile, stat, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {Readable} from 'node:stream';
import {once} from 'node:events';
import {createServer} from 'node:http';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {run} from '../cli/lib/main.mjs';
import {Client, waitFor} from '../cli/lib/client.mjs';
import {origin, writeConfig} from '../cli/lib/config.mjs';
import {createCommands} from '../cli/lib/commands.mjs';
import {saveFile} from '../cli/lib/io.mjs';
import {initializeMedia} from '../server/file-bucket.mjs';
import {selfHostedStorage} from '../server/self-hosted-storage.mjs';
import {createApp} from '../server/http-app.mjs';
import {createInvite} from '../server/auth.mjs';
import {musicInput} from '../server/generations.mjs';

const execute = promisify(execFile);
const jobId = '11111111-1111-4111-8111-111111111111';
const analysisId = '22222222-2222-4222-8222-222222222222';
const cookieValue = 'sanzo_session=' + 'a'.repeat(43);
const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), {status, headers: {'Content-Type': 'application/json', ...headers}});

async function temporary(t) {
  const root = await mkdtemp(join(tmpdir(), 'sanzo-cli-'));
  t.after(() => rm(root, {recursive: true, force: true}));
  return root;
}

async function invoke(root, args, {input = '', env = {}, ...options} = {}) {
  let out = '', err = '';
  const code = await run(['--config', join(root, 'config.json'), '--json', ...args], {
    env, stdin: Readable.from([input]), stdout: {write: s => { out += s; }}, stderr: {write: s => { err += s; }}, ...options
  });
  return {code, out, err, data: out && !args.includes('--help') ? JSON.parse(out) : undefined, error: code ? JSON.parse(err).error : undefined};
}

test('standalone executable, command discovery and parameter errors', async t => {
  const root = await temporary(t);
  const result = await execute(process.execPath, ['cli/bin/sanzo.mjs', '--help'], {cwd: resolve('.')});
  assert.match(result.stdout, /songs create/);
  for (const command of createCommands()) {
    const help = await invoke(root, [...command.path.split(' '), '--help']);
    assert.equal(help.code, 0, command.path); assert.match(help.out, /选项/);
  }
  for (const args of [['wat'], ['assets','download'], ['health','extra'], ['songs','create','--emtion','bad'], ['health','--lyrics','text'], ['api','DELETE','/api/assets/id']]) {
    const result = await invoke(root, args, {fetchImpl: () => { throw Error('must not fetch'); }});
    assert.equal(result.code, 2, args.join(' ')); assert.equal(result.out, '');
  }
});

test('origin validation, config permissions and origin-isolated cookies', async t => {
  const root = await temporary(t), path = join(root, 'config.json');
  for (const value of ['file:///tmp', 'https://user:password@example.com', 'https://example.com/api', 'https://example.com/?secret=yes', 'https://example.com/#x']) assert.throws(() => origin(value));
  await writeConfig(path, {url: 'https://one.test', sessions: {'https://one.test': {cookie: cookieValue}}});
  if (process.platform !== 'win32') assert.equal((await stat(path)).mode & 0o777, 0o600);
  const requests = [];
  const fetchImpl = async (url, init) => { requests.push({url: String(url), cookie: init.headers.get('Cookie')}); return json({ok: true}); };
  assert.equal((await invoke(root, ['account','show'], {fetchImpl})).code, 0);
  assert.equal((await invoke(root, ['--url','https://two.test','account','show'], {fetchImpl})).code, 0);
  assert.equal(requests[0].cookie, cookieValue); assert.equal(requests[1].cookie, null);
  assert.equal((await invoke(root, ['config','show'])).out.includes(cookieValue), false);
  const config = await invoke(root, ['--url','https://flag.test','config','show'], {env: {SANZO_URL: 'https://env.test'}});
  assert.equal(config.data.url, 'https://flag.test');
  await writeFile(path, '{broken');
  assert.equal((await invoke(root, ['health'])).error.code, 'CONFIG');
});

test('login stores only returned session; password stdin preserves spaces and is not echoed', async t => {
  const root = await temporary(t), password = '  password with spaces  ';
  let seen;
  const result = await invoke(root, ['auth','login','--email','person@example.test','--password-stdin'], {input: password + '\n', fetchImpl: async (url, init) => {
    seen = JSON.parse(init.body); assert.equal(init.headers.get('Origin'), 'http://127.0.0.1:4173');
    return json({ok: true}, 200, {'Set-Cookie': cookieValue + '; Path=/; HttpOnly; SameSite=Strict'});
  }});
  assert.equal(result.code, 0); assert.equal(seen.password, password);
  assert.ok(!result.out.includes(password)); assert.ok(!result.err.includes(password));
  const config = await readFile(join(root, 'config.json'), 'utf8');
  assert.ok(!config.includes(password)); assert.ok(config.includes(cookieValue));
});

test('Cookie import verifies account first, rejects header injection and does not save invalid sessions', async t => {
  const root = await temporary(t);
  const failed = await invoke(root, ['auth','import-cookie','--cookie-stdin'], {input: cookieValue, fetchImpl: async () => json({error: {message: '登录失效。'}}, 401)});
  assert.equal(failed.code, 3);
  await assert.rejects(readFile(join(root, 'config.json')), {code: 'ENOENT'});
  const injection = await invoke(root, ['auth','import-cookie','--cookie-stdin'], {input: 'a=b\r\nHost: evil.test', fetchImpl: () => { throw Error('must not fetch'); }});
  assert.equal(injection.code, 2);
  const ok = await invoke(root, ['--url','https://hosted.test','auth','import-cookie','--cookie-stdin'], {input: 'platform_session=test\n', fetchImpl: async (url, init) => {
    assert.equal(init.headers.get('Cookie'), 'platform_session=test'); return json({profile: {name: 'Tester'}});
  }});
  assert.equal(ok.code, 0); assert.ok(!ok.out.includes('platform_session'));
});

test('transport rejects foreign origins, redirects and path escapes without forwarding cookies', async () => {
  let calls = 0;
  const client = new Client({url: 'https://sanzo.test', cookie: cookieValue, fetchImpl: async (url, init) => {
    calls++; assert.equal(init.redirect, 'manual'); return new Response(null, {status: 302, headers: {Location: 'https://foreign.test'}});
  }});
  for (const path of ['https://evil.test/api/x','//evil.test/api/x','/api/../../outside','/api/..\\outside']) await assert.rejects(client.request(path), /只允许/);
  assert.equal(calls, 0);
  await assert.rejects(client.request('/api/account'), error => error.code === 'REDIRECT' && error.exitCode === 3);
  assert.equal(calls, 1);
});

test('generation commands map to the same validated server inputs as the website', async t => {
  const root = await temporary(t), lyrics = join(root, '歌词.txt'); await writeFile(lyrics, '[Verse]\n窗外的雨');
  const seen = [];
  const fetchImpl = async (url, init) => {
    const payload = JSON.parse(init.body); assert.match(payload.requestKey, /^[\w-]{16,100}$/);
    const normalized = musicInput(payload); seen.push(normalized);
    return json({job: {id: jobId, status: 'queued', input: normalized}});
  };
  const cases = [
    ['songs','create','--styles','piano pop','--lyrics','@' + lyrics,'--bpm','85','--keyscale','C major','--time-signature','4'],
    ['songs','create','--model','minimax-music','--styles','ambient piano','--instrumental'],
    ['songs','create','--model','yue2','--styles','folk','--lyrics','hello'],
    ['abc','create','--styles','piano','--instrumental'],
    ['speech','design','--text','你好','--voice','deep','--title','欢迎'],
    ['speech','clone','--model','qwen-tts','--text','你好','--voice','preset:warm'],
    ['speech','clone','--model','index-tts','--text','你好','--voice','voice-test','--emotion','[0.5,0,0,0,0,0,0,0.1]'],
    ['studio','analyze','--source','source-test'],
    ['studio','cover','--source','source-test','--analysis',analysisId,'--lyrics','新的歌词','--styles','jazz'],
    ['studio','convert','--kind','song','--source','source-test','--voice','preset:clear'],
    ['studio','convert','--kind','speech','--source','source-test','--voice','my-voice']
  ];
  for (const args of cases) assert.equal((await invoke(root, args, {fetchImpl})).code, 0, args.join(' '));
  assert.equal(seen[0].requestedBpm, 85); assert.equal(seen[0].lyrics, '[Verse]\n窗外的雨');
  assert.deepEqual(seen.map(i => i.model), ['ace-step','minimax-music','yue2','yue2-abc','qwen-voice-design','qwen-voice-clone','index-voice-clone','cover-inference','yue2-cover','seedvc-song','seedvc-speech']);
  for (const args of [
    ['songs','create','--styles','pop'], ['songs','create','--styles','pop','--instrumental','--bpm','2'],
    ['speech','clone','--text','你好','--voice','preset:warm','--emotion','[0,0,0,0,0,0,0,0]'],
    ['speech','clone','--model','index-tts','--text','你好','--voice','preset:warm','--emotion','[2]'],
    ['songs','create','--styles','pop','--instrumental','--interval','0']
  ]) assert.equal((await invoke(root, args, {fetchImpl: () => { throw Error('must not fetch'); }})).code, 2);
});

test('assistant actions, payload files and generic API preserve JSON and newlines', async t => {
  const root = await temporary(t), file = join(root, 'data.json');
  await writeFile(file, JSON.stringify({action: 'lyrics', kind: 'songs', text: 'one\ntwo'}));
  const bodies = [];
  const fetchImpl = async (url, init) => { bodies.push(JSON.parse(init.body)); return json({result: {text: 'ok'}}); };
  assert.equal((await invoke(root, ['api','POST','/api/assistant','--data','@' + file], {fetchImpl})).code, 0);
  assert.equal((await invoke(root, ['assistant','translate','--text','-','--context','{"language":"en"}'], {input: '你好\n世界', fetchImpl})).code, 0);
  assert.equal((await invoke(root, ['assistant','emotion','--text','开心'], {fetchImpl})).code, 0);
  assert.equal(bodies[0].text, 'one\ntwo'); assert.equal(bodies[1].text, '你好\n世界');
  assert.equal(bodies[1].target, 'lyrics'); assert.equal(bodies[2].target, 'emotion-description');
  const bytes = Buffer.from('你好世界');
  const splitInput = Readable.from([bytes.subarray(0,1), bytes.subarray(1,5), bytes.subarray(5)]);
  const unicode = await invoke(root, ['assistant','polish','--text','-'], {stdin: splitInput, fetchImpl});
  assert.equal(unicode.code, 0); assert.equal(bodies.at(-1).text, '你好世界');
});

test('ambiguous submissions return their request key and never retry automatically', async t => {
  const root = await temporary(t); let calls = 0;
  const result = await invoke(root, ['songs','create','--styles','piano','--instrumental','--request-key','stable-request-key-0001'], {fetchImpl: async () => { calls++; throw Error('Secret stack or token'); }});
  assert.equal(calls, 1); assert.equal(result.code, 1);
  assert.equal(result.error.details.requestKey, 'stable-request-key-0001'); assert.ok(!result.err.includes('Secret stack'));
  const failed = await invoke(root, ['songs','create','--styles','piano','--instrumental'], {fetchImpl: async () => json({job: {id: jobId, status: 'unknown', error: '请核对上游任务。'}})});
  assert.equal(failed.code, 5); assert.ok(failed.error.details.requestKey);
});

test('wait handles queued/running/succeeded, failures, fallback, deadline and cancellation', async () => {
  let calls = 0;
  const client = new Client({url: 'https://sanzo.test', fetchImpl: async () => json({job: {id: jobId, status: ['queued','running','succeeded'][calls++]}})});
  const progress = [];
  assert.equal((await waitFor(client, jobId, {sleep: async () => {}, progress: s => progress.push(s)})).job.status, 'succeeded');
  assert.equal(progress.length, 3); assert.equal(calls, 3);
  for (const status of ['failed','unknown']) {
    const failing = new Client({url: 'https://sanzo.test', fetchImpl: async () => json({job: {status, error: '任务失败'}})});
    await assert.rejects(waitFor(failing, jobId), error => error.exitCode === 5 && error.details.job.status === status);
  }
  const fallback = new Client({url: 'https://sanzo.test', fetchImpl: async () => json({cover: {status: 'fallback', art: 'covers/lofi.webp'}})});
  assert.equal((await waitFor(fallback, jobId, {cover: true})).cover.status, 'fallback');
  const pending = new Client({url: 'https://sanzo.test', fetchImpl: async () => json({job: {status: 'queued'}})});
  await assert.rejects(waitFor(pending, jobId, {waitTimeout: 1}), error => error.code === 'WAIT_TIMEOUT');
  const controller = new AbortController(); controller.abort();
  const cancelled = new Client({url: 'https://sanzo.test', signal: controller.signal, fetchImpl: async () => { throw Error('abort'); }});
  await assert.rejects(cancelled.request('/api/account'), error => error.exitCode === 130);
});

test('state saves require revision, expose conflicts and never overwrite automatically', async t => {
  const root = await temporary(t); let calls = 0;
  const fetchImpl = async (url, init) => {
    calls++;
    if (init.method === 'GET') return json({revision: 3, data: {workspaces: []}});
    assert.equal(JSON.parse(init.body).revision, 3);
    return json({error: {code: 'CONFLICT', message: '另一页面已更新。'}, current: {revision: 4, data: {workspaces: [{id: 'other'}]}}}, 409);
  };
  const result = await invoke(root, ['workspaces','create','我的作品'], {fetchImpl});
  assert.equal(result.code, 4); assert.equal(result.error.details.current.revision, 4); assert.equal(calls, 2);
  assert.equal((await invoke(root, ['state','put','workspace','--data','{}'], {fetchImpl})).code, 2);
});

test('atomic downloads stream data, reject overwrite and clean partial files on failure', async t => {
  const root = await temporary(t), output = join(root, 'audio.mp3');
  const bytes = Buffer.from([73,68,51,0,1,2,3]);
  const client = new Client({url: 'https://sanzo.test', fetchImpl: async () => new Response(bytes)});
  await client.download('/api/assets/test', output);
  assert.deepEqual(await readFile(output), bytes);
  await assert.rejects(client.download('/api/assets/test', output), error => error.code === 'FILE_EXISTS');
  await saveFile(output, 'replacement', {force: true}); assert.equal(await readFile(output, 'utf8'), 'replacement');
  const broken = new ReadableStream({start(controller) { controller.enqueue(bytes); controller.error(Error('interrupted')); }});
  await assert.rejects(saveFile(join(root, 'broken.mp3'), broken));
  await assert.rejects(stat(join(root, 'broken.mp3')), {code: 'ENOENT'});
  const {readdir} = await import('node:fs/promises'); assert.ok(!(await readdir(root)).some(f => f.endsWith('.part')));
});

test('fallback cover downloads allow only known same-origin static assets', async t => {
  const root = await temporary(t), output = join(root, 'cover.webp');
  const calls = [];
  const result = await invoke(root, ['covers','download','song',jobId,'--output',output], {fetchImpl: async url => {
    calls.push(String(url));
    return new URL(url).pathname === '/api/covers' ? json({covers: [{targetType: 'song', targetId: jobId, art: 'covers/lofi.webp'}]}) : new Response('webp');
  }});
  assert.equal(result.code, 0); assert.equal(await readFile(output, 'utf8'), 'webp'); assert.match(calls[1], /\/covers\/lofi.webp$/);
  const client = new Client({url: 'https://sanzo.test'});
  await assert.rejects(client.request('/.env', {staticAsset: true}), /只允许/);
});

test('real HTTP server: invitation, login, quota, uploads, state, speech job, albums, covers, releases, trash and admin', async t => {
  const root = await temporary(t), media = join(root, 'media');
  const marker = await initializeMedia(media);
  const env = await selfHostedStorage({DATA_DIR: join(root, 'db'), MEDIA_ROOT: media, MEDIA_STORAGE_ID: marker});
  env.RUNNINGHUB_CN_API_KEY = 'test-only-not-a-real-api-key';
  let upstreamSubmissions = 0;
  const app = createServer();
  app.listen(0, '127.0.0.1'); await once(app, 'listening');
  const url = 'http://127.0.0.1:' + app.address().port;
  const requestApp = createApp(env, {origin: url, root: resolve('dist'), fetchImpl: async url => {
    if (url.endsWith('/ai-app/run')) { upstreamSubmissions++; return json({code: 0, data: {taskId: 'mock-task-' + upstreamSubmissions}}); }
    if (url.endsWith('/openapi/v2/query')) return json({status: 'SUCCESS', results: [{nodeId: '17', url: 'https://mock-audio.test/result.mp3'}]});
    if (url === 'https://mock-audio.test/result.mp3') return new Response(new Uint8Array([73,68,51,0,1]));
    throw Error('Unexpected external request: ' + url);
  }});
  app.on('request', requestApp.listeners('request')[0]);
  await writeConfig(join(root, 'config.json'), {url});
  const fetchImpl = fetch;
  t.after(async () => { app.closeAllConnections(); await new Promise(resolveClose => app.close(resolveClose)); await env.runtime.dispose(); });
  const cli = async (args, extra) => {
    const result = await invoke(root, args, {fetchImpl, ...extra});
    assert.equal(result.code, 0, args.join(' ') + ': ' + result.err);
    return result.data;
  };
  const invite = await createInvite(env.DB, 'cli@example.test', {role: 'admin'}), password = 'test-only-long-password-2026';
  await cli(['auth','accept','--invite',invite.token,'--password-stdin'], {input: password});
  await cli(['auth','login','--email','cli@example.test','--password-stdin'], {input: password});
  assert.equal((await cli(['account','show'])).profile.email, 'cli@example.test');
  await cli(['account','rename','命令行音乐人']); assert.equal((await cli(['auth','status'])).profile.name, '命令行音乐人');
  assert.equal((await cli(['health'])).ok, true);
  const abc = join(root, '旋律.abc'); await writeFile(abc, 'X:1\nT:测试\nM:4/4\nL:1/4\nK:C\nC D E F|');
  const uploaded = await cli(['assets','upload',abc,'--name','测试乐谱']);
  const downloaded = join(root, 'copy.abc'); await cli(['assets','download',uploaded.id,'--output',downloaded]);
  assert.deepEqual(await readFile(downloaded), await readFile(abc));
  await cli(['assets','rename',uploaded.id,'旋律收藏']);
  const denied = await invoke(root, ['api','DELETE','/api/assets/' + uploaded.id,'--yes'], {fetchImpl}); assert.equal(denied.code, 4);
  const workspace = (await cli(['workspaces','create','播客'])).workspace;
  await cli(['workspaces','rename',workspace.id,'声音工作区']);
  const job = (await cli(['speech','design','--text','你好 SANZO','--title','欢迎','--voice','deep','--request-key','integration-speech-0001'])).job;
  assert.equal(job.status, 'queued');
  const duplicate = await cli(['speech','design','--text','你好 SANZO','--title','欢迎','--voice','deep','--request-key','integration-speech-0001']);
  assert.equal(duplicate.job.id, job.id); assert.equal(upstreamSubmissions, 1);
  assert.equal((await cli(['jobs','wait',job.id])).job.status, 'succeeded');
  const song = join(root, 'voice.mp3'); await cli(['jobs','download',job.id,'--output',song]);
  assert.deepEqual([...await readFile(song)], [73,68,51,0,1]);
  const draft = (await cli(['jobs','save',job.id])).draft;
  await cli(['assets','rename','music-' + job.id,'我的配音']);
  await cli(['jobs','save',job.id]);
  assert.equal((await cli(['state','get','workspace'])).data.drafts[0].materialName, '我的配音');
  await cli(['workspaces','move',draft.id,workspace.id]);
  const album = (await cli(['albums','create','声音日记'])).album;
  await cli(['albums','update',album.id,'--description','十月']);
  const speechPublish = await invoke(root, ['releases','publish',job.id], {fetchImpl}); assert.equal(speechPublish.code, 1);
  // Seed a completed song without executing a paid music workflow.
  const input = JSON.stringify({model: 'ace-step', type: 'songs', title: '模拟歌曲', lyrics: '你好', styles: 'piano', duration: 90});
  await env.DB.prepare('UPDATE generations SET input=? WHERE id=?').bind(input, job.id).run();
  await cli(['jobs','save',job.id]);
  // Preserve user edits, while allowing the first speech draft to be reused as a song in this fixture.
  const state = await cli(['state','get','workspace']); state.data.drafts.find(d => d.id === draft.id).type = 'songs';
  await cli(['state','put','workspace','--data',JSON.stringify(state.data),'--revision',String(state.revision)]);
  await cli(['albums','add',album.id,draft.id]);
  assert.deepEqual((await cli(['albums','list'])).albums[0].tracks, [draft.id]);
  const image = join(root, 'cover.png'); await writeFile(image, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN1sAAAAASUVORK5CYII=', 'base64'));
  await cli(['covers','upload','song',job.id,image]);
  const cover = join(root, 'saved.png'); await cli(['covers','download','song',job.id,'--output',cover]);
  assert.deepEqual(await readFile(cover), await readFile(image));
  assert.equal((await cli(['releases','publish',job.id])).published, true);
  assert.equal((await cli(['releases','list'])).tracks.length, 1);
  assert.equal((await cli(['releases','unpublish',job.id])).published, false);
  await cli(['assets','trash','music-' + job.id]);
  assert.ok((await cli(['trash','list'])).items.some(item => item.assetId === 'music-' + job.id));
  await cli(['trash','restore',draft.id]);
  await cli(['assets','trash',uploaded.id]);
  await cli(['assets','restore',uploaded.id]);
  await cli(['assets','trash',uploaded.id]);
  const guarded = await invoke(root, ['trash','purge',uploaded.id], {fetchImpl}); assert.equal(guarded.code, 2);
  await cli(['trash','purge',uploaded.id,'--yes']);
  assert.ok(!(await cli(['assets','list'])).assets.some(a => a.id === uploaded.id));
  await cli(['assets','trash','music-' + job.id]);
  await cli(['trash','empty','--yes']); assert.deepEqual((await cli(['trash','list'])).items, []);
  assert.deepEqual((await cli(['albums','list'])).albums[0].tracks, []);
  const user = (await cli(['admin','users'])).users[0];
  await cli(['admin','user-update',user.id,'--quota-bytes','2147483648']);
  assert.equal((await cli(['account','show'])).storage.limit, 2147483648);
  assert.ok((await cli(['admin','invite','friend@example.test'])).url.includes('#invite='));
  await cli(['admin','overview']); await cli(['admin','events','--level','error']); await cli(['admin','tasks']);
  await cli(['admin','export','--output',join(root, 'diagnostics.json')]);
  assert.ok(JSON.parse(await readFile(join(root, 'diagnostics.json'), 'utf8')).overview);
  await cli(['albums','delete',album.id,'--yes']);
  assert.equal((await cli(['auth','logout'])).serverSessionRevoked, true);
  assert.equal((await invoke(root, ['account','show'], {fetchImpl})).code, 3);
});
