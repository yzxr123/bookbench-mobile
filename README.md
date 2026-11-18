# 方模编辑器

面向安卓的低多边形建模、贴图和动画编辑器。这是基于 [Blockbench 5.2.2](https://github.com/JannisX11/blockbench/tree/v5.2.2) Web 版的非官方移植，沿用上游编辑器和手机触控界面。

## 下载与使用

1. 从 [Releases](https://github.com/yzxr123/fangmo-editor/releases) 下载 `fangmo-editor-0.1.0.apk`，在 Android 8.0 或更新版本上安装。
2. 在「文件 → 首选项 → 设置 → 界面 → 屏幕方向」选择跟随系统、竖屏或横屏。
3. 通过「文件 → 保存项目」将可编辑的 `.bbmodel` 保存到安卓文件夹。发送这个文件即可让别人用 Blockbench 继续编辑。
4. 需要游戏资源时，使用与模型格式对应的导出菜单。基岩版实体通常需要几何文件 `.geo.json`、贴图，以及项目实际使用的动画文件。

安装包内置编辑器，建模、项目导入和保存可离线使用。插件商店、在线分享和外部文档需要联网。安卓文件选择器的界面语言由系统设置决定。

## 本地自动备份

- 编辑中的未保存项目每 5 分钟更新一份备份。切换项目或应用进入后台时也会尝试写入备份。
- 在首页「恢复模型」打开备份。每个项目保留最近一份快照。
- 快照保留 3 天。到期后会在应用运行或下次启动时清理。手动保存的项目文件独立存放。

首次公开版使用独立的 Android 应用标识。若已在早期测试版中建模，请先保存 `.bbmodel` 文件，然后在公开版里打开该文件。

## 从源码构建

在 Windows 上安装 PowerShell 7、Node.js 20 或更新版本、JDK 21、Android SDK Platform 35 和 Build Tools 35.0.0。将 `JAVA_HOME` 设为 JDK 根目录。

```powershell
./android-package/build-apk.ps1 `
  -PlatformJar 'C:/Android/sdk/platforms/android-35/android.jar' `
  -BuildTools 'C:/Android/sdk/build-tools/35.0.0'
```

APK 输出到 `android-package/build/`。这是使用本地密钥签名的开发构建。发布签名和项目目录见 [安卓打包说明](android-package/README.md)。

## 反馈

在 [Issues](https://github.com/yzxr123/fangmo-editor/issues) 提交问题时，请附上应用版本、设备或模拟器型号、Android 版本和复现步骤。涉及特定模型的截图或文件可按需附上。

## 来源与许可

上游由 Jannis Petersen 及 Blockbench 贡献者维护。移植基于提交 [`c9ace42`](https://github.com/JannisX11/blockbench/commit/c9ace42ef1b770bdadfe656729c7833b8feb37d2)，保留了上游源码和版权声明。上游标识仅用于应用内的来源致谢。

本项目按 [GNU GPL v3 或更新版本](LICENSE) 分发。2026-11-18 的移植与修改包括 Android 封装、文件选择和保存、屏幕方向、离线恢复、简体中文补译，以及运行资源精简。详见 [更新记录](CHANGELOG.md)。每个 APK 的对应源码随 GitHub Release 发布。
