<#
 Écrit la tâche planifiée Windows « GardeBasesUsine » : la garde locale tourne une fois par jour (sans IA, sans GitHub Actions).
 À lancer UNE fois par le fondateur, dans PowerShell. Aucun secret n'est écrit ici : le jeton reste dans les variables d'environnement de l'utilisateur
 (PLANS_PRIVE_LECTURE, PLANS_PRIVE_DEPOT, PLANS_PRIVE_MANIFESTE). Pour retirer la tâche : Unregister-ScheduledTask -TaskName GardeBasesUsine.
#>
param(
  [string]$Racine = (Split-Path -Parent $PSScriptRoot),
  [string]$Heure = '08:00'
)
$ErrorActionPreference = 'Stop'

$script = Join-Path $Racine 'scripts/garde-bases-locale.ps1'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$script`" -Racine `"$Racine`""
$declencheur = New-ScheduledTaskTrigger -Daily -At $Heure
Register-ScheduledTask -TaskName 'GardeBasesUsine' -Action $action -Trigger $declencheur -Description 'Compare les bases à la source, une fois par jour. Ne modifie rien.' -Force | Out-Null
Write-Output "Tâche « GardeBasesUsine » écrite : tous les jours à $Heure."
