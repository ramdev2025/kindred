#!/bin/bash

# Vibe Coding Webapp - VM Deployment Script
# Run this script on your Linux VM to set up and deploy the application.

set -e

echo "🚀 Starting Kindred AI Studio Deployment Setup..."

# 1. Check for Docker
if ! command -v docker &> /dev/null; then
    echo "📦 Docker not found. Installing Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    sudo usermod -aG docker $USER
    echo "✅ Docker installed. (You may need to log out and log back in for permissions to take effect)"
fi

# 2. Check for Docker Compose plugin
if ! docker compose version &> /dev/null; then
    echo "📦 Docker Compose plugin not found. Installing..."
    sudo apt-get update
    sudo apt-get install -y docker-compose-plugin
fi

# 3. Ensure environment variables exist
if [ ! -f ".env" ]; then
    echo "⚠️  .env file not found. Creating from .env.example..."
    cp .env.example .env
    echo "❌ PLEASE EDIT .env AND FILL IN YOUR API KEYS BEFORE CONTINUING!"
    echo "Run: nano .env"
    exit 1
fi

if [ ! -f "frontend/.env.local" ]; then
    echo "⚠️  frontend/.env.local not found. Creating..."
    touch frontend/.env.local
    echo "❌ PLEASE ADD YOUR CLERK KEYS TO frontend/.env.local"
    echo "Run: nano frontend/.env.local"
    exit 1
fi

# 4. Generate random database encryption key if not set
if ! grep -q "your-32-char-encryption-key-here" .env; then
    # Key is already set or modified
    :
else
    echo "🔑 Generating random DB encryption key..."
    NEW_KEY=$(openssl rand -hex 16)
    sed -i "s/your-32-char-encryption-key-here/$NEW_KEY/g" .env
fi

# 5. Build and Deploy
echo "🔨 Building Docker images (this may take a few minutes)..."
docker compose build

echo "🚢 Starting services..."
docker compose up -d

echo "✅ Deployment complete!"
echo ""
echo "🌐 The application is now running via Nginx on port 80."
echo "   Access it by navigating to: http://<your-vm-ip-address>"
echo ""
echo "📊 To view logs: docker compose logs -f"
echo "🛑 To stop: docker compose down"
