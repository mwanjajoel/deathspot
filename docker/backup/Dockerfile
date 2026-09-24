# Daily Postgres backups to Cloudflare R2 (or any S3-compatible bucket). See backup.sh.
FROM postgres:17-alpine
RUN apk add --no-cache rclone openssl tzdata
COPY backup.sh /usr/local/bin/backup.sh
RUN chmod +x /usr/local/bin/backup.sh
ENTRYPOINT ["/usr/local/bin/backup.sh"]
CMD ["daemon"]
