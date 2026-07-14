"""Category gating for alert delivery: env toggle + admin DB toggle."""

from unittest.mock import MagicMock

from ingestion.alerts import Alerter
from ingestion.config import Settings


def make_alerter(alert_categories: str = "all", disabled_in_db=None, db_error=False):
    settings = Settings(alert_categories=alert_categories)
    repo = MagicMock()
    if db_error:
        repo.disabled_alert_categories.side_effect = RuntimeError("db down")
    else:
        repo.disabled_alert_categories.return_value = set(disabled_in_db or set())
    return Alerter(settings, repo)


def test_enabled_by_default():
    a = make_alerter()
    assert a._category_disabled("run_failure") is False


def test_env_toggle_disables():
    a = make_alerter(alert_categories="run_failure,stale_data")
    assert a._category_disabled("quota_exceeded") is True
    assert a._category_disabled("run_failure") is False


def test_env_none_disables_everything():
    a = make_alerter(alert_categories="none")
    assert a._category_disabled("run_failure") is True


def test_db_toggle_disables():
    a = make_alerter(disabled_in_db={"stale_data"})
    assert a._category_disabled("stale_data") is True
    assert a._category_disabled("run_failure") is False


def test_db_failure_means_nothing_disabled():
    # Alerting must not depend on the DB being up.
    a = make_alerter(db_error=True)
    assert a._category_disabled("run_failure") is False


def test_db_toggles_are_cached_within_ttl():
    a = make_alerter(disabled_in_db={"stale_data"})
    a._category_disabled("stale_data")
    a._category_disabled("run_failure")
    a._category_disabled("quota_exceeded")
    assert a.repo.disabled_alert_categories.call_count == 1


def test_no_repo_means_env_only():
    a = Alerter(Settings(alert_categories="all"), repo=None)
    assert a._category_disabled("run_failure") is False
