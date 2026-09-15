"""Generate original illustrative demo assets. Requires Pillow; pass an FFmpeg path."""
import math
import random
import subprocess
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'assets'
ASSETS.mkdir(exist_ok=True)
S = 2
W, H = 720 * S, 900 * S
FONT = '/System/Library/Fonts/STHeiti Light.ttc'
FONT_EN = '/System/Library/Fonts/Supplemental/Arial.ttf'

def font(size, english=False):
    return ImageFont.truetype(FONT_EN if english else FONT, round(size * S))

def rr(draw, box, radius, fill, outline=None, width=1):
    draw.rounded_rectangle(tuple(round(x*S) for x in box), radius=radius*S, fill=fill, outline=outline, width=width*S)

def line(draw, pts, fill, width=1):
    draw.line([(int(x*S), int(y*S)) for x,y in pts], fill=fill, width=width*S, joint='curve')

def ellipse(draw, box, fill, outline=None, width=1):
    draw.ellipse(tuple(int(x*S) for x in box), fill=fill, outline=outline, width=width*S)

def text(draw, xy, value, size, fill, english=False, anchor=None):
    draw.text(tuple(int(x*S) for x in xy), value, font=font(size, english), fill=fill, anchor=anchor)

def shadow(im, box, radius=10, strength=35, offset=(2, 8)):
    layer = Image.new('RGBA', im.size)
    rr(ImageDraw.Draw(layer), [box[0]+offset[0], box[1]+offset[1], box[2]+offset[0], box[3]+offset[1]], radius, (63,55,36,strength))
    im.alpha_composite(layer.filter(ImageFilter.GaussianBlur(9*S)))

def plant(im, x, y, scale=1):
    d=ImageDraw.Draw(im)
    r=40*scale
    shadow(im,(x-r,y-r,x+r,y+r),radius=r,strength=65,offset=(6,10))
    d=ImageDraw.Draw(im)
    ellipse(d,(x-r,y-r,x+r,y+r),'#c6b99b')
    ellipse(d,(x-r+6,y-r+6,x+r-6,y+r-6),'#e9dfc8')
    ellipse(d,(x-r+11,y-r+11,x+r-11,y+r-11),'#74694d')
    rng=random.Random(18)
    for n in range(13):
        angle=n*2.4
        length=(38+rng.random()*30)*scale
        cx=x+math.cos(angle)*length*.5;cy=y+math.sin(angle)*length*.5
        leaf=Image.new('RGBA',(200*S,200*S))
        ld=ImageDraw.Draw(leaf)
        rr(ld,(87,45,113,110),13,['#657959','#84976d','#a3b48a','#7b8c63'][n%4])
        line(ld,[(100,56),(100,111)],'#bdc7a066',1)
        leaf=leaf.rotate(-math.degrees(angle)+90,resample=Image.Resampling.BICUBIC)
        leaf=leaf.resize((round(200*S*scale),round(200*S*scale)))
        im.alpha_composite(leaf,(round(cx*S-leaf.width/2),round(cy*S-leaf.height/2)))

def mug(im,x,y):
    d=ImageDraw.Draw(im)
    shadow(im,(x-30,y-30,x+35,y+35),30,55)
    ellipse(d,(x+16,y-18,x+48,y+13),'#c8c6b5')
    ellipse(d,(x+22,y-12,x+42,y+7),'#e8e4d6')
    ellipse(d,(x-36,y-36,x+36,y+36),'#d7d4c3')
    ellipse(d,(x-32,y-32,x+32,y+32),'#f4f0e3')
    ellipse(d,(x-25,y-25,x+25,y+25),'#68503b')
    ellipse(d,(x-21,y-23,x+20,y+20),'#8f6c49')
    ellipse(d,(x-12,y-17,x+17,y+12),'#c4a277')
    line(d,[(x-10,y+5),(x+12,y-8),(x,y-14)],'#dcc6a0',3)

def notebook(im,x,y,color='#aeb699',angle=0):
    layer=Image.new('RGBA',(180*S,225*S));d=ImageDraw.Draw(layer)
    rr(d,(11,10,160,213),7,(54,52,35,25));layer=layer.filter(ImageFilter.GaussianBlur(3*S));d=ImageDraw.Draw(layer)
    rr(d,(9,6,156,205),5,'#e5e2d5');rr(d,(5,0,151,197),5,color)
    line(d,[(15,6),(15,190)],'#6b745c44',1)
    text(d,(30,42),'small',18,'#65735c',True)
    text(d,(30,65),'things.',18,'#65735c',True)
    text(d,(30,169),'MAKE ROOM FOR IDEAS',5,'#717e66',True)
    layer=layer.rotate(angle,resample=Image.Resampling.BICUBIC,expand=True)
    im.alpha_composite(layer,(int(x*S),int(y*S)))

def laptop(im):
    shadow(im,(178,138,542,475),15,45,offset=(6,15))
    d=ImageDraw.Draw(im)
    rr(d,(185,137,535,345),10,'#929891')
    rr(d,(190,141,530,335),8,'#29372e')
    rr(d,(199,151,521,325),4,'#ccd4bb')
    # Clip the original botanical wallpaper to the laptop display.
    wallpaper = Image.new('RGBA', im.size, '#ccd4bb')
    wd = ImageDraw.Draw(wallpaper)
    ellipse(wd,(280,161,590,467),'#b3c1a0')
    ellipse(wd,(175,239,446,400),'#e3e4c9')
    ellipse(wd,(364,75,614,325),'#8b9d7c')
    text(wd,(360,205),'09:41',30,'#f8f8ed',True,anchor='mt')
    text(wd,(360,246),'A FRESH START',7,'#f4f6e6',True,anchor='mt')
    im.alpha_composite(wallpaper.crop((199*S,151*S,521*S,325*S)),(199*S,151*S))
    rr(d,(178,342,542,475),10,'#c3c6bd')
    line(d,[(182,350),(538,350)],'#e6e7e0',2)
    for row in range(5):
        for col in range(13):
            x=196+col*25;y=358+row*13
            rr(d,(x,y,x+21,y+9),2,'#647066')
            if row<4: line(d,[(x+8,y+4),(x+11,y+4)],'#bdc6b5',1)
    rr(d,(291,428,427,464),4,'#b8beb4',outline='#a5aea2')
    line(d,[(181,470),(538,470)],'#aeb5a8',1)

def tray(im,x,y):
    shadow(im,(x,y,x+116,y+182),10,25)
    d=ImageDraw.Draw(im)
    rr(d,(x,y,x+116,y+182),10,'#d6c9ad')
    rr(d,(x+5,y+5,x+111,y+177),7,'#e6d9bf')
    rr(d,(x+12,y+12,x+105,y+80),4,'#f5ecd6')
    text(d,(x+22,y+30),'TODAY',8,'#a29979',True)
    for n in range(3):line(d,[(x+24,y+46+n*7),(x+91,y+46+n*7)],'#d6ccb0')
    rr(d,(x+19,y+103,x+93,y+109),2,'#6b7862')
    rr(d,(x+19,y+123,x+96,y+129),2,'#b09b79')
    rr(d,(x+19,y+144,x+90,y+150),2,'#8f9584')

def cable(d, messy):
    if messy:
        pts=[]
        for t in range(141):
            a=t/17;pts.append((359+math.sin(a)*97,533+math.cos(a*1.4)*51))
        line(d,pts,'#b8b4a4',5);line(d,[(443,569),(474,582)],'#b8b4a4',5)
        rr(d,(469,575,487,585),2,'#ebe9dc',outline='#bbb8a9')
    else:
        line(d,[(527,262),(562,262),(568,271),(568,554),(558,565),(449,565)],'#c6bfa9',4)
        rr(d,(559,455,576,469),3,'#9da790')
        rr(d,(438,560,457,570),2,'#dedaca',outline='#b4b9a8')

captions=[('桌面总是乱？','从 3 个小方法开始'),('01 先分类','按使用频率，给物品分组'),('每天用的，就近放','让常用物品触手可及'),('02 收好线缆','给每根线一个固定的位置'),('03 适当留白','也给自己留一点呼吸的空间'),('让每件东西','都有自己的位置')]
for step in range(1,7):
    im=Image.new('RGBA',(W,H),'#ebe6d8');d=ImageDraw.Draw(im)
    # Warm daylight and subtle natural desk texture.
    random.seed(4)
    for y in range(900):
        brightness=int(7*math.cos((y-250)/750))
        line(d,[(0,y),(720,y)],(229+brightness,225+brightness,211+brightness),1)
    for _ in range(6500):
        x=random.randrange(W);y=random.randrange(H)
        d.point((x,y),fill=(122,111,78,random.randrange(4,15)))
    # Soft afternoon shadow across the desk.
    shade=Image.new('RGBA',im.size);sd=ImageDraw.Draw(shade)
    sd.polygon([(0,0),(150*S,0),(700*S,900*S),(600*S,900*S)],fill=(255,255,255,36))
    im.alpha_composite(shade.filter(ImageFilter.GaussianBlur(12*S)))
    shadow(im,(119,108,598,597),25,24)
    d=ImageDraw.Draw(im);rr(d,(119,108,598,597),25,'#d5d8c2')
    laptop(im)
    if step<3:
        notebook(im,43,452,'#b9bc9e',-14 if step==1 else 0)
        notebook(im,511,466,'#c9c0a6',18 if step==1 else 0)
    else: notebook(im,37,415,'#acb59b',0)
    d=ImageDraw.Draw(im)
    if step==1:
        for x,y,angle in [(498,477,0),(214,559,0),(521,571,0)]:
            rr(d,(x,y,x+72,y+6),2,'#9c9176')
        rr(d,(438,609,516,679),3,'#efdfb0');text(d,(450,630),'to do',11,'#9f977b',True)
    elif step==2:
        for n in range(3):rr(d,(490,494+n*17,572,501+n*17),3,['#6f7b66','#9c9176','#d0bd8c'][n])
    else: tray(im,545,415)
    cable(ImageDraw.Draw(im),step<4)
    mug(im,95,252 if step<5 else 247)
    plant(im,601,169,0.92 if step<5 else 1.02)
    d=ImageDraw.Draw(im)
    text(d,(39,39),'S L O W   L I V I N G',10,'#78856e',True)
    rr(d,(589,29,683,54),12,'#f1efe2')
    text(d,(636,35),f'{step:02d} / 06',9,'#8d997f',True,anchor='mt')
    text(d,(360,724),captions[step-1][0],37,'#3e4d38',anchor='mt')
    text(d,(360,779),captions[step-1][1],20,'#7d8a6e',anchor='mt')
    text(d,(360,854),'拆一条 · 原创插画演示',10,'#a1a78c',anchor='mt')
    im.convert('RGB').resize((720,900),Image.Resampling.LANCZOS).save(ASSETS/f'shot-{step}.jpg',quality=92)

if len(sys.argv)>1:
    concat=ASSETS/'demo-frames.txt'
    concat.write_text(''.join(f"file 'shot-{i}.jpg'\nduration {d}\n" for i,d in enumerate([4,6,6,7,7,6],1))+"file 'shot-6.jpg'\n")
    subprocess.run([sys.argv[1],'-y','-f','concat','-safe','0','-i',str(concat),'-t','36','-vf','fps=18,format=yuv420p','-c:v','libx264','-crf','25','-preset','fast','-movflags','+faststart',str(ASSETS/'demo.mp4')],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
    concat.unlink()
print('Generated 6 original illustrations and demo assets.')
