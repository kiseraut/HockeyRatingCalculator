FROM mcr.microsoft.com/playwright:v1.63.0-noble
USER root
RUN apt-get update && apt-get install -y --no-install-recommends git x11vnc novnc websockify fluxbox && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY updater/package*.json ./
RUN npm ci --omit=dev
COPY updater/ ./
RUN chmod 755 /app/git-askpass.sh /app/start.sh
ENV DISPLAY=:99
CMD ["/app/start.sh"]
