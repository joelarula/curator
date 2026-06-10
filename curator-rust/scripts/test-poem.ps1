param(
    [string]$Host = "127.0.0.1",
    [int]$Port = 8080,
    [string]$Model = "gemma-3-1b-it",
    [string]$Prompt = "Write a short 4-line poem about the Rust programming language.",
    [int]$MaxTokens = 128,
    [double]$Temperature = 0.7,
    [string]$BaseUrl = ""
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($BaseUrl)) {
    $BaseUrl = "http://${Host}:$Port"
}

try {
    $health = Invoke-RestMethod -Uri "$BaseUrl/health" -Method Get -TimeoutSec 10
    Write-Host "Health:" ($health | ConvertTo-Json -Compress)
}
catch {
    Write-Error "Failed to reach $BaseUrl/health. Is the curator server running? $_"
    exit 1
}

$body = @{
    model = $Model
    messages = @(
        @{
            role = "user"
            content = $Prompt
        }
    )
    max_tokens = $MaxTokens
    temperature = $Temperature
} | ConvertTo-Json -Depth 5

try {
    $response = Invoke-RestMethod -Uri "$BaseUrl/v1/chat/completions" -Method Post -ContentType "application/json" -Body $body -TimeoutSec 120
}
catch {
    Write-Error "Poem request failed against $BaseUrl/v1/chat/completions. $_"
    exit 1
}

# The endpoint may return plain text error responses (e.g. decode failures)
# instead of the expected OpenAI-compatible JSON object.
if ($response -is [string]) {
    Write-Error "Server returned plain text instead of JSON: $response"
    exit 1
}

if (-not $response.PSObject.Properties.Name.Contains("choices") -or -not $response.choices -or $response.choices.Count -eq 0) {
    Write-Error ("Unexpected response shape (missing choices): " + ($response | ConvertTo-Json -Depth 10))
    exit 1
}

$poem = $response.choices[0].message.content
if ([string]::IsNullOrWhiteSpace($poem)) {
    Write-Error "Model returned an empty response"
    exit 1
}

Write-Host ""
Write-Host "--- Response ---"
Write-Host "ID:     " $response.id
Write-Host "Model:  " $response.model
Write-Host "Tokens: " $response.usage.total_tokens
Write-Host "Response:"
Write-Host $poem
Write-Host "----------------"
