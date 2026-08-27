@echo off
start "JobHunter Backend" cmd /k "cd /d D:\Ai\JobHunter-AI\backend && npm.cmd run dev"
start "JobHunter Frontend" cmd /k "cd /d D:\Ai\JobHunter-AI\frontend && npm.cmd run dev"
exit