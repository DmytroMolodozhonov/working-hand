"""hw_info.py — what this computer is: its processor and its graphics cards, by name (for «Нейросеть считает на: …» in the settings).

The author 14.11: «в выборе писалось конкретную видеокарту или процессор, который есть у игрока; по умолчанию видеокарта, а не процессор».
The browser tells only the card that draws the page (and not the processor at all), so the program asks the system: Windows — the registry (processor) and PowerShell/WMI (cards),
Linux — /proc/cpuinfo and lspci, macOS — sysctl and system_profiler. Short timeouts, one answer remembered; any failure is an empty name (the page then shows what it knows itself).
"""
import json
import os
import platform
import re
import subprocess
import sys

_CACHE = None
_FAKE_CARDS = re.compile(r"Microsoft Basic|Remote Display|Virtual|Parsec|Citrix|Mirage|DisplayLink|Meta Virtual|Hyper-V|Indirect Display", re.I)


def clean_name(s):
    """«Intel(R) Core(TM) i5-12400F CPU @ 2.50GHz» → «Intel Core i5-12400F»; stray spaces and (R)/(TM) marks go."""
    s = re.sub(r"\((?:R|TM|tm|r)\)", "", str(s or ""))
    s = re.sub(r"\bCPU\b|@\s*[\d.]+\s*[GM]Hz|\b\d+-Core Processor\b|\bProcessor\b", "", s, flags=re.I)
    s = re.sub(r"\s+", " ", s).strip(" ,-")
    return s


def parse_cards(text):
    """One card per non-empty line; virtual / remote adapters are not cards. Order kept, duplicates dropped."""
    out = []
    for line in str(text or "").splitlines():
        line = re.sub(r"\s+", " ", line).strip()
        if not line or line.lower() in ("name", "-" * len(line)) or _FAKE_CARDS.search(line):
            continue
        line = clean_name(line)
        if line and line not in out:
            out.append(line)
    return out


def parse_lspci(text):
    """`lspci` lines of VGA / 3D / Display controllers → the card names (the part after the last colon, minus the [brackets] of the codes)."""
    out = []
    for line in str(text or "").splitlines():
        if not re.search(r"VGA compatible|3D controller|Display controller", line, re.I):
            continue
        name = line.split(": ", 1)[-1] if ": " in line else line
        m = re.findall(r"\[([^\]]+)\]", name)
        pick = m[-1] if m and not re.fullmatch(r"[0-9a-f]{4}:[0-9a-f]{4}", m[-1]) else re.sub(r"\s*\(rev [0-9a-f]+\)", "", name)
        pick = re.sub(r"\s*\(rev [0-9a-f]+\)", "", pick).strip()
        if pick and not _FAKE_CARDS.search(pick) and pick not in out:
            out.append(pick)
    return out


def _run(cmd, timeout=6):
    try:
        kw = {"creationflags": 0x08000000} if sys.platform == "win32" else {}  # (no console window flashing)
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, **kw)
        return r.stdout or ""
    except Exception:  # noqa: BLE001
        return ""


def cpu_name():
    try:
        if sys.platform == "win32":
            import winreg  # noqa: PLC0415
            with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"HARDWARE\DESCRIPTION\System\CentralProcessor\0") as k:
                return clean_name(winreg.QueryValueEx(k, "ProcessorNameString")[0])
        if sys.platform == "darwin":
            return clean_name(_run(["sysctl", "-n", "machdep.cpu.brand_string"]).strip())
        with open("/proc/cpuinfo", encoding="utf-8", errors="replace") as f:
            for line in f:
                if line.lower().startswith(("model name", "hardware", "cpu model")):
                    return clean_name(line.split(":", 1)[1])
    except Exception:  # noqa: BLE001
        pass
    return clean_name(platform.processor())


def _win_cards_from_registry():
    """The display adapters' own driver descriptions: no PowerShell, no console, instant (the class key of the display drivers)."""
    import winreg  # noqa: PLC0415
    base = r"SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}"
    names = []
    with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, base) as root:
        for i in range(0, 32):
            try:
                with winreg.OpenKey(root, "%04d" % i) as k:
                    names.append(str(winreg.QueryValueEx(k, "DriverDesc")[0]))
            except OSError:
                continue
    return parse_cards("\n".join(names))


def gpu_names():
    out = []
    try:
        if sys.platform == "win32":
            try:
                out = _win_cards_from_registry()
            except Exception:  # noqa: BLE001
                out = []
            if out:
                return out
            t = _run(["powershell", "-NoProfile", "-Command", "Get-CimInstance Win32_VideoController | ForEach-Object { $_.Name }"], 8)
            out = parse_cards(t) or parse_cards(_run(["wmic", "path", "win32_VideoController", "get", "name"], 6))
        elif sys.platform == "darwin":
            out = [clean_name(m) for m in re.findall(r"Chipset Model:\s*(.+)", _run(["system_profiler", "SPDisplaysDataType"], 8))]
        else:
            out = parse_lspci(_run(["lspci"], 4))
    except Exception:  # noqa: BLE001
        out = []
    return out


def hardware():
    """{cpu, gpus[], cores, ram_gb} — asked once and remembered."""
    global _CACHE  # noqa: PLW0603
    if _CACHE is None:
        _CACHE = {"cpu": cpu_name(), "gpus": gpu_names(), "cores": os.cpu_count() or 0}
    return _CACHE


if __name__ == "__main__":
    print(json.dumps(hardware(), ensure_ascii=False))
