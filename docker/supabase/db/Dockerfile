# Used by docker-compose.coolify.yml: Coolify doesn't place repository files on the host for bind
# mounts, so the init scripts are baked into the image instead.
FROM supabase/postgres:17.6.1.136
COPY roles.sql /docker-entrypoint-initdb.d/init-scripts/99-roles.sql
COPY jwt.sql /docker-entrypoint-initdb.d/init-scripts/99-jwt.sql
