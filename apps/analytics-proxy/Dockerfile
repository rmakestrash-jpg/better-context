FROM nginx:alpine

# Install envsubst for environment variable substitution
RUN apk add --no-cache ca-certificates

# Copy nginx config template
COPY nginx.conf /etc/nginx/nginx.conf.template

# Railway uses PORT environment variable
ENV PORT=8080
ENV POSTHOG_CLOUD_REGION=us

# Substitute environment variables at runtime and start nginx
CMD ["sh", "-c", "envsubst '\\$PORT \\$POSTHOG_CLOUD_REGION' < /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf && nginx -g 'daemon off;'"]
