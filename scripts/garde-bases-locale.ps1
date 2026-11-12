<#
 Garde d'écart des bases, lancée à la main ou par la tâche planifiée (voir planifier-garde-bases.ps1).
 Sans IA. Elle COMPARE et alerte : elle lance scripts/garde-bases-externe.mjs (non modifié) et n'écrit jamais dans le dossier des bases.
 Code de sortie : 0 = bases conformes ; 1 = écart, jeton ou réglage absent, ou manifeste illisible.
 Le jeton PLANS_PRIVE_LECTURE est lu dans l'environnement de l'utilisateur ; il n'est jamais affiché ni écrit.
 Alerte : un fichier ALERTE-BASES.txt est posé dans le dossier d'état (sous LOCALAPPDATA, hors du dépôt) tant que l'écart dure ; il disparaît au retour au vert.
#>
param(
  [string]$Racine = (Split-Path -Parent $PSScriptRoot),
  [string]$DossierEtat = (Join-Path $(if ($env:LOCALAPPDATA) { $env:LOCALAPPDATA } else { $env:TEMP }) 'GardeBases')
)
$ErrorActionPreference = 'Stop'

function Masquer([string]$texte) {
  $jeton = $env:PLANS_PRIVE_LECTURE
  if ($jeton -and $texte) { return $texte.Replace($jeton, '***') }
  return $texte
}

New-Item -ItemType Directory -Force -Path $DossierEtat | Out-Null
$alerte = Join-Path $DossierEtat 'ALERTE-BASES.txt'
$journal = Join-Path $DossierEtat 'garde-bases.log'

$sortie = ''
$code = 1
try {
  $garde = Join-Path $Racine 'scripts/garde-bases-externe.mjs'
  $sortie = (& node $garde 2>&1 | Out-String)
  $code = $LASTEXITCODE
} catch {
  $sortie = "La garde n'a pas pu démarrer : $($_.Exception.Message)"
  $code = 1
}
$sortie = Masquer $sortie
$date = (Get-Date).ToUniversalTime().ToString('yyyy-MM-dd HH:mm') + ' UTC'

if ($code -eq 0) {
  if (Test-Path $alerte) { Remove-Item -LiteralPath $alerte -Force }
  Add-Content -Path $journal -Value "$date · conforme"
  Write-Output $sortie.Trim()
  exit 0
}

$message = "Les bases ne sont pas à jour avec la source ($date).`r`n$($sortie.Trim())`r`nQue faire : lancez scripts/synchroniser-bases.sh, relisez « git diff » sur le dossier des bases, puis livrez."
Set-Content -Path $alerte -Value $message -Encoding UTF8
Add-Content -Path $journal -Value "$date · écart ou garde en échec"
[Console]::Error.WriteLine($message)
exit 1
