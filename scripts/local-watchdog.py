"""Windows-only, session-scoped local app recovery. No login/startup task.

Run hidden: python scripts/local-watchdog.py run
Stop monitoring (leave the app running): python scripts/local-watchdog.py stop
State and logs remain in .local. An OS file lock prevents duplicate monitors.
"""

import datetime
import msvcrt
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import time


def listening(port):
    with socket.socket() as connection:
        connection.settimeout(2)
        return connection.connect_ex(("127.0.0.1", port)) == 0


def guard(root, command, port=4317, interval=10):
    state = root / ".local"
    state.mkdir(exist_ok=True)
    stop = state / "watchdog.stop"
    with open(state / "watchdog.lock", "a+b") as lock:
        lock.write(b"0")
        lock.flush()
        lock.seek(0)
        try:
            msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
        except OSError:
            return  # Another monitor already owns this workspace.
        stop.unlink(missing_ok=True)
        (state / "watchdog.pid").write_text(str(os.getpid()), encoding="ascii")

        def log(message):
            with open(state / "watchdog.log", "a", encoding="utf-8") as output:
                output.write(f"{datetime.datetime.now().astimezone().isoformat()} {message}\n")

        child = None
        misses = 0
        retry_at = 0
        delay = 10
        log("Monitoring started")
        try:
            while not stop.exists():
                if listening(port):
                    if misses:
                        log("Local port recovered")
                    misses = 0
                    delay = 10
                else:
                    misses += 1
                    # Never start a second process while our child is starting,
                    # or kill an unresponsive process that may be doing work.
                    if (misses >= 2 and time.monotonic() >= retry_at
                            and (child is None or child.poll() is not None)):
                        env = os.environ.copy()
                        env.update(PORT=str(port), SHE_DATA_DIR=str(state), SHE_EPHEMERAL_AUTH="0")
                        try:
                            with open(state / "server-4317.stdout.log", "ab") as out, open(state / "server-4317.stderr.log", "ab") as err:
                                child = subprocess.Popen(
                                    command, cwd=root, env=env,
                                    stdin=subprocess.DEVNULL, stdout=out, stderr=err,
                                    creationflags=subprocess.CREATE_NO_WINDOW,
                                    close_fds=True,
                                )
                            log(f"App restart requested; PID {child.pid}")
                        except OSError as error:
                            log(f"Restart failed: {type(error).__name__}")
                        retry_at = time.monotonic() + delay
                        delay = min(delay * 2, 300)
                time.sleep(interval)
        finally:
            log("Monitoring stopped; app left running")
            (state / "watchdog.pid").unlink(missing_ok=True)
            lock.seek(0)
            msvcrt.locking(lock.fileno(), msvcrt.LK_UNLCK, 1)


if __name__ == "__main__":
    root = Path(__file__).resolve().parent.parent
    if sys.argv[1:] == ["stop"]:
        (root / ".local" / "watchdog.stop").touch()
        print("Monitor stop requested; app left running")
    elif sys.argv[1:] == ["run"]:
        node = shutil.which("node")
        if not node or not (root / "build/server/index.js").is_file():
            raise SystemExit("Node runtime or built server missing")
        guard(root, [node, "build/server/index.js"])
    else:
        raise SystemExit("Usage: python scripts/local-watchdog.py run|stop")
