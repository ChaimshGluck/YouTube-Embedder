FROM node:22-slim

# System deps:
#  - python3         : yt-dlp is a Python package, launched as `python3 -m yt_dlp`
#  - ffmpeg          : merges separate video + audio streams into one mp4
#  - curl/unzip/ca-* : needed to install Deno below
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      python3 python3-pip ffmpeg ca-certificates curl unzip \
 && rm -rf /var/lib/apt/lists/*

# yt-dlp itself. --break-system-packages is required on Debian's externally
# managed Python (PEP 668); this is a container, so installing globally is fine.
RUN pip3 install --no-cache-dir --break-system-packages -U yt-dlp

# Modern YouTube requires running a JS "nsig" signature challenge to get valid
# media URLs; without a JS runtime the media fetch 403s. yt-dlp auto-detects
# Deno, so installing it here needs no code/flag changes.
RUN curl -fsSL https://deno.land/install.sh | sh
ENV PATH="/root/.deno/bin:${PATH}"

# server.js reads these: which interpreter runs yt-dlp, and prod mode.
ENV PYTHON_BIN=python3
ENV NODE_ENV=production

WORKDIR /app
COPY . .

# Hosts inject $PORT (server.js honors it); 3010 is just the local default.
EXPOSE 3010
CMD ["node", "server.js"]
