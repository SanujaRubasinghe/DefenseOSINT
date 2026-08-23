.PHONY: setup up down logs test lint

setup:          ## venv + shared package + dev tools
	cp -n .env.example .env || true
	python -m venv .venv
	./.venv/bin/pip install -U pip
	./.venv/bin/pip install -e shared -r requirements-dev.txt
	cd frontend && npm install

up:             ## start everything
	docker compose up -d --build

down:
	docker compose down

logs:           ## make logs S=collector-agent
	docker compose logs -f $(S)

test:
	pytest -q

lint:
	ruff check .
