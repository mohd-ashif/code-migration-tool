FROM node:20-alpine
WORKDIR /app
COPY . .
RUN apk add --no-cache zip || true
RUN npm install --no-audit --no-fund || true
RUN npx nuxi typecheck || true
RUN npm run build || true
RUN npm test || true
RUN zip -r /app/output.zip . -x "node_modules/*" -x ".git/*" || true
