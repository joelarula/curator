param(
    [Parameter(Mandatory = $true)]
    [string]$PromptFile,

    [string]$ServerHost = "127.0.0.1",
    [int]$Port = 8080,
    [string]$Model = "local-gemma-3-1b-it",
    [int]$MaxTokens = 120,
    [double]$Temperature = 0.7,
    [switch]$FullOutput,
    [string]$OutputFile
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $PromptFile)) {
    Write-Host "Prompt file not found: $PromptFile"
    exit 1
}

$promptText = Get-Content -LiteralPath $PromptFile -Raw
if ([string]::IsNullOrWhiteSpace($promptText)) {
    Write-Host "Prompt file is empty: $PromptFile"
    exit 1
}

$runner = Join-Path $PSScriptRoot "test-llama.ps1"
if (-not (Test-Path -LiteralPath $runner)) {
    Write-Host "Missing dependency script: $runner"
    exit 1
}

& $runner `
    -ServerHost $ServerHost `
    -Port $Port `
    -Prompt $promptText `
    -Model $Model `
    -MaxTokens $MaxTokens `
    -Temperature $Temperature `
    -FullOutput:$FullOutput `
    -OutputFile $OutputFile
