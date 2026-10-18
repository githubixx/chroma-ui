FROM golang:1.26.0-bookworm AS builder
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOWORK=off go build -mod=readonly -o /showcase ./examples/showcase

FROM mcr.microsoft.com/playwright:v1.64.1-noble@sha256:7852dc5a7d72f5fe458a597d690f6c42fbc8e9e26ddfa95f8e6ef552558d9bbf
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY test/e2e/resources.mjs test/e2e/resources.lock.json ./test/e2e/
RUN npm run test:e2e:resources
COPY --from=builder /showcase /usr/local/bin/chroma-showcase
COPY playwright.config.mjs ./
COPY test/e2e/*.spec.mjs ./test/e2e/
ENV E2E_SERVER_COMMAND="/usr/local/bin/chroma-showcase -addr 127.0.0.1:18764 -assets-prefix /demo/skin"
CMD ["npm", "run", "test:e2e"]
