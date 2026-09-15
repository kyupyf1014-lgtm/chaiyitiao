"""Loopback-only app server and disk project library. Python 3.10+."""
import argparse
import json
import mimetypes
import os
import re
import secrets
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

from local_engine import analyze, model_ready

ROOT = Path(__file__).resolve().parent
DATA = ROOT / '.local-data' / 'projects'
TOKEN = secrets.token_urlsafe(32)
BUSY = threading.Lock()
JOBS = {}
ID = re.compile(r'^[a-f0-9]{32}$')
MAX_BYTES = 200 * 1024 * 1024


def write_json(path, value):
    temp = path.with_suffix('.tmp-' + secrets.token_hex(4))
    temp.write_text(json.dumps(value, ensure_ascii=False), encoding='utf-8')
    temp.replace(path)


def read_json(path):
    return json.loads(path.read_text(encoding='utf-8'))


def run_job(job_id, video, name, sensitivity, language):
    folder = DATA / job_id
    job = JOBS[job_id]

    def update(phase, progress):
        job['phase'], job['progress'] = phase, progress

    try:
        result = analyze(video, name, sensitivity, language, update, job['cancel'].is_set)
        result.update(id=job_id, updatedAt=int(time.time() * 1000))
        write_json(folder / 'result.json', result)
        job.update(status='completed', phase='拆解完成', progress=100)
    except InterruptedError as error:
        job.update(status='cancelled', phase=str(error))
    except Exception as error:
        job.update(status='failed', phase=str(error)[:500])
    finally:
        write_json(folder / 'job.json', {k: v for k, v in job.items() if k != 'cancel'})
        BUSY.release()


class Handler(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def log_message(self, fmt, *args):
        if args and str(args[0]).startswith(('POST', 'PUT')):
            super().log_message(fmt, *args)

    def common_headers(self):
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header('Content-Security-Policy', "default-src 'self'; connect-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; script-src 'self'; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'")

    def respond(self, value, status=200):
        body = json.dumps(value, ensure_ascii=False).encode()
        self.send_response(status)
        self.common_headers()
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def allowed(self, mutation=False):
        expected = {f'127.0.0.1:{self.server.server_port}', f'localhost:{self.server.server_port}'}
        if self.headers.get('Host') not in expected:
            self.respond({'error': '只允许本机访问。'}, 403)
            return False
        origin = self.headers.get('Origin')
        if origin and origin not in {'http://' + h for h in expected}:
            self.respond({'error': '来源不允许。'}, 403)
            return False
        if mutation and not secrets.compare_digest(self.headers.get('X-Local-Token', ''), TOKEN):
            self.respond({'error': '请刷新页面后重试。'}, 403)
            return False
        return True

    def send_file(self, path):
        if not path.is_file():
            self.respond({'error': '文件不存在。'}, 404)
            return
        size = path.stat().st_size
        start, end, code = 0, size - 1, 200
        requested = self.headers.get('Range')
        if requested:
            match = re.fullmatch(r'bytes=(\d*)-(\d*)', requested)
            if not match or not any(match.groups()):
                self.respond({'error': '无效的范围。'}, 416)
                return
            left, right = match.groups()
            start = int(left) if left else max(0, size - int(right))
            end = min(int(right), size - 1) if right and left else size - 1
            if start > end or start >= size:
                self.send_response(416)
                self.send_header('Content-Range', f'bytes */{size}')
                self.send_header('Content-Length', '0')
                self.end_headers()
                return
            code = 206
        self.send_response(code)
        self.common_headers()
        self.send_header('Content-Type', mimetypes.guess_type(path)[0] or 'application/octet-stream')
        self.send_header('Accept-Ranges', 'bytes')
        if code == 206:
            self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
        self.send_header('Content-Length', str(end - start + 1))
        self.end_headers()
        with path.open('rb') as source:
            source.seek(start)
            remaining = end - start + 1
            while remaining > 0:
                data = source.read(min(1024 * 1024, remaining))
                if not data:
                    break
                self.wfile.write(data)
                remaining -= len(data)

    def do_GET(self):
        if not self.allowed():
            return
        route = unquote(urlparse(self.path).path)
        try:
            if route == '/api/health':
                self.respond(dict(app='chaiyitiao-local', version='0.2.0', ready=model_ready(), token=TOKEN,
                                  busy=BUSY.locked(), model='Whisper base · 本地 CPU'))
            elif route == '/api/projects':
                projects = []
                for path in DATA.glob('*/result.json'):
                    try:
                        p = read_json(path)
                        projects.append({k: p.get(k) for k in ('id', 'title', 'duration', 'updatedAt', 'fileName')}
                                        | {'count': len(p['shots'])})
                    except (ValueError, KeyError, OSError):
                        continue
                self.respond(sorted(projects, key=lambda p: p.get('updatedAt') or 0, reverse=True))
            elif match := re.fullmatch(r'/api/jobs/([a-f0-9]{32})', route):
                job_id = match[1]
                if job_id in JOBS:
                    self.respond({k: v for k, v in JOBS[job_id].items() if k != 'cancel'})
                else:
                    self.respond(read_json(DATA / job_id / 'job.json'))
            elif match := re.fullmatch(r'/api/projects/([a-f0-9]{32})(/video)?', route):
                folder = DATA / match[1]
                if match[2]:
                    meta = read_json(folder / 'input.json')
                    self.send_file(folder / meta['file'])
                else:
                    self.respond(read_json(folder / 'result.json'))
            else:
                relative = route.lstrip('/') or 'index.html'
                permitted = relative in {'index.html', 'styles.css', 'app.js', 'local-ui.js'} or bool(re.fullmatch(r'assets/[a-zA-Z0-9_-]+\.(svg|jpg|mp4)', relative))
                if permitted:
                    self.send_file(ROOT / relative)
                else:
                    self.respond({'error': '页面不存在。'}, 404)
        except (FileNotFoundError, ValueError, KeyError):
            self.respond({'error': '项目不存在或数据不可读取。'}, 404)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def do_POST(self):
        if not self.allowed(mutation=True):
            self.close_connection = True
            return
        route = urlparse(self.path)
        if match := re.fullmatch(r'/api/jobs/([a-f0-9]{32})/cancel', route.path):
            job = JOBS.get(match[1])
            if job and job['status'] == 'processing':
                job['cancel'].set()
            self.respond({'ok': True})
            return
        if route.path != '/api/jobs':
            self.respond({'error': '页面不存在。'}, 404)
            return
        try:
            size = int(self.headers.get('Content-Length', '0'))
        except ValueError:
            size = 0
        options = parse_qs(route.query)
        name = Path(options.get('name', ['video.mp4'])[0]).name[:200]
        ext = Path(name).suffix.lower()
        if ext not in ('.mp4', '.mov', '.webm') or not 0 < size <= MAX_BYTES:
            self.respond({'error': '请选择不超过 200 MB 的 MP4、MOV 或 WebM 视频。'}, 400)
            self.close_connection = True
            return
        if not BUSY.acquire(blocking=False):
            self.respond({'error': '正在处理另一条视频，请等待完成。'}, 409)
            self.close_connection = True
            return
        job_id = secrets.token_hex(16)
        folder = DATA / job_id
        try:
            folder.mkdir(parents=True)
            path = folder / ('video' + ext)
            self.connection.settimeout(60)
            with path.open('wb') as target:
                remaining = size
                while remaining:
                    chunk = self.rfile.read(min(1024 * 1024, remaining))
                    if not chunk:
                        raise ValueError('文件传输中断，请重试。')
                    target.write(chunk)
                    remaining -= len(chunk)
            write_json(folder / 'input.json', {'name': name, 'file': path.name})
            JOBS[job_id] = dict(status='processing', phase='准备本地拆解', progress=0, cancel=threading.Event())
            write_json(folder / 'job.json', {k: v for k, v in JOBS[job_id].items() if k != 'cancel'})
            threading.Thread(target=run_job, args=(job_id, path, name, options.get('sensitivity', ['normal'])[0],
                                                  options.get('language', ['zh'])[0] if options.get('language', ['zh'])[0] in ('zh', 'en', 'auto') else 'zh'), daemon=True).start()
            self.respond({'id': job_id}, 202)
        except (OSError, ValueError) as error:
            BUSY.release()
            self.respond({'error': str(error)}, 400)

    def do_PUT(self):
        if not self.allowed(mutation=True):
            self.close_connection = True
            return
        match = re.fullmatch(r'/api/projects/([a-f0-9]{32})', urlparse(self.path).path)
        if not match:
            self.respond({'error': '项目不存在。'}, 404)
            return
        try:
            size = int(self.headers.get('Content-Length', 0))
            if not 0 < size < 12 * 1024 * 1024:
                raise ValueError('项目内容过大。')
            result_path = DATA / match[1] / 'result.json'
            original = read_json(result_path)
            p = json.loads(self.rfile.read(size))
            shots = p['shots']
            if not isinstance(shots, list) or len(shots) > 2000 or not isinstance(p.get('structures'), list):
                raise ValueError('项目格式无效。')
            previous_end = 0
            for shot in shots:
                if not (previous_end <= shot['start'] < shot['end'] <= original['duration'] + .05):
                    raise ValueError('分镜时间无效或重叠。')
                previous_end = shot['end']
            for key in ('id', 'duration', 'fileName', 'source', 'engine'):
                p[key] = original[key]
            p['updatedAt'] = int(time.time() * 1000)
            write_json(result_path, p)
            self.respond({'ok': True})
        except (ValueError, KeyError, TypeError, OSError) as error:
            self.respond({'error': '保存失败：' + str(error)[:200]}, 400)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=4173)
    args = parser.parse_args()
    DATA.mkdir(parents=True, exist_ok=True)
    # A process interrupted during inference has no resumable worker.
    for path in DATA.glob('*/job.json'):
        try:
            job = read_json(path)
            if job.get('status') == 'processing':
                job.update(status='failed', phase='上次处理因服务关闭而中断，请重新导入视频。')
                write_json(path, job)
        except (OSError, ValueError):
            continue
    server = ThreadingHTTPServer(('127.0.0.1', args.port), Handler)
    print(f'拆一条 · 完全本地版 http://127.0.0.1:{args.port}', flush=True)
    print('关闭这个窗口即可停止服务。视频和结果保存在 .local-data/projects。', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
