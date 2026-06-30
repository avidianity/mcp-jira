#!/bin/sh
# mcp-jira installer — downloads the prebuilt release binary for your platform
# and drops it on your PATH. Safe to pipe straight from the web:
#
#   sh -c "$(curl -fsSL https://raw.githubusercontent.com/avidianity/mcp-jira/main/install.sh)"
#
# Environment overrides:
#   MCP_JIRA_VERSION      install a specific tag (e.g. v0.2.1) instead of the latest
#   MCP_JIRA_INSTALL_DIR  install location (default: $HOME/.local/bin)

set -eu

REPO="avidianity/mcp-jira"
BIN="mcp-jira"
INSTALL_DIR="${MCP_JIRA_INSTALL_DIR:-$HOME/.local/bin}"

err()  { printf 'mcp-jira-install: error: %s\n' "$1" >&2; exit 1; }
info() { printf 'mcp-jira-install: %s\n' "$1" >&2; }

# --- pick a downloader -------------------------------------------------------
if command -v curl >/dev/null 2>&1; then
  dl_to() { curl -fsSL "$1" -o "$2"; }
  dl_out() { curl -fsSL "$1"; }
elif command -v wget >/dev/null 2>&1; then
  dl_to() { wget -qO "$2" "$1"; }
  dl_out() { wget -qO- "$1"; }
else
  err "this installer needs 'curl' or 'wget'"
fi

# --- detect platform ---------------------------------------------------------
os="$(uname -s)"
arch="$(uname -m)"

case "$os" in
  Linux)  os_part="linux" ;;
  Darwin) os_part="macos" ;;
  *) err "unsupported OS '$os'. On Windows, download the binary from https://github.com/$REPO/releases" ;;
esac

case "$arch" in
  x86_64 | amd64)  arch_part="x64" ;;
  arm64 | aarch64) arch_part="arm64" ;;
  *) err "unsupported architecture '$arch'" ;;
esac

# Linux only has x64 builds
if [ "$os_part" = "linux" ] && [ "$arch_part" != "x64" ]; then
  err "only x64 binaries are available for Linux"
fi

target="${os_part}-${arch_part}"

# --- resolve version ---------------------------------------------------------
version="${MCP_JIRA_VERSION:-}"
if [ -z "$version" ]; then
  info "Resolving latest release..."
  version="$(dl_out "https://api.github.com/repos/$REPO/releases/latest" \
    | grep '"tag_name"' | head -n 1 \
    | sed -E 's/.*"tag_name"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/')"
  [ -n "$version" ] || err "could not determine the latest release; set MCP_JIRA_VERSION to a tag like v0.2.1"
fi

asset="${BIN}-${target}"
base_url="https://github.com/$REPO/releases/download/$version"

info "Installing $BIN $version ($target)"

# --- download ----------------------------------------------------------------
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT INT TERM

dl_to "$base_url/$asset" "$tmp/$asset" || err "download failed: $base_url/$asset"

chmod +x "$tmp/$asset"

# --- install -----------------------------------------------------------------
mkdir -p "$INSTALL_DIR"
mv "$tmp/$asset" "$INSTALL_DIR/$BIN"
info "Installed to $INSTALL_DIR/$BIN"

case ":$PATH:" in
  *":$INSTALL_DIR:"*) ;;
  *)
    info ""
    info "$INSTALL_DIR is not on your PATH. Add this to your shell profile:"
    info "  export PATH=\"$INSTALL_DIR:\$PATH\""
    ;;
esac

info ""
info "Done. Run '$BIN --help' to get started."
