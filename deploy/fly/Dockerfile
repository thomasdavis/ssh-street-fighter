FROM haproxy:2.9-alpine
USER root
RUN apk add --no-cache gettext        # provides envsubst
COPY haproxy.cfg.template /haproxy.cfg.template
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
