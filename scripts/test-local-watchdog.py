"""Isolated recovery test; never stops the user's app or reads credentials."""
import os
from pathlib import Path
import signal
import socket
import subprocess
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parent.parent
monitor_path = ROOT / "scripts/local-watchdog.py"
(ROOT / "work").mkdir(exist_ok=True)


def wait_for(check, timeout=25):
    until = time.monotonic() + timeout
    while time.monotonic() < until:
        if check():
            return
        time.sleep(0.1)
    raise AssertionError("Timed out waiting for isolated test state")


with tempfile.TemporaryDirectory(dir=ROOT / "work") as directory:
    root = Path(directory)
    state = root / ".local"
    state.mkdir()
    with socket.socket() as reservation:
        reservation.bind(("127.0.0.1", 0))
        port = reservation.getsockname()[1]
    child_code = (
        "import http.server,os,pathlib; "
        "pathlib.Path('.local/fake-server.pid').write_text(str(os.getpid())); "
        f"http.server.HTTPServer(('127.0.0.1',{port}),http.server.SimpleHTTPRequestHandler).serve_forever()"
    )
    command = [sys.executable, "-c", child_code]
    guard_code = (
        "import runpy,pathlib; "
        f"runpy.run_path({str(monitor_path)!r})['guard'](pathlib.Path({str(root)!r}), {command!r}, {port}, 0.1)"
    )

    def connected():
        with socket.socket() as connection:
            connection.settimeout(0.2)
            return connection.connect_ex(("127.0.0.1", port)) == 0

    def launch():
        return subprocess.Popen(
            [sys.executable, "-c", guard_code], cwd=root,
            stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL, creationflags=subprocess.CREATE_NO_WINDOW,
        )

    guard = launch()
    try:
        wait_for(connected)
        pid_file = state / "fake-server.pid"
        first_pid = int(pid_file.read_text())
        duplicate = launch()
        assert duplicate.wait(timeout=5) == 0
        assert int(pid_file.read_text()) == first_pid
        os.kill(first_pid, signal.SIGTERM)  # Only this test's dummy HTTP server.
        wait_for(lambda: int(pid_file.read_text()) != first_pid and connected())
        (state / "watchdog.stop").touch()
        assert guard.wait(timeout=5) == 0
        assert connected(), "Stopping the monitor must leave the app running"
        print("PASS: automatic start, crash recovery, duplicate monitor prevention, stop preserves app")
    finally:
        (state / "watchdog.stop").touch()
        if guard.poll() is None:
            guard.wait(timeout=5)
        pid_file = state / "fake-server.pid"
        if pid_file.exists():
            try:
                os.kill(int(pid_file.read_text()), signal.SIGTERM)
            except OSError:
                pass
        time.sleep(0.2)
