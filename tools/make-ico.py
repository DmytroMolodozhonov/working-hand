"""Builds assets/logo/logo.ico (and logo.icns when supported) from the PNG renders."""
from pathlib import Path
from PIL import Image
d = Path(__file__).resolve().parent.parent / 'assets' / 'logo'
big = Image.open(d / 'logo-1024.png').convert('RGBA')
sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
big.save(d / 'logo.ico', sizes=sizes)
try:
    big.save(d / 'logo.icns')
except Exception as e:  # pragma: no cover
    print('icns skipped:', e)
