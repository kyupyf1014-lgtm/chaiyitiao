"""Start or reuse the loopback app; no downloads occur in the launcher."""
import json
import os
from pathlib import Path
import subprocess
import sys
import time
from urllib.request import build_opener, ProxyHandler
import webbrowser

root = Path(__file__).resolve().parents[1]
opener = build_opener(ProxyHandler({}))


def running(port):
    try:
        with opener.open(f'http://127.0.0.1:{port}/api/health', timeout=.6) as response:
            return json.load(response).get('app') == 'chaiyitiao-local'
    except Exception:
        return False


def main():
    # Prefer the same port on every launch so browser drafts remain available.
    for port in range(4174, 4184):
        if running(port):
            webbrowser.open(f'http://127.0.0.1:{port}')
            print('已打开正在运行的本地工作台。')
            return
    for port in range(4174, 4184):
        process = subprocess.Popen([sys.executable, str(root / 'local_server.py'), '--port', str(port)], cwd=root)
        try:
            for _ in range(30):
                if process.poll() is not None:
                    break
                if running(port):
                    webbrowser.open(f'http://127.0.0.1:{port}')
                    print('工具已启动。关闭此终端窗口会停止本地服务。', flush=True)
                    process.wait()
                    return
                time.sleep(.2)
        except KeyboardInterrupt:
            return
        finally:
            if process.poll() is None:
                process.terminate()
                process.wait(timeout=10)
    input('可用端口均被占用，请关闭旧工作台后重试。按回车退出。')


if __name__ == '__main__':
    main()
