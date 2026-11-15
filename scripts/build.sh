#!/usr/bin/env bash
# Local build without Docker: builds the web bundles, packs them into the jar's resources, runs the Java tests, builds the jar.
# Needs Node 22 and npm, JDK 17 or newer, and Maven (or set MVN to your Maven command).
# Result: target/showcase-docs.jar. Run it with:  DOCS_PASSWORD_HASH='...' java -jar target/showcase-docs.jar
set -euo pipefail
cd "$(dirname "$0")/.."

MVN="${MVN:-mvn}"

echo "== web: install, typecheck, test, build"
(cd web && npm ci --no-audit --no-fund && npm run typecheck && npm test && npm run build)

echo "== pack the bundles into src/main/resources"
node web/scripts/pack.mjs web/dist src/main/resources

echo "== java: test and package"
"$MVN" -B -q verify

echo "Done: target/showcase-docs.jar"
