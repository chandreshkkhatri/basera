# Sprints & Development History

This document outlines the historical, current, and upcoming development sprints for Basera.

---

## Sprint Cadence
Basera follows a **2-week sprint cycle**. Sprints begin on alternate Mondays, starting with planning and closing with retro reviews.

---

## Current Sprint: Sprint 4 (Active)
**Dates**: July 1 - July 14, 2026

### Sprint Goal
Establish codebase structure stability, formulate mobile responsiveness strategies, and create comprehensive onboarding documentation.

### Sprint Backlog & Status
* **[x] Documentation Suite (`BSR-090`)**:
  * Create `architecture.md` (System components, schemas, shared DB contract).
  * Create `development.md` (Local workspace setup, Docker, Next.js, Python CLI, common commands).
  * Create `ingestion_pipeline.md` (Decoupled capture phase, AI/LLM structured extraction, Google Maps API, retry rules).
  * Create `deployment.md` (TLS database config, GitHub Actions workflow, Vercel deployments, production scraper scheduling).
* **[x] Planning Docs (`BSR-091`)**:
  * Author the product `roadmap.md` and feature `backlog.md` guides.
* **[/] Mobile Responsiveness Optimization (`BSR-108`)**:
  * Formulate design changes to improve mobile usability (active document analysis).

---

## Upcoming Sprint: Sprint 5 (Planned)
**Dates**: July 15 - July 28, 2026

### Sprint Goal
Expand listing sources and optimize mapping rendering performance.

### Scheduled Backlog Items
1. **BSR-101: Telegram Channel Ingestion** (Priority: High): Build ingestion flow for Telegram listings using Telethon.
2. **BSR-103: Leaflet Marker Clustering** (Priority: High): Fix map rendering lag by grouping close-by map listings.
3. **BSR-105: Python Engine Unit Tests** (Priority: Medium): Set up pytest workspace tests.

---

## Sprint History

### Sprint 3: Administrative Control
**Dates**: June 17 - June 30, 2026
* **Goal**: Provide UI mechanisms to configure target groups and cities dynamically.
* **Delivered**:
  * Built the gated `/admin` panel using Next.js route protection cookie authentication.
  * Moved Facebook group URLs out of static JSON configuration files into database tables (`cities`, `groups`).
  * Updated Python ingestion scripts to query the database table mappings before executing runs.

### Sprint 2: Map Feed & User Customization
**Dates**: June 3 - June 16, 2026
* **Goal**: Map integrations and POI calculations.
* **Delivered**:
  * Built the `/map` page using Leaflet and OpenStreetMap.
  * Added custom Point of Interest (POI) selector to allow search results distance sorting.
  * Developed the multi-city seed generator script (`npm run db:seed`) to enable quick local database creation.

### Sprint 1: The Core Ingestion Pipeline
**Dates**: May 20 - June 2, 2026
* **Goal**: Complete the end-to-end flow from scraper capture to processed listings.
* **Delivered**:
  * Implemented the Python Playwright engine to scrape Facebook postings.
  * Integrated OpenAI/Gemini LLM tool calling schema extraction.
  * Added Google Maps Geocoding API coordinate resolution.
  * Setup Drizzle migrations and initial tables schemas in Postgres.
