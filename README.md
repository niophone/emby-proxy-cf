# Emby 优选反代线路管理（单人部署版）

这是一个用于 **Emby 反代线路管理与优选展示** 的小站点，适合自己部署自用。  
它基于 Cloudflare Workers + D1，通过“优选域名”提升 Emby 访问速度。

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/zzzwannasleep/EmbyProxySite)

## 主要功能

- 线路增删改查（访问域名 / 回源域名 / 优选域名）
- 权重排序（权重越高越靠前）
- 启用/停用线路
- 批量整合与卡片式展示
- 一键复制

## 部署前需要准备

- 一个 Cloudflare 账号
- 已安装 `wrangler`（Cloudflare 官方 CLI）

## 一键部署到 Cloudflare

点击上面的 **Deploy to Cloudflare** 按钮即可一键部署（仓库需公开）。部署完成后还需要做两件事：

1. 在 Cloudflare Dashboard 的 Worker 设置中添加 `ADMIN_PASSWORD` 秘钥  
2. 执行数据库迁移（只需一次）

```bash
wrangler d1 migrations apply emby_proxy
```

## 如何使用（域名填写）

进入页面后输入 `ADMIN_PASSWORD` 登录，然后新增线路时请按下面方式填写：

- 访问域名：用户实际访问的域名（建议接入 Cloudflare，指向优选域名）
- 回源域名：你的 Emby 源站域名或 IP（直连源站）
- 优选域名：从下拉选项里选择一个默认优选域名；如果不在列表，选“自定义”并输入

保存后，线路会以卡片形式展示，支持批量整合与批量启用/停用。

## 常见问题

**忘记密码怎么办？**  
重新设置 `ADMIN_PASSWORD` 即可。

