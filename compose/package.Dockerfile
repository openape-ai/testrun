# Packaging-only image: wraps the PREBUILT Nitro .output into a runnable
# container. No compile step — deploy builds .output natively and this
# Dockerfile just copies it, so a cross-arch (arm64 Mac → amd64 chatty)
# build is quick. Mirrors the monorepo's compose/preview-package.Dockerfile.
#
# Build context = app/.output:
#   docker buildx build --platform linux/amd64 \
#     -f compose/package.Dockerfile --build-arg PORT=3006 \
#     -t registry.openape.ai/openape-testrun:prod-<sha> --load app/.output

FROM node:22-bookworm-slim
ARG PORT=3006
WORKDIR /app
COPY . ./.output
# Nitro bundles libsql's JS wrapper but not its platform-specific native
# binding — install the arch-matched one (under --platform linux/amd64
# process.arch resolves to x64).
RUN cd .output/server \
 && LIBSQL_VER=$(node -p "require('./node_modules/libsql/package.json').version") \
 && PKGARCH=$(node -p "process.arch === 'arm64' ? 'arm64' : 'x64'") \
 && npm pack "@libsql/linux-${PKGARCH}-gnu@${LIBSQL_VER}" \
 && mkdir -p "node_modules/@libsql/linux-${PKGARCH}-gnu" \
 && tar -xzf "libsql-linux-${PKGARCH}-gnu-${LIBSQL_VER}.tgz" -C "node_modules/@libsql/linux-${PKGARCH}-gnu" --strip-components=1 \
 && rm -f "libsql-linux-${PKGARCH}-gnu-${LIBSQL_VER}.tgz"
ENV NITRO_PORT=${PORT}
ENV HOST=0.0.0.0
ENV PORT=${PORT}
EXPOSE ${PORT}
CMD ["node", ".output/server/index.mjs"]
