FROM python:3.13-slim

WORKDIR /app

# System dependency required by the transcode/thumbnail processes.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Install uv.
RUN pip install --no-cache-dir uv

# Copy dependency metadata first so Docker can cache this layer.
COPY pyproject.toml uv.lock ./

# Install exactly what is locked in uv.lock.
RUN uv sync --frozen --no-dev

# Copy application source.
COPY . .

ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

# Make the uv environment's executables available normally.
ENV PATH="/app/.venv/bin:$PATH"