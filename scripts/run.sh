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

# Entry point: validates the mode, applies the npm guard, then runs the mode from the repo root
main() {
    local mode="${1:-}"

    # Reject anything but the known modes before doing any work
    if [[ $mode != "local" ]]; then
        echo "Usage: scripts/run.sh local|online" >&2
        exit 2
    fi
    if ! require_npm "$mode:linux"; then
        exit 0
    fi

    cd "$(dirname "${BASH_SOURCE[0]}")/.."
    run_local
}

# Run main only when executed, not when sourced
if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
    main "$@"
fi
