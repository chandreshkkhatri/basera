# scraper/ — Archived

This directory held the original single-file scrapers (`telegram_bot.py`,
`whatsapp_bot.py`, `facebook_bot.py`, `main.py`). They have been **refactored
into the [`ingestion/`](../ingestion) Python package**, which writes to Postgres
instead of per-run JSON/CSV files. Use that going forward:

```bash
python -m ingestion run telegram|whatsapp|facebook
```

The old code remains in git history (commit `084b9bc`). The `results/` folder is
kept only as the source for a one-time backfill:

```bash
python -m ingestion backfill --results-dir scraper/results
```

Once you've confirmed the backfilled rows in the web app, this whole directory
can be deleted.
