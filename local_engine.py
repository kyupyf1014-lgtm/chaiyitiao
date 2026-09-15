"""Offline video processing. No network/model download is permitted here."""
import base64
import io
import os
from pathlib import Path

os.environ['HF_HUB_OFFLINE'] = '1'
os.environ['HF_HUB_DISABLE_TELEMETRY'] = '1'

ROOT = Path(__file__).resolve().parent
MODEL = ROOT / 'models' / 'faster-whisper-base'
MAX_SECONDS = 600
_model = None


def model_ready():
    return all((MODEL / f).is_file() for f in ['model.bin', 'config.json', 'tokenizer.json', 'vocabulary.txt'])


def align_words(shots, segments):
    """Assign every word exactly once, to the shot with the greatest overlap."""
    for segment in segments:
        words = segment.get('words') or [segment]
        for word in words:
            if not shots:
                break
            overlaps = [max(0, min(s['end'], word['end']) - max(s['start'], word['start'])) for s in shots]
            if max(overlaps) > 0:
                index = max(range(len(shots)), key=lambda i: overlaps[i])
            else:
                middle = (word['start'] + word['end']) / 2
                index = min(range(len(shots)), key=lambda i: abs((shots[i]['start'] + shots[i]['end']) / 2 - middle))
            shots[index]['speech'] += word['text']
    for shot in shots:
        shot['speech'] = shot['speech'].strip()


def analyze(path, name, sensitivity, language, update, cancelled):
    import av
    import numpy as np
    from opencc import OpenCC

    def check():
        if cancelled():
            raise InterruptedError('已取消处理，原有项目不受影响。')

    update('检测画面切换', 0)
    threshold = {'low': 0.14, 'normal': 0.08, 'high': 0.04}.get(sensitivity, 0.08)
    cuts, previous, sampled, last_time = [0.0], None, -1.0, 0.0
    with av.open(str(path)) as container:
        if not container.streams.video:
            raise ValueError('文件中没有可读取的视频画面。')
        stream = container.streams.video[0]
        has_audio = bool(container.streams.audio)
        duration = float(stream.duration * stream.time_base) if stream.duration else (container.duration or 0) / av.time_base
        if duration > MAX_SECONDS + 0.1:
            raise ValueError('基础版一次处理不超过 10 分钟的视频。')
        origin = float((stream.start_time or 0) * stream.time_base)
        fps = float(stream.average_rate or 25)
        for frame in container.decode(stream):
            check()
            t = max(0.0, float(frame.time or 0) - origin)
            last_time = t
            if t > MAX_SECONDS:
                raise ValueError('基础版一次处理不超过 10 分钟的视频。')
            if t - sampled < .12:
                continue
            sampled = t
            pixels = frame.reformat(width=64, height=36, format='rgb24').to_ndarray().astype(np.float32)
            if previous is not None:
                score = float(np.mean(np.abs(pixels - previous))) / 255
                if score >= threshold and t - cuts[-1] >= .65:
                    cuts.append(round(t, 3))
            previous = pixels
            update('检测画面切换', min(34, int(t / max(duration, t + 1) * 35)))
        if previous is None:
            raise ValueError('视频无法解码，请换用 MP4（H.264）视频。')
        duration = round(last_time + 1 / fps, 3)
        cuts = [c for c in cuts if c < duration - .15]
        cuts.append(duration)
        shots = []
        for i, (start, end) in enumerate(zip(cuts, cuts[1:])):
            check()
            target = (start + end) / 2
            container.seek(int((target + origin) / stream.time_base), stream=stream, backward=True)
            chosen = None
            for frame in container.decode(stream):
                chosen = frame
                if float(frame.time or 0) - origin >= target:
                    break
            image = ''
            if chosen:
                thumb = chosen.to_image()
                thumb.thumbnail((280, 280))
                buffer = io.BytesIO()
                thumb.save(buffer, format='JPEG', quality=78)
                image = 'data:image/jpeg;base64,' + base64.b64encode(buffer.getvalue()).decode()
            shots.append(dict(id=f's{i+1}', start=start, end=end, visual='', camera='', speech='', screen='',
                              analysis='', uncertainty='自动分镜边界与语音原文需对照原片校对', reviewed=False,
                              approximate=True, image=image))
    check()
    segments, warnings = [], []
    if has_audio:
        if not model_ready():
            raise ValueError('本地语音模型尚未准备好，请先运行「安装本地环境.command」。')
        update('载入本地语音模型', 40)
        global _model
        if _model is None:
            from faster_whisper import WhisperModel
            _model = WhisperModel(str(MODEL), device='cpu', compute_type='int8',
                                  cpu_threads=min(os.cpu_count() or 4, 8), local_files_only=True)
        check()
        update('本地语音转文字', 42)
        chunks, info = _model.transcribe(str(path), language=None if language == 'auto' else language,
                                        beam_size=5, vad_filter=True, word_timestamps=True,
                                        condition_on_previous_text=False,
                                        initial_prompt='以下是普通话口播，请使用简体中文。' if language == 'zh' else None)
        convert = OpenCC('t2s').convert if language == 'zh' or info.language == 'zh' else lambda s: s
        for segment in chunks:
            check()
            if segment.no_speech_prob > .85 and segment.avg_logprob < -1:
                continue
            segments.append(dict(start=segment.start, end=segment.end, text=convert(segment.text),
                                 words=[dict(start=w.start, end=w.end, text=convert(w.word)) for w in segment.words or []]))
            update('本地语音转文字', min(95, 42 + int(segment.end / duration * 53)))
        if not segments:
            warnings.append('没有检测到清晰人声；已保留分镜，口播留空。')
    else:
        warnings.append('视频没有音轨；已生成分镜，口播留空。')
    check()
    align_words(shots, segments)
    for shot in shots:
        if not shot['speech']:
            shot['uncertainty'] = '自动分镜边界需对照原片校对'
    return dict(kind='local', title=Path(name).stem, fileName=name, duration=duration, shots=shots,
                structures=[], segments=segments, warnings=warnings, source='offline',
                engine='faster-whisper base / CPU int8', sensitivity=sensitivity)
