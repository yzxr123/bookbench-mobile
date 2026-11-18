# Bookbench 手机版

面向 Android 的低多边形建模、贴图和动画编辑器，基于 [Blockbench 5.2.2 Web 版](https://github.com/JannisX11/blockbench/tree/v5.2.2) 的非官方移植。内置简体中文和移动端触控界面，建模、打开项目及保存可离线使用。

**[下载最新版 APK](https://github.com/yzxr123/bookbench-mobile/releases/latest)** · [更新记录](CHANGELOG.md) · [问题反馈](https://github.com/yzxr123/bookbench-mobile/issues)

## 安装

在 Release 的附件中下载 `bookbench-mobile-<版本>.apk`。应用支持 Android 8.0 或更新版本，可从 0.1.0 直接覆盖安装。每个 Release 同时提供对应源码 ZIP 和 SHA-256 校验文件。

## 使用

- **调整屏幕方向**。在「文件 → 首选项 → 设置 → 界面 → 屏幕方向」选择跟随系统、竖屏或横屏。
- **保存或分享可编辑模型**。用「文件 → 保存项目」生成 `.bbmodel`。对方可用 Blockbench 或 Bookbench 手机版打开。文件保存在你通过系统文件选择器选定的位置。
- **恢复未保存的项目**。首页的「恢复模型」列出可恢复的项目。编辑期间每 5 分钟更新一次备份，应用进入后台时也会尝试记录。每个项目保留最近一份，超过 3 天的备份会在运行期间或下次启动时清理。

| 用途 | 文件 |
| --- | --- |
| 继续编辑或分享工程 | `.bbmodel` |
| 把实体几何用于 Minecraft 基岩版 | `.geo.json`，另附项目所需的贴图和动画 |

插件商店、在线分享和外部文档需要联网。系统文件选择器使用 Android 的语言设置。

## 从源码构建

在 Windows 上安装 PowerShell 7、Node.js 20 或更新版本、JDK 21、Android SDK Platform 35 和 Build Tools 35.0.0。将 `JAVA_HOME` 设为 JDK 根目录。

```powershell
./android-package/build-apk.ps1 `
  -PlatformJar 'C:/Android/sdk/platforms/android-35/android.jar' `
  -BuildTools 'C:/Android/sdk/build-tools/35.0.0'
```

APK 输出到 `android-package/build/`。签名和打包说明见 [安卓构建文档](android-package/README.md)。

反馈问题时，请附上应用版本、设备或模拟器型号、Android 版本和复现步骤。可按需附上相关截图或测试模型。

## 来源与许可

上游由 Jannis Petersen 和 Blockbench 贡献者维护。移植基于提交 [`c9ace42`](https://github.com/JannisX11/blockbench/commit/c9ace42ef1b770bdadfe656729c7833b8feb37d2)。上游名称和标识用于来源说明。

本项目按 [GNU GPL v3 或更新版本](LICENSE) 分发。安卓封装、简体中文补译、离线恢复和文件保存等修改及日期见 [更新记录](CHANGELOG.md)。
