# Typecast AI TTS 자동화 스크립트 (PowerShell)
# -------------------------------------------------
# 이 스크립트는 CSV 파일에서 텍스트와 옵션을 읽어 Typecast API 로 음성 파일을 생성합니다.
# 요구 사항: PowerShell 5+, `Invoke-RestMethod` 지원, Typecast API 키를 환경 변수 TYPECAST_API_KEY 로 설정
# 사용 예시: .\typecast_automation.ps1 -InputCsv .\texts.csv -OutputDir .\audio

param(
    [Parameter(Mandatory=$true)]
    [string]$InputCsv,
    [Parameter(Mandatory=$true)]
    [string]$OutputDir,
    [string]$Model = "ssfm-v30",       # 기본 모델
    [string]$Voice = "tc_632293f759d649937b97f323",        # Voice ID 혹은 이름
    [string]$Emotion = "normal",       # emotion preset
    [int]$Intensity = 5                # 0~100, 감정 강도 (선택적)
)

# API 키 확인
$apiKey = $env:TYPECAST_API_KEY
if (-not $apiKey) {
    Write-Error "환경 변수 TYPECAST_API_KEY 가 설정되지 않았습니다."
    exit 1
}

# 출력 디렉터리 확인/생성
if (-not (Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir | Out-Null
}

# CSV 파싱 (헤더: id,text)
$records = Import-Csv -Path $InputCsv

foreach ($rec in $records) {
    $id = $rec.id
    $text = $rec.text
    if ([string]::IsNullOrWhiteSpace($text)) { continue }

    $payload = @{
        model = $Model
        voice = $Voice
        emotion = $Emotion
        intensity = $Intensity
        text = $text
    } | ConvertTo-Json -Depth 5

    $response = Invoke-RestMethod -Method Post -Uri "https://api.typecast.ai/v1/tts" `
        -Headers @{ "Authorization" = "Bearer $apiKey"; "Content-Type" = "application/json" } `
        -Body $payload -ErrorAction Stop

    if ($response.url) {
        $outFile = Join-Path $OutputDir "$id.mp3"
        Write-Host "Downloading #$id -> $outFile"
        Invoke-WebRequest -Uri $response.url -OutFile $outFile -Headers @{ "Authorization" = "Bearer $apiKey" }
    } else {
        Write-Warning "ID $id 에 대한 음성 생성 실패: $($response | ConvertTo-Json)"
    }
}

Write-Host "✅ 모든 작업이 완료되었습니다. 파일은 $OutputDir 에 저장됩니다."
