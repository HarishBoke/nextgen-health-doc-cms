# Next-Generation Healthcare Document CMS

This repository contains a React/TinyMCE frontend and Python FastAPI backend for governed CMS.gov healthcare document authoring. It is designed for ANOC, SB, EOC, provider directory, errata, and related Medicare document production with CMS model-material controls and Section 501/508 accessibility preflight.

## Local development

Run the backend from `backend` with `PYTHONPATH=. uvicorn app.main:app --reload --host 0.0.0.0 --port 8000`. Run the frontend from `frontend` with `pnpm dev` after installing dependencies. TinyMCE assets are copied into `frontend/public/tinymce` before build.

## Deployment

The included `render.yaml` defines a Render static frontend, Python API service, and managed PostgreSQL placeholder. Connect the repository to Render, create services from the blueprint, then set final production environment variables and domain names.

## Repository publication notes

This repository is configured for GitHub Actions CI and Render deployment through `render.yaml`. Keep CMS source references under controlled access and review all generated PDFs with accessibility tooling before formal distribution.
