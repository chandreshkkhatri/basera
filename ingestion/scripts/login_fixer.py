"""Telegram-driven remote Facebook re-login for the headless VM.

When the Facebook session dies, the scraper (headless) can't log in — a human
has to complete an interactive login (2FA and all) in a real browser, and that
browser's profile has to be the one the scraper uses. This service makes that
possible **from a phone**, with no laptop:

    admin sends /relogin  ->  the service stops the runner, opens a *headful*
    Chromium (the scraper's own profile) inside a virtual display (Xvfb), and
    exposes it over VNC/noVNC bound to the Tailscale IP  ->  the admin opens the
    tailnet URL on their phone, logs in  ->  admin sends /done  ->  the service
    verifies the session, tears everything down, and restarts the runner.

Security posture:
- The browser is reachable ONLY over the private tailnet (x11vnc + websockify
  bind to the `tailscale ip -4` address, never 0.0.0.0). No public port is
  opened; the OCI security list / host firewall are untouched.
- Commands are honored only from TELEGRAM_ALERT_CHAT_ID.
- Per-session random VNC password; the browser is strictly ephemeral (torn down
  on /done or a hard timeout). No Facebook credentials are stored here — the
  admin types them into the browser view.

Runs as a systemd *user* unit (basera-login-fixer), so `systemctl --user` can
stop/start the runner. Reuses the alerting bot token + the scraper's profile.
"""

from __future__ import annotations

import logging
import os
import secrets
import shutil
import signal
import subprocess
import time
from pathlib import Path
from typing import Optional

import requests

from ..config import Settings, load_settings
from ..logging_setup import configure_logging

log = logging.getLogger("ingestion.login_fixer")

TELEGRAM_API = "https://api.telegram.org/bot{token}/{method}"
VNC_PORT = 5900
WEB_PORT = 6080
DISPLAY = ":99"
SCREEN = "1280x900x24"
SESSION_TIMEOUT_S = 15 * 60          # hard cap on an open browser session
NOVNC_WEB = "/usr/share/novnc"       # from the `novnc` apt package
RUNNER_UNIT = "basera-runner"


def _profile_dir(settings: Settings) -> str:
    return settings.chrome_user_data_dir or str(
        settings.state_path / "profiles" / "facebook"
    )


def _chromium_path() -> str:
    """Locate Playwright's bundled Chromium (the same binary the scraper uses)."""
    from playwright.sync_api import sync_playwright

    with sync_playwright() as p:
        return p.chromium.executable_path


def _tailscale_ip() -> Optional[str]:
    try:
        out = subprocess.check_output(["tailscale", "ip", "-4"], text=True, timeout=10)
    except Exception as e:  # noqa: BLE001
        log.error("tailscale ip failed (is tailscale up?): %s", e)
        return None
    ip = out.strip().splitlines()[0].strip() if out.strip() else ""
    return ip or None


class Telegram:
    def __init__(self, token: str, chat_id: str):
        self.token = token
        self.chat_id = str(chat_id)

    def send(self, text: str) -> None:
        try:
            requests.post(
                TELEGRAM_API.format(token=self.token, method="sendMessage"),
                json={
                    "chat_id": self.chat_id,
                    "text": text,
                    "disable_web_page_preview": True,
                },
                timeout=20,
            )
        except Exception as e:  # noqa: BLE001 — never crash on a send failure
            log.warning("telegram send failed: %s", e)

    def poll(self, offset: Optional[int], timeout: int = 45) -> list[dict]:
        try:
            r = requests.get(
                TELEGRAM_API.format(token=self.token, method="getUpdates"),
                params={"offset": offset, "timeout": timeout},
                timeout=timeout + 15,
            )
            return r.json().get("result", []) if r.ok else []
        except Exception as e:  # noqa: BLE001
            log.debug("getUpdates failed: %s", e)
            return []


class RemoteBrowser:
    """A live remote-browser session: Xvfb + WM + Chromium + x11vnc + websockify,
    all bound to the tailnet IP and killable as a unit."""

    def __init__(self, settings: Settings, tailnet_ip: str):
        self.settings = settings
        self.ip = tailnet_ip
        self.password = secrets.token_hex(8)  # per-session, 16 hex chars
        self.started_at = time.time()
        self._procs: list[subprocess.Popen] = []
        self._rfbauth = Path(settings.state_path) / ".vnc_rfbauth"

    @property
    def url(self) -> str:
        return (
            f"http://{self.ip}:{WEB_PORT}/vnc.html"
            f"?host={self.ip}&port={WEB_PORT}&path=websockify"
            f"&autoconnect=true&resize=scale&password={self.password}"
        )

    def _spawn(self, cmd: list[str], env: Optional[dict] = None) -> subprocess.Popen:
        proc = subprocess.Popen(
            cmd,
            env=env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,
        )
        self._procs.append(proc)
        return proc

    def start(self) -> None:
        disp_env = {**os.environ, "DISPLAY": DISPLAY}

        # 1. Virtual display + a minimal window manager.
        self._spawn(["Xvfb", DISPLAY, "-screen", "0", SCREEN, "-nolisten", "tcp"])
        time.sleep(1.5)
        self._spawn(["fluxbox"], env=disp_env)
        time.sleep(0.5)

        # 2. Headful Chromium on the scraper's own profile, at the login page.
        profile = _profile_dir(self.settings)
        chrome = _chromium_path()
        args = [
            chrome,
            f"--user-data-dir={profile}",
            "--no-first-run",
            "--no-default-browser-check",
            "--disable-blink-features=AutomationControlled",
            "--start-maximized",
            f"--window-size={SCREEN.split('x')[0]},{SCREEN.split('x')[1]}",
            "https://www.facebook.com/login",
        ]
        if self.settings.browser_no_sandbox:
            args[1:1] = ["--no-sandbox", "--disable-dev-shm-usage"]
        self._spawn(args, env=disp_env)

        # 3. Share the display over VNC (tailnet-only) + noVNC web bridge.
        #    -rfbauth stores the password obfuscated (not visible in `ps`).
        subprocess.run(
            ["x11vnc", "-storepasswd", self.password, str(self._rfbauth)],
            check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        self._spawn([
            "x11vnc", "-display", DISPLAY, "-rfbport", str(VNC_PORT),
            "-listen", self.ip, "-rfbauth", str(self._rfbauth),
            "-forever", "-shared", "-noxdamage", "-quiet",
        ])
        self._spawn([
            "websockify", "--web", NOVNC_WEB,
            f"{self.ip}:{WEB_PORT}", f"localhost:{VNC_PORT}",
        ])
        log.info("Remote browser up on %s (session started).", self.url)

    def expired(self) -> bool:
        return (time.time() - self.started_at) > SESSION_TIMEOUT_S

    def teardown(self) -> None:
        # Kill our tracked processes (whole process groups), then belt-and-braces
        # pkill the Chromium bound to this profile so the profile lock is freed.
        for proc in reversed(self._procs):
            try:
                os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
            except Exception:  # noqa: BLE001
                pass
        time.sleep(2)
        for proc in reversed(self._procs):
            try:
                os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
            except Exception:  # noqa: BLE001
                pass
        subprocess.run(
            ["pkill", "-9", "-f", f"user-data-dir={_profile_dir(self.settings)}"],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        self._rfbauth.unlink(missing_ok=True)
        self._procs.clear()
        log.info("Remote browser torn down.")


def _runner(action: str) -> None:
    subprocess.run(
        ["systemctl", "--user", action, RUNNER_UNIT],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )


def _runner_active() -> bool:
    r = subprocess.run(
        ["systemctl", "--user", "is-active", RUNNER_UNIT],
        capture_output=True, text=True,
    )
    return r.stdout.strip() == "active"


def _session_is_valid(settings: Settings) -> bool:
    """After the browser is closed, confirm the profile is actually logged in:
    navigate to Facebook headless and check the c_user cookie survives (a dead
    session gets cleared on navigation)."""
    from playwright.sync_api import sync_playwright

    profile = _profile_dir(settings)
    args = ["--disable-blink-features=AutomationControlled"]
    if settings.browser_no_sandbox:
        args += ["--no-sandbox", "--disable-dev-shm-usage"]
    try:
        with sync_playwright() as p:
            ctx = p.chromium.launch_persistent_context(
                profile, headless=True, args=args
            )
            try:
                page = ctx.pages[0] if ctx.pages else ctx.new_page()
                page.goto("https://www.facebook.com/", timeout=45000)
                page.wait_for_timeout(4000)
                cookies = ctx.cookies("https://www.facebook.com")
                return any(c["name"] == "c_user" for c in cookies)
            finally:
                ctx.close()
    except Exception as e:  # noqa: BLE001
        log.warning("session validity check failed: %s", e)
        return False


class Fixer:
    def __init__(self, settings: Settings, tg: Telegram):
        self.settings = settings
        self.tg = tg
        self.session: Optional[RemoteBrowser] = None

    def _start_session(self) -> None:
        if self.session is not None:
            self.tg.send("A re-login session is already open. Finish it with /done first.")
            return
        ip = _tailscale_ip()
        if not ip:
            self.tg.send("❌ Tailscale isn't up on the VM — can't start a private session.")
            return
        self.tg.send("Starting a re-login session… stopping the scraper and opening a browser.")
        _runner("stop")
        try:
            self.session = RemoteBrowser(self.settings, ip)
            self.session.start()
        except Exception as e:  # noqa: BLE001
            log.exception("failed to start remote browser")
            if self.session:
                self.session.teardown()
            self.session = None
            _runner("start")
            self.tg.send(f"❌ Couldn't start the remote browser: {e}\nRunner restarted.")
            return
        self.tg.send(
            "🔓 Open this on your phone (Tailscale must be connected):\n"
            f"{self.session.url}\n\n"
            f"VNC password (if asked): {self.session.password}\n\n"
            "Log in to Facebook (solve 2FA), then send /done. "
            f"Auto-closes in {SESSION_TIMEOUT_S // 60} min."
        )

    def _finish(self, reason: str) -> None:
        if self.session is None:
            return
        self.session.teardown()
        self.session = None
        self.tg.send("Checking the session and restarting the scraper…")
        ok = _session_is_valid(self.settings)
        _runner("start")
        if ok:
            self.tg.send("✅ Facebook session restored and the scraper is back up.")
        else:
            self.tg.send(
                f"⚠️ {reason}: still not logged in. The scraper is running but will "
                "keep failing — send /relogin to try again."
            )

    def _status(self) -> None:
        runner = "active" if _runner_active() else "stopped"
        if self.session:
            left = int(SESSION_TIMEOUT_S - (time.time() - self.session.started_at))
            self.tg.send(f"Re-login session OPEN ({left // 60}m left). Runner: {runner}.\n{self.session.url}")
        else:
            self.tg.send(f"No re-login session open. Runner: {runner}. Send /relogin to start one.")

    def handle(self, text: str) -> None:
        cmd = text.strip().split()[0].lower() if text.strip() else ""
        if cmd == "/relogin":
            self._start_session()
        elif cmd == "/done":
            if self.session:
                self._finish("done")
            else:
                self.tg.send("No session open. Send /relogin to start one.")
        elif cmd in ("/cancel", "/abort"):
            if self.session:
                self.session.teardown()
                self.session = None
                _runner("start")
                self.tg.send("Session cancelled; runner restarted.")
            else:
                self.tg.send("Nothing to cancel.")
        elif cmd == "/status":
            self._status()

    def tick(self) -> None:
        """Called every loop: enforce the session timeout."""
        if self.session and self.session.expired():
            self.tg.send("⏱ Re-login session timed out — closing it.")
            self._finish("timed out")


def main() -> int:
    settings = load_settings()
    configure_logging(False, settings.state_path, "login_fixer")

    missing = [t for t in ("Xvfb", "x11vnc", "websockify", "fluxbox", "tailscale")
               if shutil.which(t) is None]
    if missing:
        log.error("Missing required tools: %s. Install them on the VM.", ", ".join(missing))
        return 1
    if not settings.telegram_bot_token or not settings.telegram_alert_chat_id:
        log.error("TELEGRAM_BOT_TOKEN / TELEGRAM_ALERT_CHAT_ID not set — cannot run.")
        return 1

    tg = Telegram(settings.telegram_bot_token, settings.telegram_alert_chat_id)
    fixer = Fixer(settings, tg)
    log.info("Login-fixer started; listening for /relogin from chat %s.",
             settings.telegram_alert_chat_id)

    # Skip any commands queued before startup (don't act on a stale /relogin).
    offset: Optional[int] = None
    for u in tg.poll(offset=None, timeout=0):
        offset = u["update_id"] + 1

    while True:
        fixer.tick()
        for u in tg.poll(offset, timeout=45):
            offset = u["update_id"] + 1
            msg = u.get("message") or u.get("channel_post") or {}
            if str((msg.get("chat") or {}).get("id")) != tg.chat_id:
                continue
            text = msg.get("text") or ""
            if text.startswith("/"):
                log.info("command: %s", text.split()[0])
                try:
                    fixer.handle(text)
                except Exception as e:  # noqa: BLE001 — a bad command must not kill the loop
                    log.exception("command handling failed")
                    tg.send(f"⚠️ Error handling that command: {e}")


if __name__ == "__main__":
    raise SystemExit(main())
