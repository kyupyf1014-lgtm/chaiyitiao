import json
from pathlib import Path
import socket
import tempfile
import threading
import time
import unittest
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request, build_opener, ProxyHandler

import av
from PIL import Image

import local_engine as engine
import local_server as server


def fixture(path):
    with av.open(str(path), 'w') as out:
        stream = out.add_stream('libx264', rate=10)
        stream.width, stream.height, stream.pix_fmt = 160, 120, 'yuv420p'
        for n in range(30):
            frame = av.VideoFrame.from_image(Image.new('RGB', (160, 120), ['red', 'blue', 'green'][n // 10]))
            frame.pts = n
            for packet in stream.encode(frame):
                out.mux(packet)
        for packet in stream.encode():
            out.mux(packet)


class LocalTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        cls.root = Path(cls.temp.name)
        cls.video = cls.root / 'three.mp4'
        fixture(cls.video)
        cls.old_data = server.DATA
        server.DATA = cls.root / 'projects'
        server.DATA.mkdir()
        cls.httpd = server.ThreadingHTTPServer(('127.0.0.1', 0), server.Handler)
        cls.worker = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.worker.start()
        cls.base = f'http://127.0.0.1:{cls.httpd.server_port}'
        cls.opener = build_opener(ProxyHandler({}))

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()
        cls.worker.join()
        server.DATA = cls.old_data
        cls.temp.cleanup()

    def request(self, route, method='GET', data=None, headers=None):
        return self.opener.open(Request(self.base + route, data=data, method=method, headers=headers or {}), timeout=20)

    def test_three_scenes_silent_offline(self):
        with patch.object(socket.socket, 'connect', side_effect=AssertionError('network forbidden')):
            result = engine.analyze(self.video, 'three.mp4', 'normal', 'zh', lambda *_: None, lambda: False)
        self.assertEqual(len(result['shots']), 3)
        self.assertEqual([(s['start'], s['end']) for s in result['shots']], [(0, 1), (1, 2), (2, 3)])
        self.assertTrue(all(s['image'].startswith('data:image/jpeg;base64,') and not s['speech'] for s in result['shots']))
        self.assertIn('没有音轨', result['warnings'][0])

    def test_align_cross_cut_without_duplication(self):
        shots = [dict(start=0, end=2, speech=''), dict(start=2, end=4, speech='')]
        segments = [dict(start=1, end=3, text='你好世界', words=[dict(start=1, end=2.1, text='你好'), dict(start=2.1, end=3, text='世界')])]
        engine.align_words(shots, segments)
        self.assertEqual([s['speech'] for s in shots], ['你好', '世界'])

    def test_cancel_and_duration_limits(self):
        with self.assertRaises(InterruptedError):
            engine.analyze(self.video, 'a.mp4', 'normal', 'zh', lambda *_: None, lambda: True)
        with patch.object(engine, 'MAX_SECONDS', 1), self.assertRaises(ValueError):
            engine.analyze(self.video, 'a.mp4', 'normal', 'zh', lambda *_: None, lambda: False)

    def test_local_api_roundtrip(self):
        with self.request('/api/health') as response:
            token = json.load(response)['token']
        headers = {'X-Local-Token': token, 'Content-Type': 'application/octet-stream'}
        with self.request('/api/jobs?name=three.mp4', 'POST', self.video.read_bytes(), headers) as response:
            job_id = json.load(response)['id']
        deadline = time.monotonic() + 20
        while True:
            with self.request('/api/jobs/' + job_id) as response:
                job = json.load(response)
            if job['status'] != 'processing' or time.monotonic() > deadline:
                break
            time.sleep(.05)
        self.assertEqual(job['status'], 'completed', job)
        with self.request('/api/projects/' + job_id) as response:
            result = json.load(response)
        self.assertEqual(len(result['shots']), 3)
        result['shots'][0]['speech'] = '手动校对的中文'
        with self.request('/api/projects/' + job_id, 'PUT', json.dumps(result).encode(), headers) as response:
            self.assertTrue(json.load(response)['ok'])
        self.assertEqual(json.loads((server.DATA / job_id / 'result.json').read_text())['shots'][0]['speech'], '手动校对的中文')
        with self.request('/api/projects/' + job_id + '/video', headers={'Range': 'bytes=0-15'}) as response:
            self.assertEqual(response.status, 206)
            self.assertEqual(response.read(), self.video.read_bytes()[:16])
        result['shots'][1]['start'] = 0
        with self.assertRaises(HTTPError) as invalid:
            self.request('/api/projects/' + job_id, 'PUT', json.dumps(result).encode(), headers)
        self.assertEqual(invalid.exception.code, 400)

    def test_host_origin_and_private_paths(self):
        cases = [('/api/health', 'GET', None, {'Host': 'evil.example'}, 403),
                 ('/api/health', 'GET', None, {'Origin': 'https://evil.example'}, 403),
                 ('/api/jobs?name=a.mp4', 'POST', b'test', {}, 403),
                 ('/.git/config', 'GET', None, {}, 404),
                 ('/models/faster-whisper-base/config.json', 'GET', None, {}, 404)]
        for path, method, data, headers, expected in cases:
            with self.subTest(path=path, headers=headers):
                with self.assertRaises(HTTPError) as caught:
                    self.request(path, method, data, headers)
                self.assertEqual(caught.exception.code, expected)


if __name__ == '__main__':
    unittest.main()
