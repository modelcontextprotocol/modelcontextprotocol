#!/usr/bin/env bash

# This script syncs documentation from https://github.com/modelcontextprotocol/registry.
#
# FIRST, run `git clone git@github.com:modelcontextprotocol/registry.git`, OR
# pull latest commits to an existing local clone.
#
# THEN, run this script with the path of the local `modelcontextprotocol/registry`
# clone as the sole argument.

DOCS_SUBDIR="docs/registry"
REGISTRY_REPO_DOCS_SUBDIR="docs/modelcontextprotocol-io"

if [ "$#" -ne 1 ] || [ ! -d "${1}" ]; then
  echo "Error: You must provide a valid path to a local clone of the registry repository." >&2
  echo "Usage: $0 /path/to/cloned/registry-repo" >&2
  exit 1
fi

REGISTRY_REPO_PATH="${1}"

# Create the temporary split branch which contains only $REGISTRY_REPO_DOCS_SUBDIR.
REGISTRY_HEAD_SHA=$(git -C "${REGISTRY_REPO_PATH}" rev-parse --short HEAD)
TMP_BRANCH="mcpio-docs-${REGISTRY_HEAD_SHA}"
git -C "${REGISTRY_REPO_PATH}" subtree split --prefix="${REGISTRY_REPO_DOCS_SUBDIR}" --branch="${TMP_BRANCH}" HEAD

# Pull from temporary split branch.
REPO_PATH=$(git -C "$(dirname "${0}")/.." rev-parse --show-toplevel)
if [ -d "${REPO_PATH}/${DOCS_SUBDIR}" ]; then
  git -C "${REPO_PATH}" subtree pull --prefix="${DOCS_SUBDIR}" "${REGISTRY_REPO_PATH}" "${TMP_BRANCH}" --squash
else
  git -C "${REPO_PATH}" subtree add --prefix="${DOCS_SUBDIR}" "${REGISTRY_REPO_PATH}" "${TMP_BRANCH}" --squash
fi

# Delete the temporary split branch.
git -C "${REGISTRY_REPO_PATH}" branch -D "${TMP_BRANCH}"
