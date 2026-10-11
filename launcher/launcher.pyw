# «Волшебство только начинается» — the desktop icon starts this with pythonw.exe
# (no black command window). All the work is in zns_launcher.py next to it.
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import zns_launcher  # noqa: E402

zns_launcher.main()
