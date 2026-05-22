#!/bin/bash
set -e
echo "=== Empaquetando Lambda Delivery ==="
rm -rf dist/package

# Compilar TypeScript → JavaScript
npm run compile

# El zip solo necesita el archivo compilado
mkdir -p dist/package
cp dist/handler.js dist/package/handler.js

cd dist/package
zip -r ../lambda-delivery.zip . -q
cd ../..
echo "✅ dist/lambda-delivery.zip ($(du -sh dist/lambda-delivery.zip | cut -f1))"