"""Facebook Group source. Browser scraping + Graph API modes.

All working selectors, scroll/batch pacing, login flow, lock files and post-id
generation are ported verbatim from facebook_bot.py — only constants moved to
Settings and outputs go to RawPost instead of JSON/CSV files. The scrape-only /
offline-analyze split is now handled generically by the pipeline via raw_posts,
so this source just yields RawPost objects.
"""

from __future__ import annotations

import hashlib
import logging
import os
import re
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Iterator, Optional

import requests
from playwright.sync_api import sync_playwright

from ..config import Settings
from ..models import RawPost
from .base import SourceLoginError

log = logging.getLogger(__name__)

POST_SELECTOR = "div.x1a2a7pz[aria-posinset]"
TEXT_SELECTORS = [
    "[data-ad-preview='message']",
    "[data-testid='post_message']",
    ".userContent",
    "[data-ad-comet-preview='message']",
    "[data-testid='post-message']",
    "div[dir='auto'] span",
    ".x11i5rnm.xat24cr.x1mh8g0r",
]
TIME_SELECTORS = [
    "[data-testid='story-subtitle'] a",
    "time",
    "a[role='link'][tabindex='0']",
    ".x1i10hfl.xjbqb8w",
]
LINK_SELECTOR = "a[href*='/posts/'], a[href*='/permalink/'], a[href*='story.php']"
AUTHOR_SELECTOR = "h3 a[role='link'], strong a[role='link']"


def safe_group_dir_name(group_url_or_name: str) -> str:
    url = group_url_or_name.rstrip("/")
    if "facebook.com/groups/" in url:
        parts = url.split("facebook.com/groups/")
        if len(parts) > 1:
            name = parts[1].split("/")[0].split("?")[0]
            return "".join(c for c in name if c.isalnum() or c in ["-", "_"])
    clean = re.sub(r"[^a-zA-Z0-9_\-]", "_", group_url_or_name.strip())
    return re.sub(r"_+", "_", clean).lower()


def generate_post_id(post_url: str, text: str) -> str:
    if post_url:
        m = re.search(r"/posts/(\d+)", post_url)
        if m:
            return f"fb_post_{m.group(1)}"
        m2 = re.search(r"story_fbid=(\d+)", post_url)
        if m2:
            return f"fb_post_{m2.group(1)}"
    clean = "".join(text.split())
    digest = hashlib.md5(clean.encode("utf-8")).hexdigest()
    return f"fb_hash_{digest[:16]}"


def normalize_post_url(url: str) -> str:
    if not url:
        return url
    m = re.search(r"(https://www\.facebook\.com/groups/[^/]+/posts/\d+)", url)
    if m:
        return m.group(1) + "/"
    m2 = re.search(r"story\.php\?story_fbid=(\d+)&id=(\d+)", url)
    if m2:
        post_id, group_id = m2.group(1), m2.group(2)
        return f"https://www.facebook.com/groups/{group_id}/posts/{post_id}/"
    return url


def _is_post_href(href: str) -> bool:
    """A permalink-shaped href — the post's own link, not a profile/reaction."""
    if not href:
        return False
    return any(p in href for p in ("/posts/", "/permalink/", "story.php", "story_fbid="))


# Permalink shapes findable in raw HTML (hydrated links our selectors missed,
# comment permalinks, share dialogs). Relative or absolute.
_PERMALINK_RE = re.compile(
    r"(?:https://www\.facebook\.com)?/groups/[^/\"'?#]+/(?:posts|permalink)/\d+"
)
_STORY_RE = re.compile(r"story\.php\?story_fbid=\d+&(?:amp;)?id=\d+")

# Relative-time text Facebook uses for post timestamps ("5m", "3 hrs", "2d",
# "Yesterday at 9:41 PM", "July 8 at 3:45 PM"). Used to pick hover targets.
_TIMESTAMP_TEXT_RE = re.compile(
    r"^\s*(\d+\s*(?:s|m|h|d|w|min(?:s|utes)?|hr(?:s)?|hour(?:s)?|day(?:s)?|week(?:s)?)\b"
    r"|yesterday\b|just now\b|[a-z]+ \d{1,2}\b)",
    re.IGNORECASE,
)


def _looks_like_timestamp_text(text: str) -> bool:
    """True for short relative/absolute post-time labels — hover candidates."""
    t = " ".join((text or "").split())
    if not t or len(t) > 30:
        return False
    return bool(_TIMESTAMP_TEXT_RE.match(t))


def _permalinks_in_html(html: str) -> list[str]:
    """Permalink-shaped URLs present anywhere in a post's HTML, normalized and
    deduped, absolute. Order of appearance preserved."""
    found: list[str] = []
    for m in _PERMALINK_RE.finditer(html or ""):
        url = m.group(0)
        if url.startswith("/"):
            url = f"https://www.facebook.com{url}"
        url = normalize_post_url(url)
        if url not in found:
            found.append(url)
    for m in _STORY_RE.finditer(html or ""):
        url = normalize_post_url(
            "https://www.facebook.com/" + m.group(0).replace("&amp;", "&")
        )
        if url not in found:
            found.append(url)
    return found


def reconstruct_post_url(group: Optional[str], message_id: str) -> Optional[str]:
    """Rebuild a canonical group-post permalink from a numeric post id captured
    in the message id, when direct URL extraction came up empty. Only works when
    the id is real (fb_post_<n>, not a content hash) and the group is known."""
    m = re.match(r"fb_post_(\d+)$", message_id or "")
    if not (m and group):
        return None
    gm = re.search(r"facebook\.com/groups/([^/?#]+)", group)
    slug = gm.group(1) if gm else group.strip().strip("/")
    if not slug or "/" in slug:
        return None
    return f"https://www.facebook.com/groups/{slug}/posts/{m.group(1)}/"


def parse_facebook_time(time_text: str) -> datetime:
    """Resolve Facebook's relative/absolute post times to aware UTC datetimes.

    Naive local datetimes must never leave this function: they get stored into
    a timestamptz as if they were UTC, shifting every post ~5.5h into the
    future (IST). Absolute dates carry no year, so strptime would default to
    1900 — we graft on the current year and step back one if that lands in the
    future (a December post scraped in January).
    """
    now = datetime.now(timezone.utc)
    try:
        t = time_text.lower()
        if "min" in t:
            return now - timedelta(minutes=int(re.search(r"(\d+)", t).group(1)))
        if "hour" in t or "hr" in t or t.endswith("h"):
            return now - timedelta(hours=int(re.search(r"(\d+)", t).group(1)))
        if "yesterday" in t:
            return now - timedelta(days=1)
        if "day" in t:
            return now - timedelta(days=int(re.search(r"(\d+)", t).group(1)))
        try:
            # Parse with the year embedded: Facebook omits it, and yearless
            # strptime defaults to 1900 (and changes behavior in Python 3.15).
            parsed = datetime.strptime(f"{now.year} {t}", "%Y %B %d at %I:%M %p")
            parsed = parsed.replace(tzinfo=timezone.utc)
            if parsed > now + timedelta(days=1):
                parsed = parsed.replace(year=now.year - 1)
            return min(parsed, now)
        except ValueError:
            return now
    except Exception:  # noqa: BLE001
        return now


class GroupLock:
    """Per-group PID lock so cron + manual runs don't collide on a profile."""

    def __init__(self, settings: Settings, group: str):
        self.path = settings.state_path / "locks"
        self.path.mkdir(parents=True, exist_ok=True)
        self.lock_file = self.path / f"{safe_group_dir_name(group)}.lock"

    def acquire(self) -> bool:
        if self.lock_file.exists():
            try:
                pid = int(self.lock_file.read_text().strip())
                os.kill(pid, 0)
                log.error("Another scraper (PID %d) is running on this group.", pid)
                return False
            except (OSError, ValueError):
                log.warning("Removing stale lock file.")
        self.lock_file.write_text(str(os.getpid()))
        return True

    def release(self) -> None:
        try:
            self.lock_file.unlink(missing_ok=True)
        except Exception as e:  # noqa: BLE001
            log.debug("Lock release failed: %s", e)


class FacebookSource:
    name = "facebook"

    def __init__(self, settings: Settings, use_api: bool = False):
        self.settings = settings
        self.use_api = use_api
        self.playwright = None
        self.context = None
        self._clicks_used = 0
        self.page = None

    # -- entry -----------------------------------------------------------
    def iter_posts(
        self, target: Optional[str] = None, limit: Optional[int] = None
    ) -> Iterator[RawPost]:
        group = target or self.settings.facebook_target_group
        if not group:
            raise SystemExit("No Facebook group (pass --group or FACEBOOK_TARGET_GROUP).")
        max_posts = limit or self.settings.facebook_max_posts

        if self.use_api and self.settings.fb_access_token and self.settings.fb_group_id:
            yield from self._iter_api(
                self.settings.fb_group_id, self.settings.fb_access_token, max_posts
            )
        else:
            yield from self._iter_browser(group, max_posts)

    # -- Graph API mode --------------------------------------------------
    def _iter_api(
        self, group_id: str, token: str, max_posts: int
    ) -> Iterator[RawPost]:
        version = self.settings.fb_graph_version
        api_url: Optional[str] = f"https://graph.facebook.com/{version}/{group_id}/feed"
        params: dict = {
            "fields": "id,message,created_time,permalink_url,from",
            "access_token": token,
            "limit": min(100, max_posts),
        }
        fetched = 0
        while api_url and fetched < max_posts:
            resp = requests.get(api_url, params=params or None, timeout=15)
            params = {}
            if resp.status_code != 200:
                log.error("Graph API error %s: %s", resp.status_code, resp.text[:300])
                return
            data = resp.json()
            rows = data.get("data", [])
            if not rows:
                return
            for post in rows:
                if fetched >= max_posts:
                    return
                text = post.get("message", "")
                if not text:
                    continue
                fetched += 1
                post_id = post.get("id")
                post_url = post.get(
                    "permalink_url",
                    f"https://www.facebook.com/groups/{group_id}/posts/{post_id}/",
                )
                posted_at = self._parse_created_time(post.get("created_time"))
                author = (post.get("from") or {}).get("name")
                yield RawPost(
                    source=self.name,
                    source_id=post_id,
                    text=text,
                    posted_at=posted_at,
                    source_group=group_id,
                    source_url=post_url,
                    author_name=author,
                    author_url=post_url,
                    meta={"mode": "api"},
                )
            api_url = data.get("paging", {}).get("next")

    @staticmethod
    def _parse_created_time(created: Optional[str]) -> Optional[datetime]:
        if not created:
            return None
        try:
            return datetime.strptime(created, "%Y-%m-%dT%H:%M:%S%z")
        except ValueError:
            return None

    # -- browser mode ----------------------------------------------------
    def _iter_browser(self, group: str, max_posts: int) -> Iterator[RawPost]:
        s = self.settings
        html_dir = s.state_path / "html" / safe_group_dir_name(group)
        if s.save_html:
            html_dir.mkdir(parents=True, exist_ok=True)

        self._setup_playwright()
        try:
            # Raise (not return) so the run is recorded as login_failed/error
            # instead of a phantom "success" with 0 posts.
            if not self._login():
                profile = s.chrome_user_data_dir or str(s.state_path / "profiles" / "facebook")
                raise SourceLoginError(
                    f"Facebook login expired or timed out (profile: {profile})"
                )
            if not self._navigate(group):
                raise RuntimeError(f"Facebook group page failed to load: {group}")
            self._switch_to_new_listings()

            seen_in_run: set[str] = set()
            start = time.time()
            selector = f"{POST_SELECTOR}:not([data-processed='true'])"
            scroll_retries = 0
            produced = 0

            while produced < max_posts and (time.time() - start) < s.max_scroll_time_s:
                locator = self.page.locator(selector)
                current = locator.count()
                candidates = []
                for i in range(current):
                    post = locator.nth(i)
                    try:
                        cls = post.get_attribute("class") or ""
                        if "x1a2a7pz" not in cls:
                            continue
                    except Exception as e:  # noqa: BLE001
                        log.debug("class read failed: %s", e)
                        continue
                    post_url = self._post_url(post)
                    if post_url and post_url in seen_in_run:
                        continue
                    candidates.append((post, post_url))

                if not candidates:
                    self.page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                    self.page.wait_for_timeout(3000)
                    if self.page.locator(selector).count() <= current:
                        scroll_retries += 1
                        if scroll_retries >= 3:
                            log.info("No new posts after 3 scrolls; stopping.")
                            break
                    else:
                        scroll_retries = 0
                    continue

                scroll_retries = 0
                batch = candidates[: s.fb_batch_size]
                for post, post_url in batch:
                    if produced >= max_posts:
                        break
                    try:
                        post.scroll_into_view_if_needed(timeout=2000)
                        self.page.wait_for_timeout(500)
                        post.evaluate("el => el.setAttribute('data-processed','true')")
                    except Exception as e:  # noqa: BLE001
                        log.debug("prepare element failed: %s", e)
                        continue

                    data = self._extract_post(post) or {}
                    url = data.get("post_url") or post_url
                    text = " ".join(data.get("text", "").split())
                    if not text:
                        continue
                    message_id = generate_post_id(url, text)
                    if message_id in seen_in_run:
                        continue
                    seen_in_run.add(message_id)

                    # Last resort: rebuild the permalink from the post id when
                    # direct extraction failed but the id is real.
                    if not url:
                        url = reconstruct_post_url(group, message_id) or ""

                    meta = {"mode": "browser"}
                    if s.save_html:
                        html_path = html_dir / f"{message_id}.html"
                        self._save_html(post, html_path)
                        meta["html_file"] = str(html_path)

                    produced += 1
                    yield RawPost(
                        source=self.name,
                        source_id=message_id,
                        text=text,
                        posted_at=data.get("timestamp"),
                        source_group=group,
                        source_url=url or None,
                        author_name=data.get("author_name"),
                        author_url=url or None,
                        meta=meta,
                    )

                self.page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                self.page.wait_for_timeout(1000)
        finally:
            self._teardown()

    # -- browser helpers (selectors verbatim) ----------------------------
    def _setup_playwright(self) -> None:
        s = self.settings
        self._clicks_used = 0  # per-run cap for click-through URL resolution
        self.playwright = sync_playwright().start()
        user_data = s.chrome_user_data_dir or str(s.state_path / "profiles" / "facebook")
        launch_options: dict = {"headless": s.headless}
        args = ["--disable-blink-features=AutomationControlled"]
        if s.browser_no_sandbox:
            # No Chromium sandbox on servers/containers; avoid /dev/shm too.
            args += ["--no-sandbox", "--disable-dev-shm-usage"]
        else:
            # Desktop: keep the sandbox (strip Playwright's default --no-sandbox).
            launch_options["ignore_default_args"] = ["--no-sandbox"]
        if s.browser_channel:
            launch_options["channel"] = s.browser_channel
        try:
            self.context = self.playwright.chromium.launch_persistent_context(
                user_data_dir=user_data,
                args=args,
                **launch_options,
            )
            self.page = self.context.pages[0] if self.context.pages else self.context.new_page()
        except Exception as e:  # noqa: BLE001
            channel = s.browser_channel or "bundled Chromium"
            log.warning("Profile launch failed (%s); plain %s", e, channel)
            browser = self.playwright.chromium.launch(args=args, **launch_options)
            self.context = browser.new_context()
            self.page = self.context.new_page()

    def _login(self) -> bool:
        self.page.goto("https://www.facebook.com")
        # The c_user session cookie is Facebook's canonical logged-in signal
        # and is DOM-independent: headless Chrome gets a page variant without
        # [data-testid='home-icon'] even when the session is perfectly valid.
        self.page.wait_for_timeout(2000)
        if self._logged_in_cookie():
            log.info("Already logged in to Facebook (session cookie present)")
            return True
        try:
            self.page.wait_for_selector("[data-testid='home-icon']", timeout=10000)
            log.info("Already logged in to Facebook")
            return True
        except Exception:  # noqa: BLE001
            pass
        # Headless: nobody can complete an interactive login, so don't burn
        # the full login_timeout_ms (5 min) per group — fail fast instead.
        if self.settings.headless:
            log.error("Not logged in and running headless; cannot log in interactively.")
            return False
        log.info("Please log in to Facebook in the browser window...")
        try:
            self.page.wait_for_selector(
                "[data-testid='home-icon'], [aria-label='Facebook']",
                timeout=self.settings.login_timeout_ms,
            )
            log.info("Logged in to Facebook")
            return True
        except Exception:  # noqa: BLE001
            # Selector may be missing from this page variant even after a
            # successful interactive login — trust the cookie before failing.
            if self._logged_in_cookie():
                log.info("Logged in to Facebook (session cookie present)")
                return True
            log.error("Login timed out.")
            return False

    def _logged_in_cookie(self) -> bool:
        try:
            cookies = self.context.cookies("https://www.facebook.com")
            return any(c["name"] == "c_user" for c in cookies)
        except Exception as e:  # noqa: BLE001
            log.debug("cookie check failed: %s", e)
            return False

    def _navigate(self, group: str) -> bool:
        if group.startswith("http"):
            self.page.goto(group)
        else:
            self.page.goto(f"https://www.facebook.com/search/groups/?q={group}")
            try:
                sel = "[role='article'] a"
                self.page.wait_for_selector(sel, timeout=self.settings.selector_timeout_ms)
                self.page.click(sel)
            except Exception as e:  # noqa: BLE001
                log.error("Could not find group '%s': %s", group, e)
                return False
        try:
            self.page.wait_for_selector("[role='main']", timeout=self.settings.selector_timeout_ms)
            return True
        except Exception:  # noqa: BLE001
            log.error("Group page failed to load")
            return False

    def _switch_to_new_listings(self) -> None:
        try:
            sort_menu = self.page.locator("[aria-label='Sort group posts']")
            sort_menu.wait_for(timeout=10000)
            sort_menu.click()
            new_btn = self.page.locator("//span[text()='New listings']")
            new_btn.wait_for(timeout=5000)
            new_btn.click()
            self.page.wait_for_timeout(2000)
            log.info("Switched to New listings feed")
        except Exception as e:  # noqa: BLE001
            log.debug("Could not switch feed: %s", e)

    def _post_url(self, post) -> str:
        """FAST path only — called for every visible post on every scroll pass,
        so it must stay cheap. The interactive ladder lives in
        _post_url_aggressive (once per processed post)."""
        # 1. The timestamp usually links to the post permalink.
        url = ""
        try:
            time_elem = post.locator("time")
            if time_elem.count() > 0:
                parent = time_elem.locator("xpath=./ancestor::a")
                if parent.count() > 0:
                    url = parent.first.get_attribute("href") or ""
        except Exception as e:  # noqa: BLE001
            log.debug("time-anchor url failed: %s", e)
        # 2. Otherwise scan candidate anchors for the first permalink-shaped one
        #    (the first match isn't always the post link, so check each).
        if not _is_post_href(url):
            try:
                links = post.locator(LINK_SELECTOR)
                for i in range(min(links.count(), 8)):
                    href = links.nth(i).get_attribute("href") or ""
                    if _is_post_href(href):
                        url = href
                        break
            except Exception as e:  # noqa: BLE001
                log.debug("link url failed: %s", e)
        return normalize_post_url(url)

    def _post_url_aggressive(self, post) -> str:
        """Escalation ladder for the post permalink. Facebook renders the
        timestamp as a bare role=link node and only materializes the real
        <a href=…> ON HOVER, so steps 2+ interact with the page — slower per
        post, which is the accepted tradeoff for actually having links.
        1. fast selector pass  2. hover timestamps, rescan anchors
        3. regex the raw HTML  4. click-through and read the URL (capped)."""
        url = self._post_url(post)
        if url:
            return url

        hovered = self._hover_timestamps(post)
        if hovered:
            url = self._scan_anchors(post)
            if url:
                return url

        try:
            permalinks = _permalinks_in_html(post.inner_html())
            if permalinks:
                return permalinks[0]
        except Exception as e:  # noqa: BLE001
            log.debug("html permalink scan failed: %s", e)

        return self._post_url_via_click(post)

    def _timestamp_nodes(self, post, limit: int):
        """Yield role=link nodes whose accessible text looks like a post time."""
        found = 0
        try:
            nodes = post.locator("[role='link']")
            for i in range(min(nodes.count(), 25)):
                if found >= limit:
                    return
                node = nodes.nth(i)
                try:
                    text = (
                        node.get_attribute("aria-label")
                        or node.get_attribute("title")
                        or node.inner_text(timeout=500)
                    )
                except Exception:  # noqa: BLE001
                    continue
                if _looks_like_timestamp_text(text or ""):
                    found += 1
                    yield node
        except Exception as e:  # noqa: BLE001
            log.debug("timestamp node scan failed: %s", e)

    def _hover_timestamps(self, post) -> int:
        """Hover timestamp-ish nodes to make Facebook hydrate their hrefs."""
        s = self.settings
        hovered = 0
        for node in self._timestamp_nodes(post, s.url_hover_max_candidates):
            try:
                node.hover(timeout=1500)
                self.page.wait_for_timeout(s.url_hover_wait_ms)
                hovered += 1
            except Exception as e:  # noqa: BLE001
                log.debug("hover failed: %s", e)
        return hovered

    def _scan_anchors(self, post) -> str:
        try:
            links = post.locator("a[href]")
            for i in range(min(links.count(), 15)):
                href = links.nth(i).get_attribute("href") or ""
                if _is_post_href(href):
                    return normalize_post_url(href)
        except Exception as e:  # noqa: BLE001
            log.debug("anchor rescan failed: %s", e)
        return ""

    def _post_url_via_click(self, post) -> str:
        """Last resort: click the timestamp and read the resulting URL.
        Facebook usually opens the permalink as a modal (URL changes, feed
        stays mounted underneath), so go_back() restores the feed intact.
        Capped per run — this is the slowest rung."""
        s = self.settings
        if not s.url_click_fallback or self._clicks_used >= s.url_click_max_per_run:
            return ""
        before = self.page.url
        captured = ""
        for node in self._timestamp_nodes(post, 1):
            self._clicks_used += 1
            try:
                node.click(timeout=2000)
                self.page.wait_for_url(
                    lambda u: u != before, timeout=s.url_click_wait_ms
                )
            except Exception as e:  # noqa: BLE001
                log.debug("click-through nav failed: %s", e)
            current = self.page.url
            if current != before and _is_post_href(current):
                captured = normalize_post_url(current)
                log.info("Resolved post URL via click-through (%d/%d used)",
                         self._clicks_used, s.url_click_max_per_run)
            try:
                if self.page.url != before:
                    self.page.go_back()
                    self.page.wait_for_timeout(1500)
            except Exception as e:  # noqa: BLE001
                log.debug("go_back after click failed: %s", e)
        return captured

    def _extract_post(self, post) -> Optional[dict]:
        try:
            # Expand "See more".
            try:
                buttons = post.locator(
                    "[role='button']:has-text('See more'), "
                    "[role='button']:has-text('See More')"
                )
                for i in range(buttons.count()):
                    try:
                        buttons.nth(i).click(timeout=1000)
                    except Exception as e:  # noqa: BLE001
                        log.debug("See more click failed: %s", e)
            except Exception as e:  # noqa: BLE001
                log.debug("See more locate failed: %s", e)

            post_text = ""
            for selector in TEXT_SELECTORS:
                try:
                    loc = post.locator(selector)
                    for i in range(loc.count()):
                        t = loc.nth(i).inner_text().strip()
                        if t and len(t) > len(post_text):
                            post_text = t
                except Exception as e:  # noqa: BLE001
                    log.debug("text selector %s failed: %s", selector, e)
            if not post_text:
                return None

            timestamp = datetime.now(timezone.utc)
            try:
                for selector in TIME_SELECTORS:
                    tl = post.locator(selector)
                    found = False
                    for i in range(tl.count()):
                        el = tl.nth(i)
                        tx = el.get_attribute("title") or el.get_attribute("aria-label") or el.inner_text()
                        if tx and any(w in tx.lower() for w in ["ago", "at", "yesterday", "hour", "min"]):
                            timestamp = parse_facebook_time(tx)
                            found = True
                            break
                    if found:
                        break
            except Exception as e:  # noqa: BLE001
                log.debug("timestamp extract failed: %s", e)

            # Best-effort author name; never let a miss break extraction.
            author_name = None
            try:
                al = post.locator(AUTHOR_SELECTOR)
                if al.count() > 0:
                    author_name = (al.first.inner_text() or "").strip() or None
            except Exception as e:  # noqa: BLE001
                log.debug("author extract failed: %s", e)

            return {
                "text": post_text,
                "timestamp": timestamp,
                "post_url": self._post_url_aggressive(post),
                "author_name": author_name,
            }
        except Exception as e:  # noqa: BLE001
            log.debug("extract_post failed: %s", e)
            return None

    def _save_html(self, post, path: Path) -> None:
        try:
            path.write_text(post.inner_html(), encoding="utf-8")
        except Exception as e:  # noqa: BLE001
            log.debug("save html failed: %s", e)

    def _teardown(self) -> None:
        try:
            if self.context:
                self.context.close()
        except Exception as e:  # noqa: BLE001
            log.debug("context close failed: %s", e)
        try:
            if self.playwright:
                self.playwright.stop()
        except Exception as e:  # noqa: BLE001
            log.debug("playwright stop failed: %s", e)
