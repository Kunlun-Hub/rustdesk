# RustDesk 自定义客户端与本地构建

本文以 Windows 本地环境为主，说明如何基于本仓库构建 RustDesk Flutter 桌面版，并做常见的自定义客户端修改。

仓库根目录示例：

```powershell
cd F:\rustdesk\rustdesk
```

## 1. 构建前准备

需要安装：

- Visual Studio Build Tools，并勾选 **Desktop development with C++**
- Rust，建议使用项目 CI 中的版本：`1.75`
- Flutter `3.24.5`
- Python 3
- LLVM/Clang
- vcpkg

初始化子模块：

```powershell
cd F:\rustdesk\rustdesk
git submodule update --init --recursive
```

## 2. 安装 vcpkg 依赖

安装 vcpkg：

```powershell
cd C:\
git clone https://github.com/microsoft/vcpkg
cd C:\vcpkg
git checkout 120deac3062162151622ca4860575a33844ba10b
.\bootstrap-vcpkg.bat
$env:VCPKG_ROOT="C:\vcpkg"
```

安装 RustDesk 依赖：

```powershell
cd F:\rustdesk\rustdesk
$env:VCPKG_ROOT="C:\vcpkg"
C:\vcpkg\vcpkg.exe install --triplet x64-windows-static --x-install-root="C:\vcpkg\installed"
```

如果后续打开新的 PowerShell 窗口，需要重新设置：

```powershell
$env:VCPKG_ROOT="C:\vcpkg"
```

也可以写入用户环境变量：

```powershell
[Environment]::SetEnvironmentVariable("VCPKG_ROOT", "C:\vcpkg", "User")
```

## 3. 构建 Windows Flutter 版

推荐使用仓库自带的 `build.py`，这也是 CI 中 Windows Flutter 版的主要构建入口。

```powershell
cd F:\rustdesk\rustdesk
python .\build.py --portable --hwcodec --flutter --vram --skip-portable-pack
```

如果需要直接把 `ID Server`、`API Server`、连接公钥和中继列表接口写入构建产物，可以在构建时传入：

```powershell
python .\build.py --portable --hwcodec --flutter --vram --skip-portable-pack `
  --id-server your-hbbs.example.com `
  --api-server https://api-server.example.com `
  --key your-hbbs-public-key `
  --relay-server relay-a.example.com,relay-b.example.com
```

其中 `--relay-server` 仅作为接口不可用时的 fallback 列表；如果不显式传 `--relay-api-url`，构建脚本会默认把中继列表地址固定为：

```text
https://api-server.example.com/relay/list.json
```

客户端启动后会定期读取这个地址刷新中继列表，而不是把 relay 地址写死到单个包里。

如果你更希望直接使用一个独立脚本，也可以运行仓库根目录新增的：

```powershell
.\build_custom_client.ps1 `
  -IdServer your-hbbs.example.com `
  -ApiServer https://api-server.example.com `
  -Key your-hbbs-public-key `
  -RelayServer relay-a.example.com,relay-b.example.com
```

脚本会自动把 relay 列表接口补全为：

```text
https://api-server.example.com/relay/list.json
```

如果需要覆盖默认地址，可额外传入 `-RelayApiUrl`。

构建产物一般在：

When passing built-in server arguments, do not combine them with `--skip-cargo` or `-SkipCargo`; the Rust core must be rebuilt for the embedded config to take effect.
```text
F:\rustdesk\rustdesk\flutter\build\windows\x64\runner\Release\
```

如果只想快速验证旧 Sciter 版本，可以运行：

```powershell
cargo run
```

但桌面主线建议构建 Flutter 版。

## 4. 自定义默认服务器

默认 ID 服务器、公钥、端口在：

```text
libs/hbb_common/src/config.rs
```

主要修改：

```rust
pub const RENDEZVOUS_SERVERS: &[&str] = &["your-hbbs.example.com"];
pub const RS_PUB_KEY: &str = "你的服务器公钥";
```

默认端口：

```rust
pub const RENDEZVOUS_PORT: i32 = 21116;
pub const RELAY_PORT: i32 = 21117;
pub const WS_RENDEZVOUS_PORT: i32 = 21118;
pub const WS_RELAY_PORT: i32 = 21119;
```

如果你的服务端使用默认端口，通常只改服务器地址和公钥即可。

服务端公钥来自自建 `hbbs`。通常在服务器的数据目录中可以找到 key 文件，或从服务端启动日志、配置中确认。客户端里的 `RS_PUB_KEY` 必须和你的 `hbbs` 公钥匹配，否则连接时会出现公钥校验失败。

## 5. 自定义 Windows 程序名与资源

Windows 程序资源在：

```text
Cargo.toml
```

修改：

```toml
[package.metadata.winres]
ProductName = "你的客户端名"
FileDescription = "你的客户端描述"
OriginalFilename = "yourapp.exe"

[package.metadata.bundle]
name = "你的客户端名"
identifier = "com.yourcompany.yourapp"
```

常见图标资源：

```text
res/icon.ico
res/icon.png
res/32x32.png
res/128x128.png
res/128x128@2x.png
res/scalable.svg
res/mac-icon.png
```

Flutter 图标配置在：

```text
flutter/pubspec.yaml
```

图标替换后，可重新生成 Flutter 平台图标：

```powershell
cd F:\rustdesk\rustdesk\flutter
flutter pub get
flutter pub run flutter_launcher_icons
```

然后回到仓库根目录重新构建：

```powershell
cd F:\rustdesk\rustdesk
python .\build.py --portable --hwcodec --flutter --vram --skip-portable-pack
```

## 6. Android 自定义项

如果需要构建 Android，还需要修改包名和应用名。

主要文件：

```text
flutter/android/app/build.gradle
flutter/android/app/src/main/AndroidManifest.xml
flutter/android/app/src/main/res/values/strings.xml
flutter/android/app/src/main/kotlin/com/carriez/flutter_hbb/
```

包名：

```gradle
applicationId "com.yourcompany.yourapp"
```

应用名：

```xml
<string name="app_name">你的客户端名</string>
```

还需要同步调整 Kotlin 源码中的 package：

```kotlin
package com.yourcompany.yourapp
```

并把目录从：

```text
flutter/android/app/src/main/kotlin/com/carriez/flutter_hbb/
```

移动到类似：

```text
flutter/android/app/src/main/kotlin/com/yourcompany/yourapp/
```

Android 构建还需要 Android SDK、NDK、签名配置等，建议先确保 Windows 桌面版可以成功构建，再处理移动端。

## 7. 关于 custom.txt 自定义配置

源码中存在 `custom.txt` / 自定义客户端配置加载逻辑，入口大致在：

```text
src/common.rs
src/flutter_ffi.rs
src/core_main.rs
```

但这类配置会进行签名校验，并不是随便写一个 JSON 就能生效。对于自己维护源码并本地编译的场景，最直接稳定的方式是：

1. 在源码中改默认服务器、公钥、品牌和图标。
2. 重新构建客户端。
3. 用构建产物进行分发。

## 8. 不改源码的临时测试方式

如果只是测试自建服务器，可以先安装 RustDesk，然后用命令设置服务器。该方式通常需要管理员权限，并要求客户端已经安装为系统服务。

```powershell
rustdesk.exe --option custom-rendezvous-server your-hbbs.example.com
rustdesk.exe --option key 你的服务器公钥
```

查看某个选项：

```powershell
rustdesk.exe --option custom-rendezvous-server
```

这种方式适合调试，不适合正式分发。正式自定义客户端建议直接改源码默认值并重新构建。

## 9. 常见问题

### 找不到 vcpkg

确认 `VCPKG_ROOT`：

```powershell
echo $env:VCPKG_ROOT
```

如果为空：

```powershell
$env:VCPKG_ROOT="C:\vcpkg"
```

### Rust 或 Flutter 版本不匹配

本仓库 CI 中 Flutter Windows 构建使用：

```text
Rust 1.75
Flutter 3.24.5
```

如果遇到依赖、生成代码或 ABI 问题，优先切回这些版本。

### 服务器公钥错误

如果 `RS_PUB_KEY` 和服务端不匹配，客户端可能无法完成握手。检查：

- `hbbs` 和 `hbbr` 是否使用同一套 key
- 客户端 `RS_PUB_KEY` 是否是当前服务端公钥
- 客户端是否还保留旧配置，例如之前手动设置过 `key`

### 改了名称但界面仍显示 RustDesk

需要分别检查：

- `Cargo.toml` 的 Windows 资源和 bundle 名称
- `libs/hbb_common/src/config.rs` 中运行时 `APP_NAME` 默认值
- Flutter / Android / macOS 平台工程中的应用名
- 旧配置目录中是否保留了之前的配置

### 只改 `RENDEZVOUS_SERVERS` 后仍连接旧服务器

配置读取优先级中，用户配置可能覆盖源码默认值。可以检查客户端设置里的 ID 服务器，或者清理旧配置后再测试。

