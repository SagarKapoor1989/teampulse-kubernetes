#!/bin/sh
set -eu

base_url="${BASE_URL:-http://127.0.0.1:8080}"

echo "Checking $base_url/healthz"
curl --fail --silent --show-error "$base_url/healthz"
echo

echo "Creating a demonstration task"
task=$(curl --fail --silent --show-error \
  -H 'content-type: application/json' \
  -d '{"title":"Verify the Kubernetes deployment","owner":"Demo user","status":"doing"}' \
  "$base_url/api/tasks")
echo "$task"

echo "Reading computed insights"
curl --fail --silent --show-error "$base_url/api/insights"
echo
