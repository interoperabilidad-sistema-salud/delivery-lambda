#!/bin/bash
set -e
echo "=== Empaquetando Lambda Delivery ==="
rm -rf dist/
mkdir -p dist/package

npm ci --omit=dev
cp -r src/ dist/package/src/
cp package.json dist/package/
cp -r node_modules/ dist/package/node_modules/

cd dist/package
zip -r ../lambda-delivery.zip . -q
cd ../..
echo "✅ dist/lambda-delivery.zip ($(du -sh dist/lambda-delivery.zip | cut -f1))"