$projectDir = Split-Path -Parent $PSScriptRoot
node (Join-Path $PSScriptRoot 'server.mjs')
