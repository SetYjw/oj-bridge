param(
    [ValidateSet('install', 'uninstall', 'diagnose')]
    [string]$Action = 'install',
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$InstallerArgs
)
$ErrorActionPreference = 'Stop'
$candidates = [System.Collections.Generic.List[object]]::new()
function Add-PythonCandidate([string]$Executable, [string[]]$Prefix = @()) {
    if ($Executable) { $candidates.Add([pscustomobject]@{ Executable = $Executable; Prefix = $Prefix }) }
}
if ($env:OJ_BRIDGE_PYTHON) { Add-PythonCandidate $env:OJ_BRIDGE_PYTHON }
$launcher = Get-Command py -ErrorAction SilentlyContinue
if ($launcher) {
    Add-PythonCandidate $launcher.Source @('-3.12')
    Add-PythonCandidate $launcher.Source @('-3')
}
if ($env:LOCALAPPDATA) {
    Add-PythonCandidate (Join-Path $env:LOCALAPPDATA 'Programs\Python\Python312\python.exe')
    $pythonParent = Join-Path $env:LOCALAPPDATA 'Programs\Python'
    if (Test-Path -LiteralPath $pythonParent) {
        Get-ChildItem -LiteralPath $pythonParent -Directory -Filter 'Python3*' |
            Sort-Object Name -Descending | ForEach-Object { Add-PythonCandidate (Join-Path $_.FullName 'python.exe') }
    }
}
$onPath = Get-Command python -ErrorAction SilentlyContinue
if ($onPath) { Add-PythonCandidate $onPath.Source }
$probe = "import json,sys,sysconfig; print(json.dumps({'executable':sys.executable,'version':list(sys.version_info[:2]),'global':sys.prefix==sys.base_prefix,'platform':sys.platform,'build':sysconfig.get_platform()}))"
$selected = $null
foreach ($candidate in $candidates) {
    if (-not (Test-Path -LiteralPath $candidate.Executable -PathType Leaf)) { continue }
    try {
        $prefix = $candidate.Prefix
        $information = & $candidate.Executable @prefix -I -c $probe 2>$null | ConvertFrom-Json
        if ($LASTEXITCODE -eq 0 -and $information.global -and $information.platform -eq 'win32' -and
            $information.build -notmatch 'mingw|msys' -and
            ($information.version[0] -gt 3 -or ($information.version[0] -eq 3 -and $information.version[1] -ge 10))) {
            $selected = $information.executable
            break
        }
    } catch { }
}
if (-not $selected) {
    Write-Host '找不到 Windows 原生的全局 Python 3.10 或更新版本。请从 python.org 安装 Python，或设置 OJ_BRIDGE_PYTHON 为 python.exe 的完整路径。' -ForegroundColor Red
    exit 1
}
Write-Host ('Python: ' + $selected)
& $selected -I (Join-Path $PSScriptRoot 'setup.py') $Action @InstallerArgs
exit $LASTEXITCODE
