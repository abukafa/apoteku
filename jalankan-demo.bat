@echo off
title Apoteku Demo Launcher
color 0A

echo =================================================================
echo           APOTEKU - CLIENT DEMO SYSTEM LAUNCHER
echo =================================================================
echo.
echo [1/3] Menjalankan Backend Elysia (Port 3001) ^& Frontend Vite (Port 5173)...
start "Apoteku Dev Server" cmd /k "bun --filter @apoteku/backend --filter @apoteku/web --parallel run dev"

echo.
echo [2/3] Menunggu server siap...
timeout /t 3 /nobreak >nul

echo.
echo [3/3] Mengaktifkan Tunnel Publik HTTPS...
start "Apoteku Ngrok Tunnel" cmd /k "ngrok http 127.0.0.1:5173"

echo.
echo =================================================================
echo                      SISTEM DEMO SIAP!
echo =================================================================
echo.
echo URL Akses Publik dapat dilihat di jendela "Apoteku Ngrok Tunnel"
echo (Contoh: https://closure-boss-dumpling.ngrok-free.dev)
echo.
echo URL Akses LAN (Satu Wi-Fi):
echo http://192.168.1.88:5173
echo.
echo * Catatan: Jika membuka via link ngrok di HP klien, cukup klik 
echo   tombol "Visit Site" satu kali pada layar awal.
echo =================================================================
echo.
pause
