FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
COPY . .
EXPOSE 4782

HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=5s \
  CMD ["node", "-e", "require('node:http').get({hostname:'127.0.0.1',port:4782,path:'/api/health',headers:{host:'payee.zayu.dev'}},r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"]

CMD ["node", "scripts/start-production.mjs"]
