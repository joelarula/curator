# Stage 1: Build the Rust binary
FROM rust:1-slim-bookworm AS builder

WORKDIR /build

RUN apt-get update && apt-get install -y \
    pkg-config libssl-dev build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY Cargo.toml Cargo.lock ./
COPY src/ src/

RUN cargo build --release

# Stage 2: Minimal runtime image
FROM debian:bookworm-slim AS runtime

RUN apt-get update && apt-get install -y \
    libssl3 ca-certificates python3 python3-pip \
    && rm -rf /var/lib/apt/lists/* \
    && pip3 install --break-system-packages "huggingface_hub[cli]"

COPY --from=builder /build/target/release/curator /usr/local/bin/curator
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

VOLUME /models
EXPOSE 8080

ENTRYPOINT ["/entrypoint.sh"]
