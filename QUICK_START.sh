#!/bin/bash
# Quick Start Script for Music App Backend

echo "🚀 Music App Backend - Quick Start"
echo "=================================="
echo ""

# Check if .env file exists
if [ ! -f .env ]; then
    echo "📝 Creating .env file from .env.example..."
    cp .env.example .env
    echo "✅ .env file created"
else
    echo "✅ .env file already exists"
fi

echo ""
echo "📦 Checking dependencies..."
if [ ! -d "node_modules" ]; then
    echo "Installing npm packages..."
    npm install
    echo "✅ Dependencies installed"
else
    echo "✅ Dependencies already installed"
fi

echo ""
echo "🔍 Checking MongoDB connection..."
echo "   MongoDB URL: mongodb://localhost:27017/modelstation"
echo ""
echo "   ⚠️  IMPORTANT: Make sure MongoDB is running!"
echo "   • Windows: Start MongoDB service or run: mongod"
echo "   • Mac: brew services start mongodb-community"
echo "   • Linux: sudo systemctl start mongod"
echo "   • Docker: docker run -d -p 27017:27017 --name mongodb mongo:latest"
echo ""

read -p "Is MongoDB running? (y/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo ""
    echo "🌱 Running database seeder..."
    node seed.js
    
    if [ $? -eq 0 ]; then
        echo "✅ Database seeded successfully!"
        echo ""
        echo "Test Users Created:"
        echo "  • Email: recruiter@example.com | Password: password123"
        echo "  • Email: professional@example.com | Password: password123"
    else
        echo "❌ Seeding failed. Check MongoDB connection."
        exit 1
    fi
else
    echo "⚠️  Skipping database seeding. Please run 'node seed.js' after starting MongoDB."
fi

echo ""
echo "🎉 Setup complete!"
echo ""
echo "🚀 To start the development server, run:"
echo "   npm run dev"
echo ""
echo "📖 API Documentation will be available at:"
echo "   http://localhost:5051/v1/docs"
echo ""
