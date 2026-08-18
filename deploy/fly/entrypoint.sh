#!/bin/sh
set -e
: "${ORIGIN_HOST:?set ORIGIN_HOST (fly secrets set ORIGIN_HOST=<ovh-ip>)}"
: "${ORIGIN_PORT:=22}"
envsubst '${ORIGIN_HOST} ${ORIGIN_PORT}' < /haproxy.cfg.template > /haproxy.cfg
exec haproxy -f /haproxy.cfg -db
