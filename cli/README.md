# SANZO Music CLI

使用终端管理 SANZO 网站：创作、语音、Studio、作品与素材、专辑、封面、公开发布和账号管理。基于网站现有 HTTP API，不需要在客户端配置 DeepSeek 或 RunningHub 密钥。

需要 **Node.js 24+**。无第三方运行时依赖。当前版本 `0.1.0`。

## 安装

```sh
# 直接从 GitHub 安装固定版本
npm install -g 'git+https://github.com/Bandukids/sanzo-music.git#sanzo-cli-v0.1.0'

# 或：克隆后安装独立 CLI
git clone https://github.com/Bandukids/sanzo-music.git
cd sanzo-music
npm install -g ./cli

# 或：安装 GitHub Release 附件
npm install -g ./sanzo-music-cli-0.1.0.tgz

sanzo --version
sanzo --help
sanzo songs create --help
```

源码可直接运行 `node cli/bin/sanzo.mjs` 或 `npm run cli -- ...`。CLI 不负责启动网站，使用前需启动自托管服务或连接已有的 SANZO 站点。

## 登录与配置

```sh
sanzo config set-url http://127.0.0.1:4173
sanzo config show

# 首次受邀设置密码（已有密码时跳过）
sanzo auth accept --invite 'http://127.0.0.1:4173/login/#invite=TOKEN'

# 密码交互输入且不回显
sanzo auth login --email you@example.com
sanzo auth status
sanzo auth logout

# 自动化：从秘密文件或密码管理器通过 stdin 传入，避免命令行参数暴露密码
sanzo auth login --email you@example.com --password-stdin < /secure/password.txt
```

自托管服务使用 `/api/auth/login`。Sites 等外部登录托管部署没有此接口：先在浏览器正常登录，再从该站点请求中复制 **Cookie 请求头的值**，通过标准输入导入。不要包含 `Cookie:` 前缀或 `Set-Cookie` 的属性。

```sh
sanzo --url https://music.example.com auth import-cookie --cookie-stdin < /secure/cookie.txt
sanzo --url https://music.example.com account show
```

导入前会用 `/api/account` 验证 Cookie。服务器必须允许带该 Cookie 的非浏览器 API 请求；如果托管平台要求额外认证，应先在平台配置相应访问方式。外部托管会话退出时 CLI 清除本地副本，返回的 `serverSessionRevoked: false` 表示还需在浏览器退出以撤销平台会话。

默认配置为 `~/.config/sanzo/config.json`（遵循 `XDG_CONFIG_HOME`），文件权限 `0600`，目录首次创建为 `0700`。Cookie 按完整站点 origin 隔离，不会发送给其他站点，不跟随 HTTP 跳转，密码不落盘。配置展示不输出 Cookie。`SANZO_COOKIE` 可以临时提供当前站点的 Cookie；退出后请自行从调用环境移除此变量。对外部服务的 API 密钥仍由服务端保管。

优先级：`--url` → `SANZO_URL` → 配置 → `http://127.0.0.1:4173`；`--config` → `SANZO_CONFIG` → 默认路径。站点地址只含协议、域名和端口，不支持路径前缀。

## 歌曲与 ABC

```sh
sanzo models
sanzo assistant brief --text '写一首关于秋夜散步的中文歌曲'
sanzo assistant lyrics --text '雨后的城市' --context '{"styles":"jazz, piano"}'
sanzo assistant styles --text '温暖的民谣'
sanzo assistant translate --text @lyrics.txt --context '{"language":"en"}'
sanzo assistant polish --target lyrics --text @lyrics.txt
sanzo assistant name --text @lyrics.txt

sanzo songs create --model ace-step --title 秋夜 \
  --styles 'warm piano pop' --lyrics @lyrics.txt --bpm 85 --wait
sanzo songs create --model minimax-music --styles 'ambient piano' --instrumental
sanzo songs create --model yue2 --styles 'acoustic folk' --lyrics @lyrics.txt \
  --gender female --language zh --keyscale 'C major' --time-signature 4
sanzo abc create --styles 'gentle piano melody' --instrumental --wait

sanzo jobs list --model yue2-abc
sanzo jobs download JOB_ID --format abc --output score.abc
```

`--styles`、`--lyrics`、`--text` 等文本支持 `@文件`；`-` 从标准输入读取。字符串 JSON、`@文件`、`-` 也可用于 `--data`、`--context` 和 `--emotion`。每次调用的标准输入代表一份内容；不同字段需要不同内容时使用独立文件。

`songs create` 需要曲风以及歌词或 `--instrumental`。AI 灵感、写词和风格命令各自返回结果，选定内容后再提交生成。歌曲时长由服务端 AI 安排，不提供无效的手动时长参数。

## 语音与 Studio

```sh
sanzo speech design --text '欢迎来到 SANZO' --voice deep --title 欢迎词 --wait
sanzo speech design --text @script.txt --description '温暖柔和、吐字清晰的女声'
sanzo voices list
sanzo voices upload reference.wav --name 我的音色
sanzo speech clone --text @script.txt --voice preset:warm --wait
sanzo speech clone --model index-tts --voice UPLOAD_ID --text @script.txt \
  --emotion '[0.5,0,0,0,0,0,0.1,0.3]'
sanzo assistant emotion --text '平静中带一点喜悦'

sanzo assets upload original.mp3 --kind music
sanzo studio analyze --source UPLOAD_ID --wait
sanzo jobs get ANALYSIS_JOB_ID
sanzo jobs download ANALYSIS_JOB_ID --format lyrics --output original-lyrics.txt
sanzo jobs lyrics ANALYSIS_JOB_ID
sanzo studio cover --source UPLOAD_ID --analysis ANALYSIS_JOB_ID \
  --lyrics @new-lyrics.txt --styles 'acoustic jazz' --language zh --wait
sanzo studio convert --kind song --source UPLOAD_ID --voice preset:clear --wait
sanzo studio convert --kind speech --source SPEECH_ASSET_ID --voice MY_VOICE_ID
```

情绪向量顺序为 `[高兴, 愤怒, 悲伤, 恐惧, 反感, 低落, 惊讶, 平静]`，每项 0–1，仅用于 Index TTS。Studio 翻唱需要同一原曲已成功完成的解析任务；不传歌词会生成器乐。克隆与变声参考音频需为 MP3/WAV/FLAC 且小于 32 MB，遵循服务器校验。

## 任务与自动化

```sh
sanzo jobs list --status running
sanzo jobs get JOB_ID
sanzo jobs sync JOB_ID
sanzo jobs wait JOB_ID --interval 8 --wait-timeout 1800
sanzo jobs download JOB_ID --output song.mp3
sanzo jobs save JOB_ID

# 所有当前生成参数都能用 JSON 提交
sanzo jobs create --data @generation.json --wait --json
```

提交返回 `job` 和 `requestKey`。默认立即返回；`--wait` 等待完成。任务间隔至少 5 秒，封面至少 8 秒，默认最长等待 1800 秒。等待超时不会取消后台任务，使用同一任务 ID 继续 `jobs wait` 即可。`jobs save` 显式保存工作区作品，返回可用于专辑的 `draft.id`，重复保存保留用户编辑、回收站状态和封面。

生成和封面提交自动生成 UUID 作为 `requestKey`，普通模式会在发起请求前把它输出到 stderr。可显式传入固定的 `--request-key`（16–100 位字母、数字、下划线、连字符）。JSON 模式下返回值或错误详情也携带此标识。网络超时后保留原标识，使用完全相同的参数重试；CLI 不会自动重复提交计费任务。服务端返回 `unknown` 时先核对上游任务记录。

```sh
sanzo songs create --styles 'piano pop' --lyrics @lyrics.txt \
  --request-key my-song-20261024-0001 --json > job.json
```

## 素材、回收站、工作区与专辑

```sh
sanzo assets list
sanzo assets upload song.mp3 --kind music --name 秋日素材
sanzo assets upload voice.wav --kind speech
sanzo assets upload score.abc                  # 自动识别 ABC / TXT / MD
sanzo assets download ASSET_ID --output copy.mp3
sanzo assets rename ASSET_ID 新的显示名称
sanzo assets trash ASSET_ID
sanzo trash list
sanzo assets restore ASSET_ID
sanzo trash restore DRAFT_OR_ASSET_ID
sanzo trash purge DRAFT_OR_ASSET_ID --yes
sanzo trash empty --yes

sanzo workspaces list
sanzo workspaces create 灵感集
sanzo workspaces rename WORKSPACE_ID 秋天
sanzo workspaces move DRAFT_ID WORKSPACE_ID
sanzo albums list
sanzo albums create 秋日故事 --description '十月的声音'
sanzo albums update ALBUM_ID --title 雨夜
sanzo albums add ALBUM_ID DRAFT_ID
sanzo albums remove ALBUM_ID DRAFT_ID
sanzo albums delete ALBUM_ID --yes
```

上传音频最多 100 MB、乐谱最多 200 KB。`assets list` 列出服务器所有已保存文件，包括回收站文件；回收站状态由 `trash list` 查看。下载默认不覆盖已有文件，显式使用 `--force` 覆盖。下载中断会清理临时文件。上传成功后元数据保存若失败，错误详情会给出已上传 ID；文件仍可通过 `assets list` 访问。

移动到回收站可恢复；`purge`、`empty` 会永久删除文件及相关发布和封面，需 `--yes`。跨工作区和素材元数据的操作按服务器现有接口分步保存；若发生部分成功，错误会说明状态，保留 ID 修复后重试。

## 封面与网站发布

```sh
sanzo covers list
sanzo covers create song JOB_ID --prompt '雨夜的蓝色街道，无文字' --wait
sanzo covers create album ALBUM_ID --wait
sanzo covers upload song JOB_ID cover.png
sanzo covers sync COVER_JOB_ID
sanzo covers wait COVER_JOB_ID
sanzo covers download song JOB_ID --output cover.webp

sanzo releases list
sanzo releases publish JOB_ID
sanzo releases unpublish JOB_ID
sanzo releases download JOB_ID --output public-song.mp3
sanzo releases download JOB_ID --format cover --output public-cover.png
```

封面类型 `song` 的目标 ID 是生成任务 ID，`album` 为专辑 ID。封面服务可能返回 `fallback` 备用图，该状态视为等待完成，并在返回结果中保留状态。网站公开发布仅允许已保存的歌曲，不支持语音；`releases publish` 会使歌曲可被公开访问。

## 管理员与底层状态

```sh
sanzo health
sanzo account show
sanzo account rename 夜间电台
sanzo admin users
sanzo admin invite friend@example.com
sanzo admin user-update USER_ID --enabled false
sanzo admin user-update USER_ID --quota-bytes 2147483648
sanzo admin overview --days 7 --fresh
sanzo admin tasks --status issues --limit 50
sanzo admin events --level error --days 7
sanzo admin export --days 7 --output diagnostics.json

sanzo state get workspace --json > snapshot.json
# edited-data.json 只包含编辑后的 data，revision 使用 snapshot.json 中原始版本
sanzo state put workspace --data @edited-data.json --revision 12
sanzo api GET /api/account
sanzo api POST /api/assistant --data @assistant.json
```

管理员接口和 `/healthz` 仅在自托管 Node 服务提供，权限由服务端检查。`state` 支持 `workspace`、`uploads`、`training`、`explore`、`people`；保存必须显式提供读取到的 revision。版本冲突返回 HTTP 409 和服务器当前状态，不会自动覆盖其他页面编辑。`api` 只访问当前站点 `/api/`，DELETE 需 `--yes`。

## 输出与退出码

成功结果写 stdout，默认缩进 JSON；`--json` 输出紧凑 JSON，错误也为 JSON，写 stderr。进度仅写 stderr；JSON 模式不输出进度。帮助和版本为纯文本。支持 `--timeout` 设置单次请求超时秒数（默认 180，范围 1–3600）。Ctrl+C 终止客户端请求或等待，不取消已经提交的后台任务。

| 退出码 | 含义 |
| --- | --- |
| 0 | 成功 |
| 1 | 网络、HTTP、文件或其他运行错误 |
| 2 | 参数或配置错误 |
| 3 | 登录、权限或登录跳转问题 |
| 4 | 状态版本冲突 |
| 5 | 生成任务失败或提交结果未知 |
| 6 | 请求或等待超时 |
| 130 | 用户取消 |

## 范围与开发

本 CLI 覆盖已接入的服务器功能。播放器、五线谱/简谱视觉预览、浏览器本地 ABC 合成等界面功能仍在网站使用；Woosh 音效与模型训练尚未开放。服务器脚本中的部署、备份、恢复、Cloudflare 隧道和操作系统定时任务不由 HTTP CLI 代管，继续按仓库运维文档操作。

```sh
node --test tests/cli.test.mjs
npm test
mkdir -p output
npm run pack:cli
```

独立包只包含 `bin/`、`lib/` 和说明文档，不包含服务端密钥、会话、本地数据库或私人素材。测试使用临时账号、临时数据库、临时媒体目录与模拟上游，不提交真实付费生成任务。GitHub Actions 在 Linux、macOS 和 Windows 上检查 CLI。
