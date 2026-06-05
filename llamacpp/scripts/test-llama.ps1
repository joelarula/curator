param(
    [string]$ServerHost = "127.0.0.1",
    [int]$Port = 8080,
    [string]$Prompt = "Write a short 4-line poem about Rust and local LLMs.",
    [string]$Model = "local-gemma-3-1b-it",
    [int]$MaxTokens = 120,
    [double]$Temperature = 0.7,
    [switch]$FullOutput,
    [string]$OutputFile
)

$ErrorActionPreference = "Stop"
$baseUrl = "http://$ServerHost`:$Port"

Write-Host "Checking health at $baseUrl/health ..."
try {
    $health = Invoke-RestMethod -Uri "$baseUrl/health" -Method Get -TimeoutSec 15
    Write-Host "Health OK:" ($health | ConvertTo-Json -Compress)
} catch {
    Write-Host "Health check failed:" $_.Exception.Message
    exit 1
}

# Try OpenAI-compatible endpoint first.
$chatBody = @{
    model = $Model
    messages = @(
        @{
            role = "user"
            content = $Prompt
        }
    )
    max_tokens = $MaxTokens
    temperature = $Temperature
} | ConvertTo-Json -Depth 10

Write-Host "Calling $baseUrl/v1/chat/completions ..."
try {
    $chat = Invoke-RestMethod -Uri "$baseUrl/v1/chat/completions" -Method Post -ContentType "application/json" -Body $chatBody -TimeoutSec 120
    $chatJson = $chat | ConvertTo-Json -Depth 20

    if ($OutputFile) {
        Set-Content -LiteralPath $OutputFile -Value $chatJson
        Write-Host "Saved full response payload to: $OutputFile"
    }

    if ($FullOutput) {
        Write-Host "\n=== FULL RESPONSE (chat/completions) ==="
        Write-Host $chatJson
    }

    if ($null -ne $chat.choices -and $chat.choices.Count -gt 0) {
        $modelText = [string]$chat.choices[0].message.content
        Write-Host "\n=== MODEL OUTPUT (chat/completions) ==="
        Write-Host $modelText

        exit 0
    }

    Write-Host "Chat response did not include choices, printing full payload:"
    $chat | ConvertTo-Json -Depth 10
    exit 0
} catch {
    Write-Host "chat/completions failed, trying llama.cpp native /completion endpoint..."
}

$completionBody = @{
    prompt = $Prompt
    n_predict = $MaxTokens
    temperature = $Temperature
} | ConvertTo-Json -Depth 10

try {
    $completion = Invoke-RestMethod -Uri "$baseUrl/completion" -Method Post -ContentType "application/json" -Body $completionBody -TimeoutSec 120
    $completionJson = $completion | ConvertTo-Json -Depth 20

    if ($OutputFile) {
        Set-Content -LiteralPath $OutputFile -Value $completionJson
        Write-Host "Saved full response payload to: $OutputFile"
    }

    if ($FullOutput) {
        Write-Host "\n=== FULL RESPONSE (/completion) ==="
        Write-Host $completionJson
    }

    if ($null -ne $completion.content) {
        $modelText = [string]$completion.content
        Write-Host "\n=== MODEL OUTPUT (/completion) ==="
        Write-Host $modelText

        exit 0
    }

    Write-Host "Completion response received, printing full payload:"
    $completion | ConvertTo-Json -Depth 10
    exit 0
} catch {
    Write-Host "Both endpoints failed."
    Write-Host $_.Exception.Message
    exit 1
}
