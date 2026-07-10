FROM node:24-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
  bash \
  ca-certificates \
  curl \
  git \
  jq \
  ripgrep \
  tmux \
  && rm -rf /var/lib/apt/lists/*

# Install GitHub CLI for issue and PR operations.
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
  | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
  && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
  | tee /etc/apt/sources.list.d/github-cli.list >/dev/null \
  && apt-get update && apt-get install -y --no-install-recommends gh \
  && rm -rf /var/lib/apt/lists/*

# Keep UID/GID aligned for volume ownership.
ARG AGENT_UID=1000
ARG AGENT_GID=1000
RUN groupmod -o -g ${AGENT_GID} node && \
  usermod -o -u ${AGENT_UID} -g ${AGENT_GID} -d /home/agent -m -l agent node

# Sandcastle runs on the host; only Pi executes inside the sandbox.
RUN npm install -g @earendil-works/pi-coding-agent@0.80.5

RUN corepack disable && npm install -g pnpm@10.3.0

USER ${AGENT_UID}:${AGENT_GID}
ENV HOME=/home/agent
WORKDIR /home/agent

ENTRYPOINT ["sleep", "infinity"]
