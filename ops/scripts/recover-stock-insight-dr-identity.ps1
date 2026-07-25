param(
  [Parameter(Mandatory=$true)][string]$ProtectedBlob,
  [Parameter(Mandatory=$true)][string]$OutputIdentity
)
$ErrorActionPreference = 'Stop'
$encrypted = Get-Content -Raw -LiteralPath $ProtectedBlob
$secure = ConvertTo-SecureString $encrypted
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
  $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
  [IO.File]::WriteAllText($OutputIdentity, $plain + [Environment]::NewLine, [Text.UTF8Encoding]::new($false))
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
}
$acl = Get-Acl -LiteralPath $OutputIdentity
$acl.SetAccessRuleProtection($true, $false)
$rule = [Security.AccessControl.FileSystemAccessRule]::new($env:USERNAME, 'FullControl', 'Allow')
$acl.SetAccessRule($rule)
Set-Acl -LiteralPath $OutputIdentity -AclObject $acl
Write-Output "recovered=$OutputIdentity"
