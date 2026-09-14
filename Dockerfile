# Build the frontend, then run the server which statically serves it.
FROM node:22-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY server/package*.json ./server/
RUN cd server && npm ci --omit=dev
COPY server/ ./server/
COPY --from=frontend-build /app/frontend/dist ./frontend/dist
EXPOSE 3000
CMD ["node", "server/src/index.js"]
