FROM node:22-alpine

WORKDIR /app
COPY --chown=node:node package.json server.js ./
COPY --chown=node:node public ./public

ENV NODE_ENV=production PORT=3000
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1
CMD ["node", "server.js"]
