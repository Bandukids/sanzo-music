# 固定域名接入

自有域名接入采用 Cloudflare 正式命名隧道，应用继续运行在 Mac mini，媒体继续保存在 NAS。本机正式入口为 https://sanzomusic.com，隧道名为 `sanzo-music`；应用只监听本机 4173 端口。

## 用户需要完成的步骤

1. 在 https://domains.cloudflare.com/ 搜索并购买喜欢的域名，核对首次注册价和续费价。账号注册、联系资料和付款由本人在浏览器中完成。
2. 完成邮箱验证，确认域名在自己的 Cloudflare 账号中处于 Active 状态。如果从其他注册商购买，需要将该域名的名称服务器按控制台提示指向 Cloudflare；已有邮件等 DNS 记录应保留。
3. 提供已购买的完整域名，以及希望使用根域名还是 `music` 子域名。无需在聊天中发送 Cloudflare 密码、付款信息或 API Token。
4. 本机运行 `cloudflared tunnel login` 时，在弹出的浏览器中本人登录、选择这个域名并完成授权。

## 后续接入操作

得到真实域名和本机授权后，再进行以下操作，避免对示例域名创建任何资源：

- 创建该项目专用的命名隧道，保存隧道凭据至本机专用目录，权限为 0600。
- 按 `ops/cloudflared.example.yml` 生成真实配置，路由只指向 `http://127.0.0.1:4173`；其他主机名返回 404。不要覆盖已有 DNS 记录。
- 将真实主机名的 CNAME 指向该隧道，并在切换前确认域名、DNS 和 HTTPS 状态。
- 将 `.env.local` 中 PUBLIC_ORIGIN 更新为唯一的 `https://真实主机名`，重新加载应用容器；保留原数据库卷和 NAS 目录。公网切换时应与自动备份互斥执行。
- 配置项目专用 macOS launchd 隧道任务，使用绝对路径和专用日志，自动重连；凭据与真实配置均不写入 Git。
- 在 Cloudflare 的 SSL/TLS → 边缘证书中启用“始终使用 HTTPS”，确认 HTTP 请求 301 跳转到相同路径的 HTTPS 地址。
- 重新验证 HTTPS 登录、Cookie、邀请链接、未登录隔离、音频 Range、上传和下载，再请用户用国内手机流量测试。
- 新入口确认成功后再停止临时隧道。若切换失败，恢复旧 PUBLIC_ORIGIN 和原入口。

域名与隧道的固定关系可以保留；重启后的可用性还取决于 macOS 登录、Colima、应用和 NAS 恢复情况。Cloudflare 的媒体分发条款及上传限制继续适用。

## 正式隧道服务

通过 `cloudflared tunnel login` 授权后，使用官方 CLI 创建隧道和 DNS 路由，不使用覆盖 DNS 的参数：

```sh
cloudflared tunnel create sanzo-music
cloudflared tunnel route dns TUNNEL_UUID example.com
npm run tunnel:install -- --tunnel TUNNEL_UUID --hostname example.com
```

将示例域名替换为自己拥有的域名。安装器验证 UUID、域名及凭据归属，读取 `~/.cloudflared/TUNNEL_UUID.json`，仅复制该隧道凭据至 `~/Library/Application Support/SanzoMusic/cloudflared/credentials.json`。目录权限为 0700，凭据、配置和 plist 为 0600；账号级授权证书不复制到运行目录。已有配置属于其他隧道或域名时拒绝覆盖。

用户级 launchd 任务为 `com.sanzo.music.tunnel`，登录后启动，异常退出自动重启。入口只匹配配置的域名，其他主机名返回 404。配置使用 HTTP/2 和 IPv4 连接 Cloudflare，状态接口只监听 `127.0.0.1:45301`，运行日志位于上述私有目录的 `stdout.log` 与 `stderr.log`。新域名的 Cookie 与临时域名互不通用，用户需要在新入口重新登录。

```sh
launchctl print gui/$(id -u)/com.sanzo.music.tunnel
curl --fail http://127.0.0.1:45301/ready
curl --fail https://example.com/healthz
```

隧道重新连接不会改变域名。此服务不负责启动 Colima 或挂载 NAS；整机重启后仍需要 macOS 用户登录、NAS 挂载及 Colima 正常运行。

官方文档：https://developers.cloudflare.com/tunnel/features/locally-managed-tunnels/create-local-tunnel/

HTTPS 跳转：https://developers.cloudflare.com/ssl/edge-certificates/additional-options/always-use-https/
