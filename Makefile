# Cross-platform: Windows uses .venv/Scripts, macOS/Linux uses .venv/bin
ifeq ($(OS),Windows_NT)
    VENV := .venv/Scripts
else
    VENV := .venv/bin
endif
PY := $(VENV)/python

.PHONY: help setup up down logs test lint

help:
	@echo "setup  - create venv, install shared package and dev tools"
	@echo "up     - build and start all services"
	@echo "down   - stop all services"
	@echo "logs   - tail one service:  make logs S=collector-agent"
	@echo "test   - run pytest"
	@echo "lint   - run ruff"

setup:
	python -c "import os,shutil; shutil.copy('.env.example','.env') if not os.path.exists('.env') else print('.env already exists')"
	python -m venv .venv
	$(PY) -m pip install -U pip
	$(PY) -m pip install -e shared -r requirements-dev.txt
	cd frontend && npm install

up:
	docker compose up -d --build

down:
	docker compose down

logs:
	docker compose logs -f $(S)

test:
	$(PY) -m pytest -q

lint:
	$(PY) -m ruff check .