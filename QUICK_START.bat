@echo off
REM Quick Start Script for Music App Backend - Windows Version

echo.
echo 🚀 Music App Backend - Quick Start (Windows)
echo =============================================
echo.

REM Check if .env file exists
if not exist ".env" (
    echo 📝 Creating .env file from .env.example...
    copy .env.example .env
    echo ✅ .env file created
) else (
    echo ✅ .env file already exists
)

echo.
echo 📦 Checking dependencies...
if not exist "node_modules" (
    echo Installing npm packages...
    call npm install
    echo ✅ Dependencies installed
) else (
    echo ✅ Dependencies already installed
)

echo.
echo 🔍 MongoDB Configuration
echo ========================
echo MongoDB URL: mongodb://localhost:27017/modelstation
echo.
echo ⚠️  IMPORTANT: Make sure MongoDB is running!
echo Options to start MongoDB:
echo   1. Windows Service: net start MongoDB (if installed)
echo   2. Command line: mongod
echo   3. Docker: docker run -d -p 27017:27017 --name mongodb mongo:latest
echo.

setlocal enabledelayedexpansion
set /p mongodb_running="Is MongoDB running? (y/n): "

if /i "!mongodb_running!"=="y" (
    echo.
    echo 🌱 Running database seeder...
    call node seed.js
    
    if !errorlevel! equ 0 (
        echo ✅ Database seeded successfully!
        echo.
        echo Test Users Created:
        echo   • Email: recruiter@example.com ^| Password: password123
        echo   • Email: professional@example.com ^| Password: password123
    ) else (
        echo ❌ Seeding failed. Check MongoDB connection.
        pause
        exit /b 1
    )
) else (
    echo ⚠️  Skipping database seeding. Please run 'node seed.js' after starting MongoDB.
)

echo.
echo 🎉 Setup complete!
echo.
echo 🚀 To start the development server, run:
echo    npm run dev
echo.
echo 📖 API Documentation will be available at:
echo    http://localhost:5051/v1/docs
echo.
pause
