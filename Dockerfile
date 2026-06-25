FROM node:20-bookworm-slim

# sharp needs these for image processing on slim images
RUN apt-get update && apt-get install -y --no-install-recommends \
    libvips-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY server.js ./
COPY public ./public

RUN mkdir -p /app/data /app/public/uploads

VOLUME ["/app/data", "/app/public/uploads"]

EXPOSE 3000

CMD ["node", "server.js"]
