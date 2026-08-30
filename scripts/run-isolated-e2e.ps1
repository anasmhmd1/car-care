param(
  [ValidatePattern('^bareeq_test_e2e_[a-z0-9]{8}$')]
  [string]$SchemaName = 'bareeq_test_e2e_019fbc1f',
  [ValidateRange(1024, 65535)]
  [int]$Port = 3417,
  [switch]$ReuseExistingSchema,
  [switch]$KeepIsolatedState,
  [string[]]$TestFiles = @()
)

$ErrorActionPreference = 'Stop'

function Read-DotEnvValue([string]$Name) {
  $line = Get-Content -LiteralPath '.env' |
    Where-Object { $_ -match ('^' + [regex]::Escape($Name) + '=') } |
    Select-Object -First 1
  if (-not $line) { return $null }
  $value = $line.Substring($Name.Length + 1).Trim()
  if (
    $value.Length -ge 2 -and
    (($value.StartsWith('"') -and $value.EndsWith('"')) -or
      ($value.StartsWith("'") -and $value.EndsWith("'")))
  ) {
    $value = $value.Substring(1, $value.Length - 2)
  }
  return $value
}

function Set-UrlSchema([string]$Url, [string]$Schema) {
  if ($Url -match '([?&])schema=[^&]*') {
    return [regex]::Replace($Url, '([?&])schema=[^&]*', {
      param($match)
      $match.Groups[1].Value + 'schema=' + $Schema
    })
  }
  $separator = if ($Url.Contains('?')) { '&' } else { '?' }
  return $Url + $separator + 'schema=' + $Schema
}

$baseDatabaseUrl = Read-DotEnvValue 'E2E_DATABASE_URL'
$baseDirectUrl = Read-DotEnvValue 'E2E_DIRECT_URL'
$sessionSecret = Read-DotEnvValue 'SESSION_SECRET'
if (-not $baseDatabaseUrl) {
  throw 'E2E_DATABASE_URL is required in .env. Refusing to run isolated E2E against DATABASE_URL.'
}
if (-not $baseDirectUrl) { $baseDirectUrl = $baseDatabaseUrl }
if (-not $sessionSecret -or $sessionSecret.Length -lt 32) {
  throw 'SESSION_SECRET is missing or too short.'
}

$e2eDatabaseUrl = Set-UrlSchema $baseDatabaseUrl $SchemaName
$e2eDirectUrl = Set-UrlSchema $baseDirectUrl $SchemaName
$workspacePath = (Resolve-Path -LiteralPath '.').Path
$dataRoot = Join-Path $workspacePath 'data'
$uploadPath = Join-Path $dataRoot ('e2e-uploads-' + $SchemaName)
$expectedUploadPath = Join-Path $workspacePath ('data\e2e-uploads-' + $SchemaName)
$e2eBuildPath = Join-Path $workspacePath ('.next-e2e-' + $Port)
$expectedE2eBuildPath = Join-Path $workspacePath ('.next-e2e-' + $Port)
if ($uploadPath -ne $expectedUploadPath) {
  throw 'Refusing to use an unverified E2E upload path.'
}
if ($e2eBuildPath -ne $expectedE2eBuildPath) {
  throw 'Refusing to use an unverified E2E build path.'
}

# Next mutates these files when a custom distDir is active. Preserve their
# exact bytes so an isolated test run cannot leave port-specific paths behind.
$workspaceConfigPaths = @(
  (Join-Path $workspacePath 'next-env.d.ts'),
  (Join-Path $workspacePath 'tsconfig.json')
)
$previousWorkspaceFiles = @{}
foreach ($workspaceConfigPath in $workspaceConfigPaths) {
  $previousWorkspaceFiles[$workspaceConfigPath] = if (Test-Path -LiteralPath $workspaceConfigPath) {
    [System.IO.File]::ReadAllBytes($workspaceConfigPath)
  } else {
    $null
  }
}

$managedEnvironmentNames = @(
  'DATABASE_URL',
  'DIRECT_URL',
  'E2E_DATABASE_URL',
  'E2E_PORT',
  'E2E_ISOLATED_RUNNER',
  'NEXT_PUBLIC_APP_URL',
  'SESSION_SECRET',
  'UPLOAD_DIR',
  'SEED_PASSWORD',
  'SEED_ADMIN_PASSWORD',
  'PLAYWRIGHT_HTML_OPEN'
)
$previousEnvironment = @{}
foreach ($environmentName in $managedEnvironmentNames) {
  $previousEnvironment[$environmentName] = [System.Environment]::GetEnvironmentVariable(
    $environmentName,
    [System.EnvironmentVariableTarget]::Process
  )
}

$failure = 0
try {
  New-Item -ItemType Directory -Path $uploadPath -Force | Out-Null
  $env:DATABASE_URL = $e2eDatabaseUrl
  $env:DIRECT_URL = $e2eDirectUrl
  $env:E2E_DATABASE_URL = $e2eDatabaseUrl
  $env:E2E_PORT = [string]$Port
  $env:E2E_ISOLATED_RUNNER = '1'
  $env:NEXT_PUBLIC_APP_URL = 'http://localhost:' + $Port
  $env:SESSION_SECRET = $sessionSecret
  $env:UPLOAD_DIR = $uploadPath
  $env:SEED_PASSWORD = [guid]::NewGuid().ToString('N') + 'aA9!'
  $env:SEED_ADMIN_PASSWORD = [guid]::NewGuid().ToString('N') + 'zZ8!'
  $env:PLAYWRIGHT_HTML_OPEN = 'never'

  if (-not $ReuseExistingSchema) {
    $resetSql = 'DROP SCHEMA IF EXISTS "' + $SchemaName + '" CASCADE; CREATE SCHEMA "' + $SchemaName + '";'
    $resetSql | npx prisma db execute --stdin --url $baseDirectUrl
    if ($LASTEXITCODE -ne 0) { throw 'Could not create the isolated E2E schema.' }

    npm run db:migrate:deploy
    if ($LASTEXITCODE -ne 0) { throw 'E2E migrations failed.' }
    npm run db:seed
    if ($LASTEXITCODE -ne 0) { throw 'E2E seed failed.' }
  } else {
    # Reuse preserves test data, not an old database shape. Bring the schema
    # forward before booting Next so the current Prisma client cannot hit a
    # stale-column error at runtime.
    npm run db:migrate:deploy
    if ($LASTEXITCODE -ne 0) { throw 'Could not migrate the reused E2E schema.' }
    npm run db:migrate:status
    if ($LASTEXITCODE -ne 0) { throw 'The reused E2E schema is not up to date.' }
  }

  if ($TestFiles.Count -gt 0) {
    npx playwright test @TestFiles
  } else {
    npm run test:e2e
  }
  if ($LASTEXITCODE -ne 0) { throw 'One or more Playwright scenarios failed.' }
} catch {
  $failure = 1
  Write-Error $_ -ErrorAction Continue
} finally {
  try {
    if (-not $KeepIsolatedState) {
      $cleanupSql = 'DROP SCHEMA IF EXISTS "' + $SchemaName + '" CASCADE;'
      $cleanupSql | npx prisma db execute --stdin --url $baseDirectUrl
      if ($LASTEXITCODE -ne 0) {
        $failure = 1
        Write-Error 'Could not remove the isolated E2E schema.' -ErrorAction Continue
      }
    }

    if (-not $KeepIsolatedState -and (Test-Path -LiteralPath $uploadPath)) {
      $resolvedUploadPath = (Resolve-Path -LiteralPath $uploadPath).Path
      if (
        $resolvedUploadPath -ne $uploadPath -or
        -not $resolvedUploadPath.StartsWith($dataRoot, [System.StringComparison]::OrdinalIgnoreCase)
      ) {
        $failure = 1
        Write-Error 'Refusing to remove an unverified E2E upload directory.' -ErrorAction Continue
      } else {
        Remove-Item -LiteralPath $resolvedUploadPath -Recurse -Force
      }
    }

    if (-not $KeepIsolatedState -and (Test-Path -LiteralPath $e2eBuildPath)) {
      $resolvedE2eBuildPath = (Resolve-Path -LiteralPath $e2eBuildPath).Path
      if ($resolvedE2eBuildPath -ne $e2eBuildPath) {
        $failure = 1
        Write-Error 'Refusing to remove an unverified E2E build directory.' -ErrorAction Continue
      } else {
        Remove-Item -LiteralPath $resolvedE2eBuildPath -Recurse -Force
      }
    }
  } finally {
    foreach ($environmentName in $managedEnvironmentNames) {
      [System.Environment]::SetEnvironmentVariable(
        $environmentName,
        $previousEnvironment[$environmentName],
        [System.EnvironmentVariableTarget]::Process
      )
    }
    foreach ($workspaceConfigPath in $workspaceConfigPaths) {
      $previousBytes = $previousWorkspaceFiles[$workspaceConfigPath]
      if ($null -eq $previousBytes) {
        if (Test-Path -LiteralPath $workspaceConfigPath) {
          Remove-Item -LiteralPath $workspaceConfigPath -Force
        }
      } else {
        [System.IO.File]::WriteAllBytes($workspaceConfigPath, [byte[]]$previousBytes)
      }
    }
  }
}

exit $failure
