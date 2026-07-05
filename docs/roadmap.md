# Product Roadmap

This document outlines the high-level milestones, phases, and vision for the Basera rental listings aggregator platform.

---

## Vision Statement
Basera aims to become the primary search portal for crowdsourced house-rental listings across metropolitan areas. By scraping fragmented Facebook groups and social feeds, extracting structured listing properties via AI, and geolocating addresses onto a unified map feed, Basera enables house-hunters to easily find and secure properties without broker interfaces.

---

## Completed Roadmap Phases

```mermaid
gantt
    title Basera Product Milestones
    dateFormat  YYYY-MM
    section Completed
    Phase 1: Foundation            :done, p1, 2026-01, 2026-04
    Phase 2: Admin & POI UX        :done, p2, 2026-05, 2026-06
```

### Phase 1: Foundation (Q1 - Q2) — **Completed**
Focus on creating the end-to-end data pipeline and a basic web viewing experience.
* **Database & Core Schema**: Design shared PostgreSQL tables using Drizzle ORM and mirror them in Python.
* **Basic Web UI**: Build search feed, paginated list view, and details page using Next.js.
* **CLI Ingestion**: Scrape Facebook group posts via browser automation, parse structured fields (rent, BHK, contact info) using OpenAI/Gemini tool calling, and geocode listings.

### Phase 2: Admin Tools & Map POI (Q3) — **Completed**
Enhance user filtering capabilities and simplify scraper management.
* **Leaflet Map Integration**: Map-based search interface displaying listings with cluster/custom markers.
* **Point of Interest (POI)**: Allow users to pin a custom location (e.g. office, university) and calculate straight-line distance to each listing.
* **Admin Portal (`/admin`)**: Build a secure panel (gated by `ADMIN_TOKEN`) to allow city and group registry configurations directly from the browser.
* **Decoupled Scraper Pipeline**: Split scraper execution into raw capture (`raw_posts`) and AI-processing (`listings`) with built-in retry backoffs.

---

## Future Roadmap Phases
*Currently, there are no scheduled future phases.*
