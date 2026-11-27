#!/usr/bin/env bash
# npm run local:linux / online:linux: points config.bzg at the chosen address and starts the app.
# Sourcing this file only defines the functions, so tests can call them without starting anything.
set -euo pipefail

# Replaces the "var <name> = ...;" line in <file> with "var <name> = <value>;", or appends it.
# Values are written literally: no sed, no regex, no shell string built from them.
set_config_value() {
    local file="$1" name="$2" value="$3"
    local wanted="var $name = $value;"
    local temp line found=0
    temp="$(mktemp "$file.XXXXXX")"

    # Copy the file line by line, swapping the matching line; "|| -n" keeps a last line with no newline
    while IFS= read -r line || [[ -n $line ]]; do
        # A config written on Windows ends lines with CR, so match without it
        if [[ ${line%$'\r'} == "var $name = "*";" ]]; then
            printf '%s\n' "$wanted" >>"$temp"
            found=1
            continue
        fi
        printf '%s\n' "$line" >>"$temp"
    done <"$file"

    # No existing line: add one at the end
    if ((found == 0)); then
        printf '%s\n' "$wanted" >>"$temp"
    fi
    mv "$temp" "$file"
}

# Prints the Skipping line and fails when not started by npm, because bzg run starts every script
require_npm() {
    local script_name="$1"
    if [[ -z ${npm_lifecycle_event:-} ]]; then
        echo "Skipping: start this with npm run $script_name."
        return 1
    fi
}

# Prints an error to stderr and exits with status 1
fail() {
    echo "$1" >&2
    exit 1
}

# Checks what every mode needs: config.bzg, the bonezegei binary and the installed http package
check_common() {
    if [[ ! -f config.bzg ]]; then
        fail "config.bzg is missing. Copy config.example.bzg to config.bzg and fill in your keys."
    fi
    if ! command -v bonezegei >/dev/null 2>&1; then
        fail "bonezegei isn't installed or isn't on PATH."
    fi
    if [[ ! -f lib/http.bzg ]]; then
        fail "Run bzg install first."
    fi
}

# Points config.bzg at <base_url> with the server listening on plain HTTP port 8001
write_config() {
    local base_url="$1"
    set_config_value config.bzg useTunnel 1
    set_config_value config.bzg tunnelPort 8001
    set_config_value config.bzg baseUrl "\"$base_url\""
    set_config_value config.bzg googleRedirectUri "\"$base_url/google-callback\""
    set_config_value config.bzg githubRedirectUri "\"$base_url/github-callback\""
}

# local mode: serves http://localhost:8001 directly, with no tunnel
run_local() {
    local base_url="http://localhost:8001"
    check_common
    write_config "$base_url"

    echo ""
    echo "  Open $base_url"
    echo "  Add to Google redirect URIs:  $base_url/google-callback"
    echo "  Set GitHub callback URL to:   $base_url/github-callback"
    echo "  Ctrl+C stops the server."
    echo ""
    exec bonezegei app.bzg
}

# Prints the first quick tunnel address in cloudflared's log, or nothing if there is none yet
extract_tunnel_url() {
    local log="$1"
    # cloudflared may not have created the log yet
    if [[ ! -f $log ]]; then
        return 0
    fi
    # grep exits 1 with no match; that just means "no address yet"
    grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$log" | head -n 1 || true
}

# PID of the background cloudflared, killed by stop_tunnel when the script exits
tunnel_pid=""

# Kills cloudflared if it is still running
stop_tunnel() {
    if [[ -z $tunnel_pid ]]; then
        return 0
    fi
    kill "$tunnel_pid" 2>/dev/null || true
    wait "$tunnel_pid" 2>/dev/null || true
    tunnel_pid=""
}

# Waits up to 30 s for cloudflared to log its address and prints it; fails if it never does
wait_for_tunnel_url() {
    local log="$1" url="" attempt
    # Poll once a second, stopping early if cloudflared dies
    for ((attempt = 0; attempt < 30; attempt++)); do
        sleep 1
        url="$(extract_tunnel_url "$log")"
        if [[ -n $url ]]; then
            echo "$url"
            return 0
        fi
        if ! kill -0 "$tunnel_pid" 2>/dev/null; then
            fail "cloudflared stopped. Its log is in $log"
        fi
    done
    fail "No tunnel address after 30 seconds. Check your connection and try again."
}

# online mode: opens a Cloudflare quick tunnel to port 8001, points config.bzg at it and starts the app
run_online() {
    local log="${TMPDIR:-/tmp}/jmeet-cloudflared.log" url
    check_common
    if ! command -v cloudflared >/dev/null 2>&1; then
        fail "cloudflared isn't installed or isn't on PATH."
    fi

    rm -f "$log"
    # --config /dev/null skips ~/.cloudflared/config.yml, whose catch-all rule 404s quick tunnels
    cloudflared tunnel --config /dev/null --url http://localhost:8001 2>"$log" &
    tunnel_pid=$!
    # Ctrl+C or kill exits through the EXIT trap, which stops cloudflared
    trap stop_tunnel EXIT
    trap 'exit 130' INT
    trap 'exit 143' TERM

    url="$(wait_for_tunnel_url "$log")"
    write_config "$url"

    echo ""
    echo "  Share this address: $url"
    echo "  Add to Google redirect URIs:  $url/google-callback"
    echo "  Set GitHub callback URL to:   $url/github-callback"
    echo "  It can take a minute to start working. Ctrl+C stops everything."
    echo ""
    # No exec: this shell must stay alive so the EXIT trap stops cloudflared
    bonezegei app.bzg
}

# Entry point: validates the mode, applies the npm guard, then runs the mode from the repo root
main() {
    local mode="${1:-}"

    # Reject anything but the known modes before doing any work
    if [[ $mode != "local" && $mode != "online" ]]; then
        echo "Usage: scripts/run.sh local|online" >&2
        exit 2
    fi
    if ! require_npm "$mode:linux"; then
        exit 0
    fi

    cd "$(dirname "${BASH_SOURCE[0]}")/.."
    # Dispatch to the chosen mode
    if [[ $mode == "local" ]]; then
        run_local
    fi
    run_online
}

# Run main only when executed, not when sourced
if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
    main "$@"
fi
