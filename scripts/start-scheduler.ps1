param(
  [string]$RepoRoot = "E:\MyBackup\GithubProject\ai-memory-system"
)

$ErrorActionPreference = "Stop"

$memoryDir = Join-Path $env:USERPROFILE ".memory-tdai"
$logDir = Join-Path $memoryDir "logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$env:MEMORY_DATA_DIR = "~/.memory-tdai"

# Local LLM for daily summaries.
$env:LLM_BASE_URL = "http://127.0.0.1:1234/v1"
$env:LLM_API_KEY = "lm-studio"
$env:LLM_MODEL = "sulphur-2-base"
$env:LLM_MAX_TOKENS = "800"
$env:DAILY_SUMMARY_MAX_CONTENT_CHARS = "7000"
$env:MEMORY_LLM_MAX_TOKENS = "4096"
$env:MEMORY_L1_BATCH_LIMIT = "2"
$env:MEMORY_L2_MAX_TOKENS = "2048"
$env:MEMORY_REINDEX_ON_INIT = "background"

# Local embedding service used by the memory bridge / pipeline when inherited.
$env:OLLAMA_HOST = "127.0.0.1:11522"
$env:EMBEDDING_PROVIDER = "ollama"
$env:EMBEDDING_BASE_URL = "http://127.0.0.1:11522/v1"
$env:EMBEDDING_API_KEY = "ollama"
$env:EMBEDDING_MODEL = "qwen3-embedding"
$env:EMBEDDING_DIMENSIONS = "4096"
$env:EMBEDDING_SEND_DIMENSIONS = "true"
$env:EMBEDDING_TIMEOUT_MS = "180000"

Set-Location $RepoRoot

$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
"[$timestamp] Starting ai-memory-system scheduler from $RepoRoot" | Out-File -FilePath (Join-Path $logDir "scheduler.log") -Append -Encoding utf8

npm run start:scheduler *>> (Join-Path $logDir "scheduler.log")
