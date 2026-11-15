# Showcase Docs, in one image. Build and run with:   docker compose up -d --build
# Multi-stage, so the host needs only Docker: Node builds the web bundles, Maven builds the jar, a small JRE image runs it.
# Tests do not run here. Run scripts/build.sh on a development machine for those.
# All base images are multi-arch (amd64 and arm64).

FROM node:22-bookworm-slim AS web
WORKDIR /src/web
COPY web/package.json web/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund
COPY web/ ./
# Builds the editor and the viewer (the build also checks that the viewer holds no editor code), then packs them for the jar:
# /pack/static (the editor) and /pack/static-export/viewer (the viewer for the GitHub Pages site, with files.txt).
RUN npm run build && node scripts/pack.mjs /src/web/dist /pack

FROM maven:3.9-eclipse-temurin-17 AS jar
WORKDIR /src
COPY pom.xml ./
COPY src/ src/
COPY --from=web /pack/static/ src/main/resources/static/
COPY --from=web /pack/static-export/ src/main/resources/static-export/
RUN --mount=type=cache,target=/root/.m2 mvn -B -q -DskipTests package \
 && cp target/showcase-docs.jar /showcase-docs.jar

# The runtime image. Non-root user. The database, the stored files and the backups live under /data (a volume).
FROM eclipse-temurin:17-jre
RUN useradd --system --uid 10003 --home-dir /nonexistent --shell /usr/sbin/nologin docs \
 && mkdir -p /data && chown docs /data
COPY --from=jar /showcase-docs.jar /app/showcase-docs.jar
USER docs
ENV DOCS_DATA_DIR=/data
VOLUME ["/data"]
EXPOSE 3020
# "hash-password" as the argument prints a bcrypt hash instead of starting the server.
ENTRYPOINT ["java", "-jar", "/app/showcase-docs.jar"]
