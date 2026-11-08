# Windows 工作区权限预检

`UNSAFE_PATH` 可能来自私有状态目录、配置文件或任务根目录。2026-11-08 的实机问题是任务根目录多了一条显式访问授权；认证目录本身仍然私有。移除经核实的额外规则后连接恢复。尚未确认重新添加授权的具体进程，预检不等于根治外部权限变化。

本页脚本由这次源码更新提供。已有 windows.6 Release 归档保持原样；请从仓库根目录运行以下命令。使用 Windows PowerShell 5.1，其 .NET ACL 接口与脚本相符；脚本不读取认证令牌、不启动 Desktop、不自动删除锁或停止进程。

## 先只读检查

```powershell
$bridgeConfig = Join-Path $env:USERPROFILE '.dsh-mcp-state/config.json'
# 自定义安装应将上面的值改为 Desktop 插件实际使用的 configFile。
& "$env:SystemRoot/System32/WindowsPowerShell/v1.0/powershell.exe" -NoProfile -NonInteractive `
  -File ./plugins/dsh-desktop/scripts/check-windows-workspace.ps1 -ConfigFile $bridgeConfig
```

输出 JSON 中 `unexpectedAllowRules` 为空表示本次权限检查通过。存在额外规则时返回退出码 2，并列出 SID、权限及是否继承。私有状态/配置不满足要求、路径不正确或存在重解析点时直接停止。受限命令环境可能阻止 PowerShell 加载脚本或访问命名管道，使用客户端正常的权限授权流程执行已授权检查。

## 明确审查后修复

先核实额外规则的来源和用途。脚本不内置作者电脑的 SID，也不自动选中某个账户。确认规则应移除、保存工作并退出 DSH 后，提供你实际审查的 SID：

```powershell
$reviewedSid = '<填写已检查且确认应移除的 SID>'
& "$env:SystemRoot/System32/WindowsPowerShell/v1.0/powershell.exe" -NoProfile -NonInteractive `
  -File ./plugins/dsh-desktop/scripts/check-windows-workspace.ps1 -ConfigFile $bridgeConfig `
  -Repair -ReviewedWorkspaceSid $reviewedSid
```

只有全部额外授权都是该 SID 的显式 Allow 规则时才可修复；继承授权、其他 SID、仍运行的 DSH 或桥接 owner 都会使操作停止。脚本先将原权限描述和目录路径保存到私有状态目录下的 `permission-backups`，然后仅移除匹配规则，复核并保留修改后描述。状态和配置权限不会被修复或放宽。

重新打开 DSH 后，运行 `dsh_connection_info` 或下面的只读检查，再验证新任务。不要把旧的 `ready.json` 或历史验收当成当前连接成功。

```powershell
dsh-desktop-mcp doctor --config $bridgeConfig
```

## 备用调用必须指定配置

源码中的 `dist/call.js` 默认读取当前账号 `.dsh-mcp-state/config.json`。若 Desktop 使用自定义配置，需显式设置环境变量：

```powershell
$env:DSH_DESKTOP_BRIDGE_CONFIG = $bridgeConfig
node ./dist/call.js connection_info
```

不同 MCP 进程的 `--config` 参数不会传给这个备用进程。不要因默认目录不同而新建第二套状态、重置 token 或重新提交结果不确定的任务；仍应保留原 requestId 查询状态。
