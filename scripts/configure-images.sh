#!/bin/sh
set -eu

username="${1:-}"
version="${2:-1.0.0}"

if [ -z "$username" ]; then
  echo "Usage: $0 DOCKERHUB_USERNAME [VERSION]" >&2
  exit 1
fi

case "$username" in
  *[!a-z0-9_-]*|'')
    echo "Docker Hub username contains unsupported characters" >&2
    exit 1
    ;;
esac

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
project_dir=$(dirname "$script_dir")

for manifest in "$project_dir/kubernetes/web.yaml" "$project_dir/kubernetes/tasks.yaml" "$project_dir/kubernetes/insights.yaml"; do
  sed -i.bak -E "s#docker.io/[a-z0-9_-]+/teampulse-([a-z]+):[a-zA-Z0-9._-]+#docker.io/$username/teampulse-\\1:$version#g" "$manifest"
  rm "$manifest.bak"
done

echo "Kubernetes images now use docker.io/$username with tag $version"
