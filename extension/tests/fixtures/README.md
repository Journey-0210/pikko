# 可重复的本地图片 / 视频夹具

在不受扩展安装限制的 Chrome / Edge 中测试。禁止绕过公司管理策略。

从项目根目录运行：

python -m http.server 8769 --bind 127.0.0.1 --directory extension/tests/fixtures

浏览器打开 http://127.0.0.1:8769/ ，确认图片和视频自动出现收藏角标，按页面清单测试；无须逐页启用。此命令从包含 START_HERE.md 的外层 pikko 目录运行；扩展仍加载 extension 子目录。

文件 image.png 与 video.mp4 是本项目自产媒体。验证内容：PNG 可打开、MP4 可离线播放、原文件路径/状态正确、目录授权后可预览。此夹具通过也不能证明真实 BigSpy 下载权限、真实页面的 DOM 适配或付费账户可用。

预期原文件 SHA256 见 SHA256SUMS。浏览器下载可能自动改名，不影响字节校验。
