<img width="4076" height="2315" alt="Screenshot from 2026-09-25 22-46-19" src="https://github.com/user-attachments/assets/2de5be30-1e79-41a3-b3cd-bedbd32c7546" /># Transcode.io — Fault-Tolerant Distributed Video Transcoding Platform

An enterprise-grade, event-driven video processing pipeline that ingests high-resolution video assets, dynamically splits them into parallel chunk jobs, and transcodes multi-bitrate HLS streams (360p to 1440p) across a fault-tolerant worker cluster using FFmpeg, Apache Kafka, FastAPI, Supabase (PostgreSQL), Redis, and Next.js 16.

---

## Key Features

- **Parallel FFmpeg Transcoding**: Splits raw video files into timed segment chunks processed concurrently across a pool of worker nodes.
- **Adaptive Bitrate HLS Ladder**: Automatically generates multi-resolution renditions (`360p`, `480p`, `720p`, `1080p`, `1440p`) along with master HLS playlists (`master.m3u8`).
- **Kafka Event-Driven Pipeline**: Decoupled micro-services communicating via Apache Kafka (KRaft mode) for job planning, chunk execution, rendition assembly, and video finalization.
- **Fault-Tolerant & Idempotent**: Transactional outbox pattern, automatic retry loops, and periodic pipeline reconciler prevent lost jobs or partial corruptions during node crashes.
- **Modern Next.js 16 Frontend**: Real-time pipeline monitoring, responsive video player with instant rendition switching, frame preview tooltips, and interactive Kafka architecture diagrams.

---

## Architecture Overview

The system processes video through a sequence of decoupled micro-services:

```
[ Raw Video Upload (S3) ] ──► [ Planner Phase ] ──► [ Kafka Topic: worker.jobs ]
                                                          │
┌─────────────────────────────────────────────────────────┴────────────────────────────────────────────────────────┐
│                                       Parallel Transcoder Worker Cluster                                          │
│   [ Worker 1 (FFmpeg) ]                 [ Worker 2 (FFmpeg) ]                 [ Worker 3 (FFmpeg) ]              │
└─────────────────────────────────────────────────────────┬────────────────────────────────────────────────────────┘
                                                          ▼
                                            [ Kafka Topic: finalize.jobs ]
                                                          │
                                            [ Rendition Finalizer Phase ]
                                                          │
                                            [ Video Asset Finalizer Phase ]
                                                          │
                                                          ▼
                                            [ HLS Master Stream (S3/CDN) ]
```

### System Architecture Diagrams

#### 1. End-to-End System Pipeline
![Main System Architecture](architecture/main.svg)

#### 2. Worker Distributed Processing & Chunk Transcoding
![Worker Distributed Processing](architecture/worker_distributed_processing.svg)

#### 3. Idempotency & Failure Recovery Mechanism
![Idempotency Mechanism](architecture/idempotency_mechaism.svg)

---

## Tech Stack

- **Frontend**: Next.js 16 (App Router + Turbopack), TypeScript, Tailwind CSS, Lucide Icons, HLS.js, Fumadocs MDX.
- **Backend API**: Python 3.11+, FastAPI, Uvicorn, AsyncPG, SQLAlchemy, Alembic.
- **Distributed Pipeline**: Apache Kafka (KRaft mode), Kafka UI, Redis.
- **Database & Storage**: PostgreSQL (Supabase / Local), AWS S3 (or S3-compatible object store).
- **Processing**: FFmpeg, FFprobe.

---

## Prerequisites

Before running the project, ensure you have the following installed:

- **Docker** & **Docker Compose**
- **Python 3.11+**
- **Node.js 20+** & **npm**
- **FFmpeg** (installed locally if running workers directly on host)
- *(Optional)* **Minikube** & **kubectl** (for Kubernetes cluster deployment)

---

## Quick Start (Local Development)

### 1. Installation

Clone the repository and install dependencies using the root `Makefile`:

```bash
git clone <repository-url>
cd video-processing
make install
```

### 2. Environment Configuration

Copy the example environment files:

#### Backend Environment (`backend/.env`):
```bash
cp backend/.env.example backend/.env
```

Ensure `DATABASE_URL`, `S3_BUCKET_NAME`, and AWS credentials are set:
```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres
AWS_REGION=us-east-1
S3_BUCKET_NAME=your-s3-bucket-name
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
FRONTEND_ORIGIN=http://localhost:3000
```

#### Frontend Environment (`frontend/.env.local`):
```bash
cp frontend/.env.local.example frontend/.env.local
```
```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:7500
NEXT_PUBLIC_API_URL=http://localhost:7500
```

---

## Running Infrastructure via Docker

Start Apache Kafka (KRaft mode), Kafka UI, and Redis containers:

```bash
# Start Docker containers (Kafka, Kafka UI, Redis)
make infra

# Initialize Kafka topics (planner.jobs, worker.jobs, finalize.jobs, video.finalize.jobs)
make init-kafka

# Run Alembic database migrations
make migrate
```

You can view the Kafka Web Dashboard at **[http://localhost:8080](http://localhost:8080)** by running:
```bash
make dashboard
```

---

## Running the Full Application Cluster

### Option A: Launch Full Cluster (Automatic Multi-Terminal)

Run the following command to spawn the entire microservice cluster across 13 separate terminal windows:

```bash
make start-all
```

This launches:
- **1x** Next.js Frontend (`http://localhost:3000`)
- **1x** FastAPI Backend (`http://localhost:7500`)
- **1x** Transactional Outbox Dispatcher
- **1x** Pipeline Reconciler
- **2x** Planner Consumers
- **3x** Transcoder Workers
- **2x** Rendition Finalizers
- **2x** Video Asset Finalizers

To stop all cluster processes cleanly:
```bash
# Stop application processes
make stop-processes

# Stop application processes AND Docker infrastructure
make stop-all
```

### Option B: Running Individual Services Manually

You can also run services individually in separate terminal windows:

```bash
# Terminal 1: FastAPI Backend
make backend

# Terminal 2: Next.js Frontend
make frontend

# Terminal 3: Planner Process
make planner

# Terminal 4: Transcoder Worker
make worker

# Terminal 5: Rendition Finalizer
make finalizer

# Terminal 6: Video Asset Finalizer
make video-finalizer

# Terminal 7: Outbox Dispatcher
make outbox

# Terminal 8: Pipeline Reconciler
make reconciler
```

---

## Running on Minikube Cluster

If you prefer to run the transcoding platform inside a local Kubernetes cluster using Minikube:

### 1. Start Minikube & Enable Ingress

```bash
minikube start --cpus=4 --memory=8192
minikube addons enable ingress
```

### 2. Build Docker Images Inside Minikube

Point your local Docker CLI to Minikube's internal Docker daemon:

```bash
eval $(minikube docker-env)

# Build the backend image with FFmpeg
docker build -t video-processing-backend:latest ./backend
```

### 3. Deploy Infrastructure & Applications

If using Kubernetes manifests / Helm charts:

```bash
# Create namespace
kubectl create namespace video-pipeline

# Apply Kafka & Redis manifests (or deploy via Helm)
kubectl apply -f backend/infrastructure/kafka/ -n video-pipeline

# Check running pods
kubectl get pods -n video-pipeline
```

### 4. Port Forwarding / Accessing Services

```bash
# Forward FastAPI Backend
kubectl port-forward svc/backend-service 7500:7500 -n video-pipeline

# Forward Kafka UI
kubectl port-forward svc/kafka-ui-service 8080:8080 -n video-pipeline
```

---

### A glimpse of the Product

[Screencast from 2026-09-25 23-55-41.webm](https://github.com/user-attachments/assets/4756a001-e971-4ea6-a4fb-6f19ddf44291)

[Screencast from 2026-09-25 23-45-59.webm](https://github.com/user-attachments/assets/4361fdd9-8d72-479d-94b2-385c7258d316)

[Screencast from 2026-09-25 23-20-20.webm](https://github.com/user-attachments/assets/2335f1d9-fe38-4825-bb31-b64dc766b193)

[Screencast from 2026-09-25 23-15-13.webm](https://github.com/user-attachments/assets/6e9929ae-85a1-4f29-9d4c-d059412cc4bf)

[Screencast from 2026-09-26 01-19-11.webm](https://github.com/user-attachments/assets/f71e4749-58c6-4b12-96cf-4152e6de9f06)

### Some Screenshots

<img width="4076" height="2315" alt="Screenshot from 2026-09-25 22-46-19" src="https://github.com/user-attachments/assets/7ae3b192-b298-43a1-8fce-4cef9e4d3832" />

<img width="4093" height="2307" alt="image" src="https://github.com/user-attachments/assets/0d635bfa-d684-4d6c-8dca-45336df1b221" />

### Find the Docs -> https://transcode-sage.vercel.app/docs

## Makefile Command Reference

| Command | Description |
| :--- | :--- |
| `make install` | Installs Python backend virtualenv/dependencies and frontend `node_modules` |
| `make infra` | Starts Kafka (KRaft), Kafka UI, and Redis via Docker Compose |
| `make infra-down` | Stops Kafka and Redis Docker containers |
| `make init-kafka` | Initializes required Kafka topics |
| `make migrate` | Applies Alembic database migrations |
| `make start-all` | Spawns full cluster (13 services) in separate terminal windows |
| `make stop-processes` | Gracefully stops all application processes |
| `make stop-all` | Stops application processes + Docker infrastructure |
| `make backend` | Starts FastAPI backend server on port `7500` |
| `make frontend` | Starts Next.js dev server on `http://localhost:3000` |
| `make planner` | Runs a Planner consumer process |
| `make worker` | Runs a Transcoder Worker consumer process |
| `make finalizer` | Runs a Rendition Finalizer consumer process |
| `make video-finalizer` | Runs a Video Asset Finalizer consumer process |
| `make outbox` | Runs the Transactional Outbox Dispatcher |
| `make reconciler` | Runs the Pipeline Reconciler |
| `make dashboard` | Opens Kafka UI in your web browser (`http://localhost:8080`) |
| `make test` | Runs the Pytest backend test suite |
| `make build` | Builds the Next.js frontend production bundle |
| `make clean` | Cleans Python `__pycache__` and Next.js build caches |

## License

MIT License. Built for distributed video processing workflows.
