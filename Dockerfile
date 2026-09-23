# Single-container build: the backend serves both the API and the built
# dashboard on one origin. Mount a volume at /app/backend/data to persist the
# SQLite database (`docker run -v`, or the host's volume settings). There's
# no VOLUME instruction because some hosts, such as Railway, reject it.

FROM node:22-slim AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM node:22-slim
WORKDIR /app/backend
ENV NODE_ENV=production
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev
COPY backend/src ./src
COPY --from=frontend /app/frontend/dist /app/frontend/dist
ENV PORT=4000 DATABASE_PATH=/app/backend/data/devdiary.sqlite
EXPOSE 4000
CMD ["node", "src/index.js"]
