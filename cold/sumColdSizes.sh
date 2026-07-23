#!/usr/bin/env bash
set -euo pipefail

input_file="${1:-cold.txt}"

cat "$input_file" | awk '
function multiplier(unit) {
  if (unit == "KiB") return 1024
  if (unit == "MiB") return 1024 * 1024
  if (unit == "GiB") return 1024 * 1024 * 1024
  return 0
}

function human(bytes) {
  if (bytes >= 1024 * 1024 * 1024) return sprintf("%.2fGiB", bytes / (1024 * 1024 * 1024))
  if (bytes >= 1024 * 1024) return sprintf("%.2fMiB", bytes / (1024 * 1024))
  if (bytes >= 1024) return sprintf("%.2fKiB", bytes / 1024)
  return sprintf("%dB", bytes)
}

{
  size = $5
  if (size ~ /^[0-9.]+(KiB|MiB|GiB)$/) {
    value = size
    unit = size
    sub(/(KiB|MiB|GiB)$/, "", value)
    sub(/^[0-9.]+/, "", unit)
    total += value * multiplier(unit)
    parsed++
  }
}

END {
  printf "Parsed lines: %d\n", parsed
  printf "Total bytes: %.0f\n", total
  printf "Total size: %s\n", human(total)
}
'
