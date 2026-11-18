# 安卓打包

`../blockbench` 包含应用使用的 Blockbench 5.2.2 Web 源码。`MainActivity.java` 提供嵌入式 WebView、屏幕方向和安卓系统文件选择。`android-export.js` 将网页下载请求交给 Activity。安装包以内置资源启动，恢复备份保存在本机 IndexedDB。

在 Windows 上按 [项目首页](../README.md#从源码构建) 配置工具链，并运行 `build-apk.ps1`。构建将运行所需资源和第三方许可声明写入 APK。对应源码通过 Release 单独分发。

## 签名

默认使用构建目录中自动生成的本地签名密钥。发布时通过 `-SigningKeystore` 传入发布密钥库，通过 `-SigningKeyAlias` 指定已有密钥别名，并在构建进程中设置 `BOOKBENCH_KEYSTORE_PASSWORD`。密钥库与密钥使用同一密码。覆盖安装更新需要沿用相同的发布密钥。

旧的内部测试版与公开版使用不同的 Android 应用标识。项目迁移使用可编辑的 `.bbmodel` 文件。
