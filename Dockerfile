FROM node:20-alpine

# curl dipakai sebagai fallback scraping kalau fingerprint TLS Node diblokir Cloudflare
RUN apk add --no-cache curl ca-certificates

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev
COPY . .

ENV PORT=3000
EXPOSE 3000
CMD ["node", "server.js"]
