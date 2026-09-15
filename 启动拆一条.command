#!/bin/zsh
cd "$(dirname "$0")" || exit 1
if [[ ! -x .venv/bin/python ]]; then
  print '请先双击「安装本地环境.command」，完成首次安装。'
  read '?按回车关闭。'
  exit 1
fi
exec .venv/bin/python scripts/launch.py
