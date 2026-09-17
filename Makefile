.PHONY: help install backend frontend infra infra-down init-kafka kafka-init check-topic produce-planner-job produce-planner produce-worker-job produce-worker migrate test build clean

PORT ?= 7500
TOPIC ?= $(or $(topic),planner.jobs)
IDS ?=

help:
	@echo "=========================================================================="
	@echo "Distributed Video Transcoding Platform - Management Commands"
	@echo "=========================================================================="
	@echo "  make install                  - Install backend Python dependencies and frontend packages"
	@echo "  make backend                  - Start FastAPI backend server on port $(PORT)"
	@echo "  make frontend                 - Start Next.js frontend dev server (http://localhost:3000)"
	@echo "  make infra                    - Start Kafka infrastructure (cd backend/infrastructure/kafka && docker compose up -d)"
	@echo "  make infra-down               - Stop Kafka infrastructure (cd backend/infrastructure/kafka && docker compose down)"
	@echo "  make init-kafka               - Run backend/scripts/init_kafka.py to create Kafka topics"
	@echo "  make check-topic [TOPIC=]     - Describe a Kafka topic (default: TOPIC=planner.jobs)"
	@echo "  make produce-planner-job [IDS=] - Publish video ID(s) to Kafka 'planner.jobs' (e.g. IDS=\"id1 id2\")"
	@echo "  make produce-worker-job [IDS=]  - Publish chunk ID(s) to Kafka 'worker.jobs' (e.g. IDS=\"id1 id2\")"
	@echo "  make migrate                  - Run Alembic database migrations on Supabase"
	@echo "  make test                     - Run backend integration test suite"
	@echo "  make build                    - Build production bundle for Next.js frontend"
	@echo "=========================================================================="

install:
	@echo "Installing backend dependencies..."
	cd backend && python3 -m venv .venv && .venv/bin/pip install -e . || .venv/bin/pip install -r pyproject.toml
	@echo "Installing frontend dependencies..."
	cd frontend && npm install

backend:
	@echo "Starting FastAPI backend on http://localhost:$(PORT)..."
	cd backend && .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port $(PORT) --reload

frontend:
	@echo "Starting Next.js frontend on http://localhost:3000..."
	cd frontend && npm run dev

infra:
	@echo "Starting Kafka infrastructure via Docker Compose..."
	cd backend/infrastructure/kafka && docker compose up -d

infra-down:
	@echo "Stopping Kafka infrastructure..."
	cd backend/infrastructure/kafka && docker compose down

init-kafka: kafka-init

kafka-init:
	@echo "Initializing Kafka topics using scripts/init_kafka.py..."
	cd backend && .venv/bin/python scripts/init_kafka.py

check-topic:
	@echo "Describing Kafka topic '$(TOPIC)' in container 'video-kafka'..."
	docker exec video-kafka \
		/opt/kafka/bin/kafka-topics.sh \
		--bootstrap-server localhost:9092 \
		--describe \
		--topic $(TOPIC)

produce-planner-job: produce-planner

produce-planner:
	@echo "Publishing planner job(s) to Kafka topic 'planner.jobs'..."
	cd backend && .venv/bin/python tests/kafka/test_planner_producer.py $(IDS)

produce-worker-job: produce-worker

produce-worker:
	@echo "Publishing worker chunk job(s) to Kafka topic 'worker.jobs'..."
	cd backend && .venv/bin/python tests/kafka/produce_chunks.py $(IDS)

migrate:
	@echo "Running Alembic migrations..."
	cd backend && .venv/bin/alembic upgrade head

test:
	@echo "Running backend test suite..."
	cd backend && .venv/bin/pytest

build:
	@echo "Building Next.js frontend production bundle..."
	cd frontend && npm run build

clean:
	@echo "Cleaning Python and Next.js caches..."
	find . -type d -name "__pycache__" -exec rm -rf {} +
	find . -type d -name ".pytest_cache" -exec rm -rf {} +
	rm -rf frontend/.next

