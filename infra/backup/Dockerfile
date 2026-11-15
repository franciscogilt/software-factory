FROM postgres:16-alpine
# Pick up OS security fixes published after the base image was built.
RUN apk upgrade --no-cache && apk add --no-cache aws-cli tzdata
# The base image's entrypoint and its gosu helper (a Go binary with known CVEs) are not needed: we run as a plain user.
RUN rm -f /usr/local/bin/gosu
ENTRYPOINT []
COPY infra/backup/*.sh /app/
RUN chmod +x /app/*.sh && addgroup -S backup && adduser -S -G backup backup && mkdir -p /backups && chown backup:backup /backups
USER backup
ENV BACKUP_DIR=/backups
HEALTHCHECK --interval=1h --timeout=10s --start-period=26h CMD /app/healthcheck.sh
CMD ["/app/run-daily.sh"]
