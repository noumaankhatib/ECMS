FROM postgres:17-alpine

# Baked into the image rather than bind-mounted so that Docker Compose and the
# automated test database are provably identical. The script is idempotent.
COPY init.sql /docker-entrypoint-initdb.d/10-init.sql
