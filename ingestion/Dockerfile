# Container for the Python ingestion engine. Best suited to Graph API mode
# (`run --api`) and DB-side commands (analyze, backfill, groups, check) on a
# server/cron. The browser scraper needs a one-time interactive Facebook login
# with a real display, so do that first run on a workstation — the persisted
# session under ingestion/state/ then lets the container run unattended.
#
# Build (from repo root):  docker build -f ingestion/Dockerfile -t basera-ingestion .
# Run:                     docker run --rm --env-file .env \
#                            -v "$PWD/ingestion/state:/app/ingestion/state" \
#                            basera-ingestion run --api
FROM python:3.12-slim

WORKDIR /app
ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    HEADLESS=true \
    BROWSER_CHANNEL= \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

COPY ingestion/requirements.txt ./ingestion/requirements.txt
RUN pip install -r ingestion/requirements.txt \
    && python -m playwright install --with-deps chromium

COPY ingestion ./ingestion

# Persist Facebook sessions, browser profiles, HTML snapshots, and logs.
VOLUME ["/app/ingestion/state"]

ENTRYPOINT ["python", "-m", "ingestion"]
CMD ["check"]
