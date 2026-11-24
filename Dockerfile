FROM node:24-alpine
WORKDIR /app
COPY --chown=1000:1000 . .
RUN tar -xzf media_assets.tar.gz -C /app && rm media_assets.tar.gz \
 && tar -xzf audio_mp3.tar.gz -C /app && rm audio_mp3.tar.gz \
 && chown -R 1000:1000 /app
RUN node scripts/prepare-play.mjs
ENV NODE_ENV=production
ENV NODE_OPTIONS=--disable-proto=throw
EXPOSE 3000
STOPSIGNAL SIGTERM
CMD ["node", "server.mjs"]
