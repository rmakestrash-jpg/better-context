# Analytics Proxy

nginx reverse proxy for PostHog analytics to bypass ad blockers.

## Overview

This proxy forwards analytics requests from your domain to PostHog, preventing ad blockers from blocking analytics data. The proxy is containerized and designed to be deployed on Railway.

## How it works

1. User triggers an analytics event in the web app
2. Request goes to this proxy (e.g., `metrics.yourdomain.com`)
3. nginx forwards the request to PostHog with correct headers
4. PostHog processes and returns a response
5. nginx returns the response to the client

## Configuration

Environment variables:

| Variable               | Default | Description                                                  |
| ---------------------- | ------- | ------------------------------------------------------------ |
| `PORT`                 | `8080`  | Port the server listens on (Railway sets this automatically) |
| `POSTHOG_CLOUD_REGION` | `us`    | PostHog region (`us` or `eu`)                                |

## Endpoints

- `/health` - Health check endpoint (returns 200 OK)
- `/s/*` - Static assets (JS SDK) - proxied to PostHog assets CDN
- `/*` - All other requests (event capture, feature flags, API)

## Local Development

Build and run the container:

```bash
# From repo root
bun run analytics-proxy:build
bun run analytics-proxy:run

# Or from this directory
docker build -t btca-analytics-proxy .
docker run --rm -p 8080:8080 -e POSTHOG_CLOUD_REGION=us btca-analytics-proxy
```

Test the proxy:

```bash
curl -I http://localhost:8080/health
curl -I http://localhost:8080/decide?v=3
```

## Railway Deployment

1. Create a new Railway service
2. Connect to this repo and set the root directory to `apps/analytics-proxy`
3. Railway will automatically detect the Dockerfile
4. Set the `POSTHOG_CLOUD_REGION` environment variable if using EU region
5. Add a custom domain (e.g., `metrics.yourdomain.com`)

## Web App Configuration

Set the `PUBLIC_ANALYTICS_HOST` environment variable in the web app to point to your deployed proxy:

```
PUBLIC_ANALYTICS_HOST=https://metrics.yourdomain.com
```
