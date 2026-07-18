<#
Install Node.js (Windows) for this project.
Run this PowerShell script in an elevated PowerShell prompt.

It prefers `winget` to install Node.js LTS (recommended). If `winget` is
not available, the script prints manual instructions to install Node or nvm-windows.
#>

$ErrorActionPreference = 'Stop'

function Install-With-Winget {
    Write-Host "Installing Node.js LTS via winget..."
    winget install --id OpenJS.NodeJS.LTS -e --accept-package-agreements --accept-source-agreements
}

if (Get-Command winget -ErrorAction SilentlyContinue) {
    Install-With-Winget
    Write-Host "Done. Verify with: node -v and npm -v"
} else {
    Write-Host "winget not found. Please install Node.js manually or install nvm-windows (https://github.com/coreybutler/nvm-windows)."
    Write-Host "Manual Node LTS download: https://nodejs.org/en/download/"
    Write-Host "After installing nvm-windows, run: nvm install 18; nvm use 18"
}
