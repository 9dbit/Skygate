FROM node:22-alpine
WORKDIR /app
COPY . .
RUN tar -xzf media_assets.tar.gz -C /app && rm media_assets.tar.gz
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "server.mjs"]
