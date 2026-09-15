"""The only network-enabled step: download official model files once."""
import os
from pathlib import Path
from urllib.request import getproxies

os.environ.pop('HF_HUB_OFFLINE', None)
os.environ['HF_HUB_DISABLE_TELEMETRY'] = '1'
os.environ['HF_HUB_DISABLE_XET'] = '1'
for protocol, value in getproxies().items():
    if protocol in ('http', 'https'):
        os.environ.setdefault(protocol.upper() + '_PROXY', value)

from huggingface_hub import snapshot_download

target = Path(__file__).resolve().parents[1] / 'models' / 'faster-whisper-base'
print('下载 Whisper base 多语言模型（约 145 MB）；只需首次联网。', flush=True)
snapshot_download('Systran/faster-whisper-base',
                  revision='ebe41f70d5b6dfa9166e2c581c45c9c0cfc57b66',
                  local_dir=target,
                  allow_patterns=['config.json', 'model.bin', 'tokenizer.json', 'vocabulary.txt'],
                  max_workers=2)
print('模型已保存：' + str(target), flush=True)
