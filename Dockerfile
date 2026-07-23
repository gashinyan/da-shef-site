FROM node:24-alpine

ENV NODE_ENV=production \
    PORT=3000 \
    PUBLIC_DIR=/app/public \
    DATA_DIR=/data

WORKDIR /app

COPY --chown=node:node package.json server.mjs ./
COPY --chown=node:node index.html styles.css privacy.html personal-data-consent.html marketing-consent.html ./public/
COPY --chown=node:node assets ./public/assets
COPY --chown=node:node scripts ./public/scripts

RUN mkdir -p /data/orders && chmod 700 /data/orders && chown -R node:node /data

USER node

EXPOSE 3000
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "server.mjs"]
