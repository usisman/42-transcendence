FROM nginx:alpine

RUN apk add --no-cache openssl

COPY docker/nginx/certs /etc/nginx/certs
COPY docker/nginx/nginx.conf /etc/nginx/nginx.conf
COPY docker/nginx/20-generate-htpasswd.sh /docker-entrypoint.d/20-generate-htpasswd.sh
