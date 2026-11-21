FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 VC_DB=/app/var/venturecheck.sqlite
RUN mkdir /app/var && chown node:node /app/var
COPY --chown=node:node . .
USER node
EXPOSE 3000
CMD ["npm", "start"]
