#!/bin/zsh
set -e
cd "$(dirname "$0")" || exit 1
if [[ ! -x .venv/bin/python ]]; then
  task_python="$(command -v python3 || true)"
  task_bundled="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3"
  if [[ -x "$task_bundled" ]]; then task_python="$task_bundled"; fi
  if [[ -z "$task_python" ]]; then
    print '未找到 Python。请从 python.org 安装 Python 3.12 后重试。'
    read '?按回车关闭。'
    exit 1
  fi
  "$task_python" -m venv .venv
fi
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python scripts/setup_model.py
print '安装完成！以后双击「启动拆一条.command」即可离线使用。'
read '?按回车关闭。'
