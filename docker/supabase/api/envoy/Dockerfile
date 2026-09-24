# Used by docker-compose.coolify.yml: the gateway config baked in instead of bind mounted.
FROM envoyproxy/envoy:v1.39.1
COPY envoy.yaml cds.yaml lds.template.yaml /etc/envoy/
COPY docker-entrypoint.sh /docker-entrypoint.sh
