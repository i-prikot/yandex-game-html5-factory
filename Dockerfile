FROM node:22-bullseye-slim

ENV DEBIAN_FRONTEND=noninteractive \
    PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    NODE_ENV=development

RUN set -eux; \
    attempt=1; \
    max_attempts=5; \
    until \
      apt-get -o Acquire::Retries=3 -o Acquire::ForceIPv4=true -o Acquire::http::Timeout=30 update \
      && apt-get -o Acquire::Retries=3 -o Acquire::ForceIPv4=true -o Acquire::http::Timeout=30 install -y --no-install-recommends \
        chromium \
        ca-certificates \
        ffmpeg \
        fonts-dejavu-core \
        fonts-liberation \
        tini \
        unzip \
        xvfb \
        zip; \
    do \
      if [ "$attempt" -ge "$max_attempts" ]; then \
        echo "[docker-build] ERROR apt-get failed after $max_attempts attempts" >&2; \
        exit 1; \
      fi; \
      retry_delay=$((attempt * 5)); \
      echo "[docker-build] WARN apt-get attempt $attempt failed; retrying in ${retry_delay}s" >&2; \
      rm -rf /var/lib/apt/lists/*; \
      sleep "$retry_delay"; \
      attempt=$((attempt + 1)); \
    done; \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --include=dev
RUN npm install --global @anthropic-ai/claude-code @openai/codex

COPY . .
RUN npm run build:factory

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["npm", "run", "start:cli"]
