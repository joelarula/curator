<#
.SYNOPSIS
  Builds, deploys, migrates, and runs the Keeris miniapp + PostgreSQL stack on a remote Docker host via SSH.

.EXAMPLE
  .\deploy-remote.ps1 -RemoteHost "joel@192.168.1.110" -Action up
  .\deploy-remote.ps1 -RemoteHost "joel@192.168.1.110" -Action migrate
  .\deploy-remote.ps1 -RemoteHost "joel@192.168.1.110" -Action logs
#>

param(
    [Parameter(Position = 0)]
    [string]$RemoteHost = "",

    [ValidateSet("up", "down", "restart", "logs", "build", "status", "migrate")]
    [string]$Action = "up",

    [int]$Port = 4000,

    [int]$PostgresPort = 5432,

    [string]$PostgresDb = "keeris",

    [string]$PostgresUser = "curator",

    [string]$PostgresPassword = "curator_secret",

    [string]$GeminiApiKey = $env:GEMINI_API_KEY,

    [string]$GoogleApiKey = $env:GOOGLE_API_KEY,

    [bool]$NoCache = $false,

    [switch]$FollowLogs,

    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$keerisRoot = Resolve-Path (Join-Path $scriptRoot "..")
$workspaceRoot = Resolve-Path (Join-Path $keerisRoot "..\..")
$composeFile = (Join-Path $keerisRoot "docker-compose.yml")

function Set-DockerHostContext {
    param([string]$HostSpec)
    if ($HostSpec) {
        $env:DOCKER_HOST = if ($HostSpec.StartsWith("ssh://")) { $HostSpec } else { "ssh://$HostSpec" }
        Write-Host ">>> Using Remote Docker Host: $env:DOCKER_HOST" -ForegroundColor Cyan
    } else {
        Write-Host ">>> Using Local Docker Daemon" -ForegroundColor Cyan
    }
}

function Invoke-DockerCommand {
    param([string[]]$ArgsList)
    $cmdStr = "docker " + ($ArgsList -join " ")
    Write-Host "[RUN] $cmdStr" -ForegroundColor DarkGray
    if ($DryRun) { return }

    & docker @ArgsList
    if ($LASTEXITCODE -ne 0) {
        throw "Docker command failed with exit code $LASTEXITCODE"
    }
}

Set-DockerHostContext -HostSpec $RemoteHost

try {
    # Extract clean hostname/IP for web and database links
    $displayHost = if ($RemoteHost) {
        $clean = $RemoteHost -replace "^.*@", "" -replace ":.*$", ""
        $clean
    } else {
        "localhost"
    }

    # Pass PostgreSQL and application configuration into environment
    $env:PORT = "$Port"
    $env:POSTGRES_PORT = "$PostgresPort"
    $env:POSTGRES_DB = $PostgresDb
    $env:POSTGRES_USER = $PostgresUser
    $env:POSTGRES_PASSWORD = $PostgresPassword
    if ($GeminiApiKey) { $env:GEMINI_API_KEY = $GeminiApiKey }
    if ($GoogleApiKey) { $env:GOOGLE_API_KEY = $GoogleApiKey }

    switch ($Action) {
        "build" {
            Write-Host ">>> Building Keeris Docker Compose Stack..." -ForegroundColor Green
            $buildArgs = @("compose", "-f", $composeFile, "build")
            if ($NoCache) { $buildArgs += "--no-cache" }
            Invoke-DockerCommand -ArgsList $buildArgs
            Write-Host ">>> Build completed successfully!" -ForegroundColor Green
        }

        "up" {
            Write-Host ">>> Cleaning up previous standalone containers if any..." -ForegroundColor DarkGray
            if (-not $DryRun) {
                & docker rm -f keeris-app 2>$null | Out-Null
            }

            Write-Host ">>> Deploying Keeris + PostgreSQL Stack on $displayHost..." -ForegroundColor Green
            $upArgs = @("compose", "-f", $composeFile, "up", "-d", "--build")
            if ($NoCache) { $upArgs += "--no-cache" }
            Invoke-DockerCommand -ArgsList $upArgs

            Write-Host ""
            Write-Host "==========================================================" -ForegroundColor Green
            Write-Host " Keeris + PostgreSQL Stack is LIVE! " -ForegroundColor Green
            Write-Host " Web App URL:    http://${displayHost}:${Port}" -ForegroundColor Yellow
            Write-Host " Health Check:   http://${displayHost}:${Port}/health" -ForegroundColor Yellow
            Write-Host " PostgreSQL URI: postgresql://${PostgresUser}:${PostgresPassword}@${displayHost}:${PostgresPort}/${PostgresDb}" -ForegroundColor Cyan
            Write-Host "==========================================================" -ForegroundColor Green
            Write-Host ""
        }

        "migrate" {
            Write-Host ">>> Running SQLite -> PostgreSQL Migration to $displayHost..." -ForegroundColor Green
            $env:DATABASE_URL = "postgresql://${PostgresUser}:${PostgresPassword}@${displayHost}:${PostgresPort}/${PostgresDb}?schema=public"
            $env:SQLITE_PATH = (Join-Path $keerisRoot "data\keeris.db")
            node (Join-Path $scriptRoot "migrate-sqlite-to-postgres.js")
        }

        "down" {
            Write-Host ">>> Stopping Keeris Stack..." -ForegroundColor Yellow
            Invoke-DockerCommand -ArgsList @("compose", "-f", $composeFile, "down")
            Write-Host ">>> Keeris Stack stopped." -ForegroundColor Green
        }

        "restart" {
            Write-Host ">>> Restarting Keeris Stack..." -ForegroundColor Yellow
            Invoke-DockerCommand -ArgsList @("compose", "-f", $composeFile, "restart")
            Write-Host ">>> Restarted. Access at http://${displayHost}:${Port}" -ForegroundColor Green
        }

        "logs" {
            $logArgs = @("compose", "-f", $composeFile, "logs")
            if ($FollowLogs) { $logArgs += "-f" } else { $logArgs += "--tail", "100" }
            Invoke-DockerCommand -ArgsList $logArgs
        }

        "status" {
            Invoke-DockerCommand -ArgsList @("compose", "-f", $composeFile, "ps")
        }
    }
}
finally {
    if ($RemoteHost) {
        Remove-Item Env:DOCKER_HOST -ErrorAction SilentlyContinue
    }
}
