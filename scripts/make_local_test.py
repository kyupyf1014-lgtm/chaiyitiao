"""Generate a 3-scene spoken Chinese fixture on macOS, using offline system TTS."""
from pathlib import Path
import subprocess
import av
from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parents[1]
output = root / 'output'
output.mkdir(exist_ok=True)
subprocess.run(['/usr/bin/say', '-v', 'Tingting', '-r', '155', '-o', str(output / '测试口播.aiff'),
                '今天分享三个整理桌面的小方法。第一，给常用的物品找一个固定位置。第二，把电线收好。第三，每天花一分钟恢复整洁。'], check=True)
with av.open(str(output / '测试口播.aiff')) as source:
    duration = float(source.duration / av.time_base)
    frames = list(source.decode(audio=0))
out = av.open(str(output / '本地验证_中文口播.mp4'), 'w')
video = out.add_stream('libx264', rate=25)
video.width, video.height, video.pix_fmt = 480, 640, 'yuv420p'
audio = out.add_stream('aac', rate=24000)
audio.layout = 'mono'
font = ImageFont.truetype('/System/Library/Fonts/STHeiti Light.ttc', 30)
scenes = [('#daeac3', '01 物品归位'), ('#bdcfe6', '02 收好电线'), ('#edc5b0', '03 每天整理')]
for i in range(int(duration * 25) + 1):
    color, label = scenes[min(2, int(i / 25 / (duration / 3)))]
    image = Image.new('RGB', (480, 640), color)
    draw = ImageDraw.Draw(image)
    draw.text((50, 240), label, font=font, fill='#283329')
    draw.text((50, 310), '本地转写测试', font=font, fill='#283329')
    frame = av.VideoFrame.from_image(image)
    frame.pts = i
    for packet in video.encode(frame):
        out.mux(packet)
for packet in video.encode():
    out.mux(packet)
resampler = av.AudioResampler(format='fltp', layout='mono', rate=24000)
for frame in frames:
    for converted in resampler.resample(frame):
        for packet in audio.encode(converted):
            out.mux(packet)
for converted in resampler.resample(None):
    for packet in audio.encode(converted):
        out.mux(packet)
for packet in audio.encode():
    out.mux(packet)
out.close()
print(f'Generated {duration:.2f}s spoken video with cuts near {duration / 3:.2f}s, {duration * 2 / 3:.2f}s.')
