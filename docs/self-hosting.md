# Mac mini、Docker 与 NAS 部署

当前实现使用 Node.js 24 原生 SQLite。数据库存放在 Mac 本机 SSD；媒体文件存放在 NAS。新账号默认配额为 1 GiB（1,073,741,824 字节，界面显示为 1 GB），单个音频最大 100 MiB。上传、生成音频、封面和 ABC 文件计入配额；回收站不释放配额，永久删除才释放。发布作品引用原文件，不再复制。

## 首次设置

1. 安装 Node.js 24，执行 `npm ci`。
2. 复制 `.env.example` 为 `.env.local`，填写服务端 API 密钥。该文件不得提交或写入镜像。
3. 确认 NAS 已实际挂载，在 NAS 上创建项目独立目录。
4. 执行 `node scripts/setup-self-hosted.mjs --email 管理员邮箱 --media /NAS/sanzo/media`。
5. 执行 `npm run build`，再执行 `npm run preview`。默认仅监听 127.0.0.1:4173。
6. 打开 `.sanzo-data/admin-setup.txt` 中的链接，设置至少 12 个字符的密码，然后登录。链接有效期 24 小时，使用后失效。

如果初始设置链接过期，Docker 部署执行 `node scripts/invite-docker.mjs 管理员邮箱` 重新生成；纯本机部署执行 `node scripts/invite.mjs 管理员邮箱`。邀请和重设密码不发送邮件；管理员需要私下把链接交给对应用户。链接包含账号设置权限，避免放入公开截图和日志。成功重设密码会撤销该账号的全部登录会话。

管理员在 `/admin/` 创建邀请、启用和停用用户、调整每用户容量。普通用户没有该接口权限。公开注册关闭。密码使用带独立盐的 scrypt；会话令牌只以 SHA-256 摘要保存，Cookie 为 HttpOnly、SameSite=Strict，公网 HTTPS 下使用 Secure。

## 访客访问与精选音乐

默认入口为主页，主页、探索、创作面板、Studio 和训练介绍可直接浏览。创作调用、上传和个人数据仍由服务端验证会话；账号和管理页面需要登录。登录默认返回主页；从创作操作触发登录时，使用仅允许本站路径的 `next` 返回原页面，保留当前文本输入。注册继续采用一次性邀请链接，登录页的“邀请注册”说明不开放自行注册接口。

`GET /api/releases` 以及已发布作品的音频、封面允许访客读取；音频支持 Range 与 HEAD。只能通过已发布记录读取对应素材，`/api/assets/*`、个人草稿及管理接口保持私有。访客云端状态读取遇到 401 时使用临时浏览状态，不自动写入、不显示保存失败或离开页面警告。

探索页的 12 首精选音乐使用 RunningHub YUE2 生成，`dist/community-audio.js` 保存公开发布路径、实际时长及原创歌词；原曲目 ID、封面和专辑引用保留。发布列表排除这些精选引用，避免重复显示。音频保存在 NAS 的常规素材目录，由没有登录能力的 SANZO 精选专用账号持有，沿用配额、发布校验及备份，不占管理员个人空间。歌词没有模型提供的逐句时间标记，界面明确标注位置为估算。

运维时可执行 `node scripts/generate-community.mjs --run` 创建或继续同一批任务，会使用 RunningHub 额度。脚本使用固定提交标识，重新运行复用已有任务；失败或提交状态不明的任务不会自动重复提交。最多并发 3 个任务，生成后写入公开引用清单。然后执行 `node scripts/validate-community-audio.mjs`，在此 Mac 上读取 NAS 音频并使用系统 `afinfo` 验证 MP3 与实际时长，更新清单，再构建部署。恢复时需要同时恢复数据库与 NAS 媒体；只有代码和清单无法恢复音频。

## Docker

此 Mac 使用 Colima 的独立 `sanzo` 配置，并安装了独立的 Homebrew Node.js 24。启动与备份脚本会自动设置所需路径。手动运行 Node/npm 时可先执行 `export PATH="/opt/homebrew/opt/node@24/bin:/opt/homebrew/bin:$PATH"`。新机器安装容器工具可使用 `brew install colima docker docker-compose docker-buildx`。

```sh
colima start sanzo --vm-type vz --cpu 2 --memory 3 --disk 30 \
  --mount /Users/chutzpah/Documents/SanzoMusic:w \
  --mount '/Volumes/elwinrommel_存储空间2/sanzo:w'
```

在被忽略的 `.deploy.env` 设置 `NAS_MEDIA_ROOT`（宿主机媒体绝对路径）、`SANZO_UID` 和 `SANZO_GID`（运行用户的数字 UID/GID）。本机已配置为用户实际值。Compose 使用的外部媒体挂载禁止自动创建源目录。可选 BUILD_PROXY 仅供镜像构建下载依赖使用；此 Mac 已配置为当前 Clash 代理在虚拟机中的地址，构建时需保持代理运行。关闭代理或更换端口时相应更新该参数。

双击 `start-docker.command`，或执行 `node scripts/deploy.mjs`。它先检查 NAS 标识和实际 SMB 挂载，再构建镜像、创建 `sanzo_db` 本地卷。仅在卷里不存在数据库时，从本机数据库的一致性快照初始化；以后更新不覆盖卷内数据。

```sh
DOCKER_CONTEXT=colima-sanzo docker-compose --env-file .deploy.env ps
DOCKER_CONTEXT=colima-sanzo docker-compose --env-file .deploy.env logs --tail=80 app
DOCKER_CONTEXT=colima-sanzo docker-compose --env-file .deploy.env up -d --build --wait
```

应用容器不带 API 密钥、SQLite 文件或媒体。API 密钥通过 `.env.local` 注入；数据库保存在 `sanzo_db` 卷，媒体绑定 NAS。更新、删除和重建应用容器均保留数据。**不要删除 `sanzo_db` 卷。** 此部署只支持一个应用实例，不能对同一数据卷启动多个服务副本。

容器为非 root 用户，根文件系统只读，日志限制为 3×10 MB。健康检查同时验证 SQLite 与 NAS。`restart: unless-stopped` 需要 Docker/Colima 已运行；整机重启后的 Colima 启动和 NAS 自动挂载仍属于宿主机设置。NAS 重新挂载后若容器仍引用旧挂载，需要重建应用容器。

应用容器显式配置主备 DNS，默认 `223.5.5.5` 和 `119.29.29.29`，避免 Colima 的宿主解析配置缺失时，容器内部 DNS 没有外部转发目标而报 `EAI_AGAIN`。可在 `.deploy.env` 通过 `SANZO_DNS_PRIMARY`、`SANZO_DNS_SECONDARY` 替换为当前网络可用的解析器；修改后使用 Compose 重新创建 app 容器即可生效，数据卷和 NAS 保留。网站健康检查只验证数据库与媒体，不能说明外部 AI 接口可达；AI 连接异常时需同时检查容器内 DNS 与供应商接口状态。Docker DNS 设置说明：https://docs.docker.com/reference/compose-file/services/#dns

## NAS 故障

媒体目录必须包含与 `MEDIA_STORAGE_ID` 匹配的 `.sanzo-storage-id`。启动与每次媒体操作都验证此标识。探测最多等待 3 秒，并合并尚未完成的物理探测，避免 NAS 网络中断时反复占用 I/O 线程。NAS 缺失、目录错误或标识不匹配时，不创建替代目录、不向本地静默回退，并拒绝新上传和新生成任务。已有作品记录保留，存储恢复后可重新同步。

媒体使用不可变文件键，完整写入并同步文件和元数据后，才将数据库记录标记为可用；上传失败不发布文件。此方式避免 SMB 经 VirtioFS 挂载时文件重命名后的读取兼容问题。启动时清理中断上传、按实际素材记录重新计算容量，并释放旧同步锁。生成前中断的任务标记为失败，提交结果不明确的任务标记为待核对，不自动重提。已取得任务 ID 的歌曲与封面由后台每 30 秒同步，关闭浏览器后仍会继续保存结果。正式 SQLite 数据库不能放到 SMB 共享目录；数据库的备份可以放在 NAS。

NAS 专用服务账号只应访问项目目录，SMB 凭据交给系统钥匙串/挂载管理，不能写入 Docker 镜像或 Git。

## 备份与恢复

备份包含数据库和所有 ready 素材，使用 SQLite 一致性备份，并为数据库与每个文件记录 SHA-256。未完成的备份没有 `manifest.json`，不能用于恢复。备份会清除登录会话、未完成上传和过期工作锁；恢复后用户重新登录。

为避免长时间数据库锁和媒体删除竞态，生产备份应先停止应用。备份目录必须是新的目录；失败留下的目录保留供排查，不覆盖旧快照。

本机直接运行时：

```sh
node scripts/backup.mjs --to /NAS/sanzo/backups/新的快照目录
node scripts/doctor.mjs
node scripts/restore.mjs --from /NAS/sanzo/backups/某个快照 \
  --data /本机SSD/新的数据库目录 --media /NAS/sanzo/新的媒体目录
```

Docker 备份：双击 `backup-docker.command` 或执行 `npm run storage:backup`。工具先停止 `app`，通过同一数据库卷和媒体挂载生成 NAS 快照，再恢复 app 运行；不会把旧的本机初始化数据库误当成正式数据。执行 `npm run storage:doctor` 检查容器内实际数据库和媒体。不要对活动 SQLite 文件只执行文件复制。

### 自动备份

执行 `npm run storage:backup:install` 安装 macOS 用户级 launchd 任务 `com.sanzo.music.backup`。计划为每天北京时间 04:00；每 15 分钟检查一次漏跑或失败重试，首次安装会立即补跑。一次成功后，本周期的重复检查不再执行备份。用户需要保持 macOS 账号登录，锁屏可以正常运行；Docker/Colima 和 NAS 需要可用。

独立运行文件安装到 `~/Library/Application Support/SanzoMusic/backup-runtime`，状态和日志位于同级的 `backup-state`。任务不依赖 Codex、终端窗口或项目 Documents 目录，也不复制 AI API 密钥。只复制 NAS 位置、存储标识、卷名和运行用户等备份所需配置。修改存储配置或更新备份脚本后，重新执行安装命令同步运行文件。

备份会验证正式容器挂载，使用该容器实际运行的镜像生成快照，然后启动原容器并等待健康；整个过程不构建镜像、不部署新版本、不重建容器。任务正处于 planning/submitting 阶段时会推迟备份。手动备份与自动备份共用进程锁；被强制中断后的恢复记录用于下次运行时恢复暂停的应用。

自动备份保留最近 7 个有成功备份的自然日、最近 4 个自然周的最新快照，按北京时间、周一为一周起点计算。只有带本任务管理标记、属于当前 NAS 存储且具有完成清单的目录才会清理；现有手动备份、未完成备份和其他目录保留。新备份成功且应用恢复健康后才清理旧快照。清理通过 Docker 内的文件系统执行，避免 Mac 直接清理虚拟机刚写入的 SMB 文件时产生占用标记；删除前再次验证目录归属。

```sh
npm run storage:backup:status
npm run storage:backup:uninstall
```

状态包含最近成功时间、备份位置、文件数、字节数、失败原因和下次重试时间。`schedule.log` 保存执行记录并轮换；失败返回非零退出状态并在 15 分钟后重试。旧快照清理会重试 NAS 暂时性文件错误；清理未完成时单独记录警告，不把已成功的新备份改成失败或重复生成整份备份。当前未接入邮件、短信等外部告警，也未配置另一设备上的独立副本。自动化仍使用完整媒体快照，备份期间网站暂停，停机时间随素材量增加而增长。卸载任务不会删除备份。

恢复只允许写入空目录。它先把数据库复制到本机临时目录，验证完整性、外键、文件清单、大小和校验和，再恢复。恢复后将 DATA_DIR、MEDIA_ROOT、MEDIA_STORAGE_ID 指向恢复位置；容器中 DATA_DIR 为 `/data`，MEDIA_ROOT 为 `/media`。先用新的数据卷验证，确认成功后在 `.deploy.env` 中将 SANZO_DB_VOLUME 和 NAS_MEDIA_ROOT 切换到恢复的数据卷与媒体目录；保留原卷和原媒体目录作为回退。数据库卷声明为 external，Compose 的普通容器清理不会删除它。

NAS 上的数据库备份只能防范 Mac 故障，媒体本身仍需要另一份独立备份。两个共享目录如果在同一台 NAS，不算独立备份设备。

## 公网与当前边界

公网需要把 PUBLIC_ORIGIN 设置为唯一 HTTPS 域名，再配置可信代理/隧道。服务用这个固定来源校验 Host 和 Origin，不相信客户端传入的身份头或转发头。不要把数据库、媒体目录或 NAS 管理界面直接映射到公网。

固定 Cloudflare 域名的购买、授权和切换步骤见 [固定域名接入](cloudflare-domain.md)。

本次提供账号、配额、文件存储和容器生命周期；付费模型工作流沿用原实现。生成前要求至少有 8 MiB 剩余空间，这属于预检查，不是对最终文件大小的保证；保存时再次按实际大小原子检查，超限不会突破配额，但可能需要清理空间后重新同步。1 GiB 存储额度不限制 AI 服务消费金额。

## 验证

```sh
npm test
npm run build
node --test tests/self-hosted.test.mjs
```

集成测试覆盖：邀请一次性使用、密码/会话摘要、停用撤销会话、伪造身份头拒绝、管理员权限、HTTPS 来源校验、账号隔离、音频 Range、1 GiB 边界与并发、回收站释放规则、写入中断、媒体目录消失和错误标识、备份恢复及损坏拒绝。设置 SANZO_TEST_ROOT 为 NAS 专用验证目录可在真实 NAS 上测试媒体操作，SQLite 仍位于本机临时目录。断线通过移动项目测试子目录模拟，不卸载整块 NAS。

真实 Docker 与 NAS 验证可执行 `node scripts/validate-container.mjs`。它使用独立测试容器、临时命名卷与 NAS validation 目录，验证非 root 写入、音频 Range、配额拒绝、删除重建容器后保留数据、存储标识失效时拒绝写入、NAS 快照备份，以及恢复到全新卷后的账号、配额和校验和。测试结束后清理本次测试容器和命名卷，最后结果写入 `.sanzo-data/container-validation.json`。

自动备份的隔离验证可执行 `node scripts/validate-backup-automation.mjs`，覆盖真实 NAS 媒体校验和、暂停与恢复原容器、中断恢复记录、错误存储标识失败重试、旧快照清理及同日去重。结果写入 `.sanzo-data/backup-automation-validation.json`；测试不使用正式数据卷。
