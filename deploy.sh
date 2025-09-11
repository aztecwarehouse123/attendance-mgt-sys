#!/bin/bash

# Deploy script for warehouse management system
echo "🚀 Starting deployment process..."

# Start SSH agent and add key
echo "📡 Setting up SSH..."
eval "$(ssh-agent -s)"
ssh-add ~/.ssh/id_ed25519

# Git operations
echo "📝 Adding changes to git..."
git add .

echo "💾 Committing changes..."
git commit -m "Update: $(date '+%Y-%m-%d %H:%M:%S') - Automated deployment"

echo "📤 Pushing to main branch..."
git push origin main

# Build and deploy
echo "🔨 Building project..."
npm run build

echo "🚀 Deploying to production..."
npm run deploy

echo "✅ Deployment completed successfully!"
echo "🌐 Your changes are now live!"
