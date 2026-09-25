#!/usr/bin/env bash
set -Eeuo pipefail

kubectl config use-context minikube

echo
echo "Current context:"
kubectl config current-context

echo
kubectl get nodes