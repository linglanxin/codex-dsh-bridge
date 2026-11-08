param(
    [Parameter(Mandatory = $true)][string]$ConfigFile,
    [switch]$Repair,
    [string]$ReviewedWorkspaceSid
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)

function Get-CanonicalDirectory([string]$Path) {
    if (-not [System.IO.Path]::IsPathRooted($Path)) { throw 'Directory paths must be absolute.' }
    $directory = Get-Item -LiteralPath $Path -Force
    if (-not $directory.PSIsContainer) { throw 'Configured path is not a directory.' }
    for ($ancestor = $directory; $null -ne $ancestor; $ancestor = $ancestor.Parent) {
        if ($ancestor.Attributes -band [System.IO.FileAttributes]::ReparsePoint) { throw 'Reparse-point paths are not supported.' }
    }
    return $directory.FullName.TrimEnd('\')
}

$configItem = Get-Item -LiteralPath $ConfigFile -Force
if ($configItem.PSIsContainer -or ($configItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -or $configItem.Length -gt 65536) {
    throw 'Configuration must be a regular JSON file of at most 64 KiB.'
}
$config = Get-Content -LiteralPath $configItem.FullName -Encoding UTF8 -Raw | ConvertFrom-Json
if ($config.version -ne 1) { throw 'Unsupported configuration version.' }
$state = Get-CanonicalDirectory $config.stateDir
$workspace = Get-CanonicalDirectory $config.workspaceRoot
if ($configItem.FullName -ine (Join-Path $state 'config.json')) { throw 'Use stateDir/config.json.' }
if ($workspace -eq [System.IO.Path]::GetPathRoot($workspace).TrimEnd('\') -or
    $workspace -ieq $state -or $workspace.StartsWith($state + '\', [StringComparison]::OrdinalIgnoreCase) -or
    $state.StartsWith($workspace + '\', [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Choose separate, non-root state and workspace directories.'
}

$sections = [System.Security.AccessControl.AccessControlSections]::Access
$currentSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$allowed = @($currentSid, 'S-1-5-18', 'S-1-5-32-544')
function Get-ExtraRules($Acl) {
    @($Acl.GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier]) | Where-Object {
        $_.AccessControlType -eq 'Allow' -and $_.IdentityReference.Value -notin $allowed
    })
}

# Never relax state/config permissions or inspect the authentication token.
if (@(Get-ExtraRules ([System.IO.Directory]::GetAccessControl($state, $sections))).Count -or
    @(Get-ExtraRules ([System.IO.File]::GetAccessControl($configItem.FullName, $sections))).Count) {
    throw 'State/config is not private; no repair performed.'
}
$acl = [System.IO.Directory]::GetAccessControl($workspace, $sections)
$before = $acl.GetSecurityDescriptorSddlForm($sections)
$extra = @(Get-ExtraRules $acl)
$removed = 0
$backup = $null
if ($Repair -and $extra.Count) {
    if (-not $ReviewedWorkspaceSid) { throw 'Inspect the report first and supply -ReviewedWorkspaceSid for the grant you reviewed.' }
    $reviewed = New-Object System.Security.Principal.SecurityIdentifier($ReviewedWorkspaceSid)
    if (@($extra | Where-Object { $_.IsInherited -or $_.IdentityReference.Value -ne $reviewed.Value }).Count) {
        throw 'Unexpected or inherited grants differ from the reviewed SID; no repair performed.'
    }
    if (Get-Process -Name 'DeepSeek Harness' -ErrorAction SilentlyContinue) {
        throw 'DSH Desktop is running; save work and exit before repairing permissions.'
    }
    $ownerFile = Join-Path $state 'bridge.lock\owner.json'
    if (Test-Path -LiteralPath $ownerFile) {
        $owner = Get-Content -LiteralPath $ownerFile -Encoding UTF8 -Raw | ConvertFrom-Json
        if ($owner.pid -gt 0 -and (Get-Process -Id $owner.pid -ErrorAction SilentlyContinue)) {
            throw 'A bridge owner is still running; no repair performed.'
        }
    }
    $backup = Join-Path $state ('permission-backups\' + [guid]::NewGuid().ToString())
    New-Item -ItemType Directory -Path $backup | Out-Null
    [System.IO.File]::WriteAllText((Join-Path $backup 'workspace-before.sddl'), $before)
    [System.IO.File]::WriteAllText((Join-Path $backup 'workspace-path.txt'), $workspace)
    if (([System.IO.Directory]::GetAccessControl($workspace, $sections)).GetSecurityDescriptorSddlForm($sections) -ne $before) {
        throw 'Permissions changed during inspection; no repair performed.'
    }
    foreach ($rule in $extra) { $acl.RemoveAccessRuleSpecific($rule); $removed++ }
    [System.IO.Directory]::SetAccessControl($workspace, $acl)
    $acl = [System.IO.Directory]::GetAccessControl($workspace, $sections)
    [System.IO.File]::WriteAllText((Join-Path $backup 'workspace-after.sddl'), $acl.GetSecurityDescriptorSddlForm($sections))
}
$remaining = @(Get-ExtraRules $acl)
$report = [pscustomobject]@{
    workspace = $workspace
    workspaceTitle = $config.workspaceTitle
    unexpectedAllowRules = @($remaining | ForEach-Object {
        [pscustomobject]@{ sid = $_.IdentityReference.Value; rights = $_.FileSystemRights.ToString(); inherited = $_.IsInherited }
    })
    removed = $removed
    backup = $backup
}
$report | ConvertTo-Json -Depth 4 -Compress
if ($remaining.Count) { exit 2 }
