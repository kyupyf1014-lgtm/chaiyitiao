# 拆一条 · 完全本地基础版

**导入短视频 → 自动分镜 → 代表截图 → 语音转文案 → 按时间对齐 → 校对与导出。**

在本机浏览器里操作，由本机 Python 处理视频。无需账号、API Key 或云端服务。当前版本 V0.2，已在 Apple Silicon Mac 上验证。

## 首次安装与启动

1. 安装 [Python 3.12](https://www.python.org/downloads/)。当前依赖建议使用 macOS 14 或更新版本。
2. 下载本仓库，或通过 Git 克隆：

   ```sh
   git clone https://github.com/kyupyf1014-lgtm/chaiyitiao.git
   cd chaiyitiao
   ```

3. 首次联网运行 **`安装本地环境.command`**，安装 Python 依赖并下载约 153 MB 的语音模型。
4. 完成后双击 **`启动拆一条.command`**，会自动打开浏览器工作台；以后运行不需要联网。

若下载 ZIP 后双击提示没有执行权限，可在项目目录运行：

```sh
chmod +x 安装本地环境.command 启动拆一条.command
./安装本地环境.command
./启动拆一条.command
```

## 使用流程

1. 点击「导入视频」，选择 MP4、MOV 或 WebM。
2. 默认选择「中文」和「标准」镜头检测，点击「开始本地拆解」。
3. 等待分镜、截图和语音文案生成。点击分镜时间回看原片，直接修改文字。
4. 导出报告或字幕；下次从「本地项目库」继续。

建议先用 30–90 秒、声音清晰的短视频。基础版单个文件上限 **200 MB、10 分钟**。关闭启动时的终端窗口会停止服务。

默认地址为 `http://127.0.0.1:4174`。启动器会复用已有本地服务；端口占用时会尝试 4175–4183。

## 已实现

- **自动分镜与截图**：本地解码视频，按画面突变检测边界，提供三档灵敏度；每个镜头截取中间帧。
- **语音转文案**：本地 Whisper base 多语言模型，CPU INT8 推理，支持中文、英语、自动识别语言；中文转换为简体。
- **时间对齐**：以语音词级时间戳对齐分镜，跨镜头的词只分配一次，不重复整句。
- **原片校对**：点击时间回看、编辑口播与时间、手动拆分/补充分镜、标记已校对。
- **本地项目库**：原片与结果落盘，多项目保留，刷新后恢复原视频与编辑内容。
- **导出**：带内嵌截图的独立 HTML 报告、CSV 表格、Markdown、TXT、SRT 字幕和表格复制。
- **处理状态**：显示当前步骤，可取消任务；失败会显示原因，不生成假结果。

## 当前边界

- 自动提取的是**语音口播**。不做屏幕文字 OCR、画面语义描述、内容结构总结；相关字段可以手动填写。
- 画面变化检测适合明显的切镜。渐变转场、微小变化、快速移动、闪光和快速剪辑可能漏切或误切，时间以约值显示；可调整灵敏度或手动修改。
- Whisper base 是轻量基础模型，嘈杂音轨、方言、专有名词和同音字可能识别错误，须校对。没有音轨或检测不到清晰人声时保留空文案。
- SRT 按**当前分镜范围**导出已校对口播，不是逐词字幕；一条语句跨镜头时会按发声时间拆到各分镜。
- 本版通过本地浏览器使用，尚未打包成独立 `.app` / `.dmg`。未验证 Windows、Intel Mac 或所有浏览器/视频编码。
- 附带的旧示例为无声原创插画，文字为虚构演示数据，与真实自动识别结果分开标记。

## 数据与离线运行

- `.local-data/projects/<项目编号>/`：原视频、任务状态、分镜截图、识别原始分段和校对结果。编辑写入 `result.json`，采用临时文件替换保存。
- `models/faster-whisper-base/`：约 153 MB 模型文件。
- `.venv/`：项目独立 Python 依赖环境。
- 浏览器只记住当前项目编号；旧 V0.1 的手动草稿继续保留在原浏览器中。
- 导入新视频会创建新的项目目录，不覆盖旧项目。取消或失败时已导入的文件仍保留在该目录中。
- 备份整个 `.local-data` 文件夹可保留项目和原片。HTML 导出含截图与文本，不含原视频。

**运行阶段不下载模型、不调用云端 API。** 服务只监听 `127.0.0.1`，拒绝外部 Host/Origin，写入接口需要当前会话令牌；网页仅使用本地资源。这里的“导入”仅传给同一台电脑上的 Python 进程。

## 换一台电脑 / 重新安装

使用 Python 3.12，首次联网双击 `安装本地环境.command`。它会建立 `.venv`、从 PyPI 安装依赖，并下载固定版本的官方模型。安装完成后即可断网运行。安装器会沿用 macOS 当前的系统代理，不修改系统设置。

也可从终端执行：

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python scripts/setup_model.py
.venv/bin/python local_server.py --port 4174
```

语音引擎使用 [faster-whisper](https://github.com/SYSTRAN/faster-whisper)，模型来源为 [Systran/faster-whisper-base](https://huggingface.co/Systran/faster-whisper-base)，视频解码使用 [PyAV](https://pyav.org/)。依赖与模型遵循各自许可证；本项目代码采用 MIT。

## 开发与验证

```sh
.venv/bin/python -m unittest discover -s tests -v
node --check app.js
node --check local-ui.js
```

验证记录见 [VERIFICATION.md](VERIFICATION.md)。`DESIGN.md` 保留了 V0.1 的历史设计说明，当前功能以本 README 为准。

| 文件 | 用途 |
| --- | --- |
| `local_engine.py` | 本地分镜、截图、语音转写与时间对齐 |
| `local_server.py` | 仅本机 API、项目文件保存、视频范围请求 |
| `local-ui.js` | 导入、进度、项目库、保存、HTML/SRT 导出 |
| `app.js` | 原片与表格联动、手动校对、文本导出 |
| `scripts/setup_model.py` | 首次下载模型，运行阶段不会调用 |
| `scripts/launch.py` | 查找端口、启动服务并打开本地工作台 |
| `scripts/make_local_test.py` | 生成三个镜头的中文语音测试视频，仅验证时使用 |
| `server.mjs` | 旧版静态预览服务，不提供自动拆解能力 |
