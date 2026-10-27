# pikko. 团队交付包

把竞品广告的真实图片、视频和来源资料保存在本地，并用脚本重复执行 BigSpy 竞品采集。

包内两部分可以分开使用：`extension/` 是 pikko 浏览器插件；`automation/` 是使用该插件的 BigSpy 采集脚本。插件无需构建。脚本需要 Node.js、ego-browser、FFmpeg，以及当前浏览器内已登录的 BigSpy。

**公司同事下载：** 登录有权限的 GitHub 账号，进入 [最新内部试用版](https://github.com/Journey-0210/pikko/releases/latest)，下载其中的 `pikko-team` ZIP 并完整解压；也可从仓库首页 Code → Download ZIP 下载源码。私有仓库需要先由仓库管理员授予访问权限。

**同事第一次用：** 完整解压到固定目录，双击 **开始使用.cmd**（或Start-Here.cmd），回答竞品、国家和官网/App链接。装有Codex命令行时，向导会自动启动AI继续配置；没有时，在自己的AI agent中打开这个目录，只说“开始”即可，无需复制说明文件。Agent会主动引导安装、登录和小批次；Node.js未安装时入口会显示安装地址，安装后重新双击。

**已经配置好：** Windows 双击 `automation/Start-BigSpy.cmd`；停止用 `Stop-BigSpy.cmd`。结果摘要在 `automation/last-result.txt`，完整证据由 `last-run.json` 指向。其他系统的命令入口为 `node automation/launch.mjs`，但目前实机验证范围是 Windows，其他系统需另做首次试跑。

| 你要做什么 | 看这里 |
|---|---|
| 安装、首次配置、看结果、换电脑 | [团队使用指南](docs/TEAM_GUIDE.md) |
| 直接复制给 agent 的首次配置、日常执行、换竞品、故障提示词 | [Agent 提示词](docs/AGENT_PROMPTS.md) |
| Agent 的具体操作顺序、配置字段、验收要求 | [Agent 操作手册](docs/AGENT_PLAYBOOK.md) |
| 已验证范围与已知限制 | [版本与验收](docs/RELEASE_NOTES.md) |

当前固定采集流程支持 BigSpy 的 Facebook 和 AdMob（目录名 FB/GG）。国家和行业可配置，但新增国家、行业、品牌都需要先核对页面再试跑。脚本不会自动判断“最好看”或真实转化率，也不会保证凑满目标数量。

插件、脚本和本地数据分别存放：没有团队云同步；分享这个安装包不会分享某人的素材库、登录状态或历史去重。每个人使用自己的本机配置和数据。

独立运行脚本不调用模型 API；AI agent 的安装、配置、研究和故障诊断仍消耗各自使用的模型额度。

本机已完成真实图片/视频保存、解压包运行和新竞品小批次验收；新竞品累计15条真实文件通过验收。当前定位为公司内部试用版：BigSpy偶发504、预览不可用或查询为空时仍可能缺量，每位同事都要先完成自己的环境配置和小批次。详细证据及未测范围见 [交付验证](DELIVERY_VERIFICATION.md)。
