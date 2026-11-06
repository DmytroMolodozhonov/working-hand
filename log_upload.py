"""log_upload.py — the author's game journals go to GitHub by themselves (the author 06.11: «логи брались после каждой игры
и отправлялись на гитхаб… пока ток мои логи»).

How (no key inside the game — the security rule): the game folder is a git clone (the launcher «Обновить и запустить игру.bat»
makes it so); git on the author's computer is already signed in to GitHub. After a game (a new game began, the journal is quiet
for IDLE_S, or the server stops) the journals of logs/games/ (already anonymous — server.anon) are put on the branch `logs`
in the folder `games/` of the same repository. Files older than KEEP_S go from the branch too.

Nothing of the player's folder is touched: no checkout, no index, no HEAD — a commit is made by git's plumbing with a
separate index file, and pushed by its id. A computer without push rights (any other player), without git, or without a
login: the push fails quietly, the reason once in the console — the game is never held up (a background thread).
Off: ZNS_LOG_UPLOAD=0. Tests: tests/python/test_log_upload.py.
"""
import os
import re
import subprocess
import tempfile
import threading
import time

BRANCH = "logs"
FOLDER = "games"
KEEP_S = 2 * 24 * 3600
IDLE_S = 5 * 60  # (a quiet journal: the game is over or paused — what there is goes up)
NAME_RE = re.compile(r"^game-(\d{8})-(\d{6})\.log$")

_lock = threading.Lock()
_busy = False
_said = set()
_timer = None


def _say(key, text):
    if key not in _said:
        _said.add(key)
        print(f"  [Логи → GitHub] {text}")


def _git(root, *args, env=None, inp=None, timeout=60):
    e = dict(os.environ)
    e.update({"GIT_TERMINAL_PROMPT": "0", "GCM_INTERACTIVE": "never", "GIT_ASKPASS": "", "SSH_ASKPASS": ""})
    if env:
        e.update(env)
    flags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
    r = subprocess.run(["git", "-c", "credential.interactive=never", *args], cwd=root, env=e, input=inp,
                       capture_output=True, text=True, timeout=timeout, creationflags=flags)
    return r.returncode, (r.stdout or "").strip(), (r.stderr or "").strip()


def enabled(root):
    if os.environ.get("ZNS_LOG_UPLOAD", "1") == "0":
        return False
    try:
        code, out, _ = _git(root, "rev-parse", "--is-inside-work-tree", timeout=10)
    except (OSError, subprocess.SubprocessError):
        _say("nogit", "git не найден — журналы остаются только в папке logs/games")
        return False
    if code != 0 or out != "true":
        _say("noclone", "папка игры — не копия репозитория, журналы остаются в logs/games")
        return False
    return True


def stamp(name):
    """The game's start time from its file name (game-YYYYmmdd-HHMMSS.log), or None."""
    m = NAME_RE.match(name)
    if not m:
        return None
    try:
        return time.mktime(time.strptime(m.group(1) + m.group(2), "%Y%m%d%H%M%S"))
    except ValueError:
        return None


def upload(root, games_dir, now=None):
    """Put the journals on the branch `logs` (merging with what is there); True if pushed or nothing new."""
    now = time.time() if now is None else now
    local = sorted(f for f in os.listdir(games_dir) if NAME_RE.match(f)) if os.path.isdir(games_dir) else []
    if not local:
        return True
    code, _, err = _git(root, "fetch", "-q", "origin", f"+refs/heads/{BRANCH}:refs/zns/{BRANCH}", timeout=120)
    has = code == 0
    if not has and "couldn't find remote ref" not in err and "could not find remote ref" not in err.lower():
        _say("fetch", f"не получилось связаться с GitHub ({err[-160:]}) — попробую после следующей игры")
        return False
    fd, index = tempfile.mkstemp(prefix="zns-logs-index-")
    os.close(fd)
    os.remove(index)  # (git makes it itself)
    env = {"GIT_INDEX_FILE": index}
    try:
        if has:
            _git(root, "read-tree", f"refs/zns/{BRANCH}", env=env)
        # the old ones go
        code, out, _ = _git(root, "ls-files", "-z", env=env)
        for p in [x for x in out.split("\0") if x]:
            t = stamp(os.path.basename(p))
            if t is not None and now - t > KEEP_S:
                _git(root, "update-index", "--force-remove", "--", p, env=env)
        for f in local:
            t = stamp(f)
            if t is not None and now - t > KEEP_S:
                continue
            code, sha, err = _git(root, "hash-object", "-w", "--", os.path.join(games_dir, f))
            if code != 0:
                continue
            _git(root, "update-index", "--add", "--cacheinfo", f"100644,{sha},{FOLDER}/{f}", env=env)
        code, tree, err = _git(root, "write-tree", env=env)
        if code != 0:
            _say("tree", f"не собрать: {err[-160:]}")
            return False
        if has:
            _, old_tree, _ = _git(root, "rev-parse", f"refs/zns/{BRANCH}^{{tree}}")
            if old_tree == tree:
                return True  # (nothing new)
        who = {"GIT_AUTHOR_NAME": "ZNS logs", "GIT_AUTHOR_EMAIL": "logs@zns.local", "GIT_COMMITTER_NAME": "ZNS logs", "GIT_COMMITTER_EMAIL": "logs@zns.local"}
        parent = ["-p", f"refs/zns/{BRANCH}"] if has else []
        code, commit, err = _git(root, "commit-tree", tree, *parent, "-m", "Журналы игр " + time.strftime("%Y-%m-%d %H:%M", time.localtime(now)), env=who)
        if code != 0:
            _say("commit", f"не собрать: {err[-160:]}")
            return False
        code, _, err = _git(root, "push", "-q", "origin", f"{commit}:refs/heads/{BRANCH}", timeout=120)
        if code != 0:
            _say("push", f"GitHub не принял ({err[-200:]}) — нужен вход в GitHub с правом записи; журналы остаются в logs/games")
            return False
        _say("ok", f"журналы игр отправлены на GitHub (ветка «{BRANCH}», папка «{FOLDER}»)")
        return True
    except (OSError, subprocess.SubprocessError) as e:
        _say("err", f"не отправить: {e}")
        return False
    finally:
        try:
            os.remove(index)
        except OSError:
            pass


def upload_soon(root, games_dir):
    """In a background thread; one at a time (a second call while one runs is dropped: the next game takes it)."""
    global _busy
    with _lock:
        if _busy:
            return
        _busy = True

    def run():
        global _busy
        try:
            if enabled(root):
                upload(root, games_dir)
        finally:
            with _lock:
                _busy = False

    threading.Thread(target=run, name="zns-log-upload", daemon=True).start()


def touched(root, games_dir):
    """The journal was written: after IDLE_S of quiet the journals go up (the game is over or paused)."""
    global _timer
    if _timer:
        _timer.cancel()
    _timer = threading.Timer(IDLE_S, upload_soon, args=(root, games_dir))
    _timer.daemon = True
    _timer.start()


def at_exit(root, games_dir):
    """The server stops: the last game goes up now (in this thread — at most ~2 min)."""
    if _timer:
        _timer.cancel()
    try:
        if enabled(root):
            upload(root, games_dir)
    except Exception as e:  # (never a crash on the way out)
        print(f"  [Логи → GitHub] {e}")
