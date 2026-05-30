FROM ubuntu:22.04

RUN apt-get update && apt-get install -y \
    git \
    build-essential \
    cmake \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /opt
RUN git clone https://github.com/ggml-org/llama.cpp.git

WORKDIR /opt/llama.cpp
RUN cmake -B build -S . -DCMAKE_BUILD_TYPE=Release
RUN cmake --build build --target llama-server -j 2

EXPOSE 8080

ENTRYPOINT ["/opt/llama.cpp/build/bin/llama-server"]
