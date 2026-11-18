param(
    [Parameter(Mandatory)][string]$PlatformJar,
    [Parameter(Mandatory)][string]$BuildTools,
    [string]$SigningKeystore,
    [string]$SigningKeyAlias,
    [switch]$Debuggable,
    [switch]$SkipWebBuild
)

$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true
$PlatformJar = (Resolve-Path $PlatformJar).Path
$BuildTools = (Resolve-Path $BuildTools).Path
$JdkBin = Join-Path $env:JAVA_HOME 'bin'
$Upstream = (Resolve-Path (Join-Path $PSScriptRoot '../blockbench')).Path
if (!$SkipWebBuild) {
    Push-Location $Upstream
    try {
        npm.cmd ci --ignore-scripts --no-audit --no-fund
        node build.js --target=web --analyze
    } finally { Pop-Location }
}

$Staging = (New-Item -ItemType Directory -Force (Join-Path $PSScriptRoot 'build')).FullName
$Web = Join-Path $Staging 'assets/web'
if (Test-Path -LiteralPath $Web) {
    if ((Get-Item -LiteralPath $Web).FullName -ne $Web -or
        (Get-Item -LiteralPath $Web).Attributes.HasFlag([IO.FileAttributes]::ReparsePoint)) {
        throw 'Unexpected Web staging path.'
    }
    Remove-Item -LiteralPath $Web -Recurse -Force
}
New-Item -ItemType Directory -Force "$Web/dist", "$Staging/classes" | Out-Null
foreach ($Entry in @('css', 'font', 'lib')) {
    Copy-Item -Recurse -Force "$Upstream/$Entry" $Web
}
New-Item -ItemType Directory -Force "$Web/assets" | Out-Null
Get-ChildItem -LiteralPath "$Upstream/assets" -Exclude 'splash_art', 'splash_art.png', 'netlify-full-logo-dark.svg', 'logo_cutout.svg' |
    Copy-Item -Recurse -Destination "$Web/assets"
Copy-Item -Force "$Upstream/LICENSE.MD" $Web
Copy-Item -Recurse "$PSScriptRoot/licenses" $Web
$Metadata = Get-Content -Raw "$Upstream/dist/esbuild-metafile.json" | ConvertFrom-Json -AsHashtable
$Dependencies = $Metadata['inputs'].Keys | ForEach-Object {
    if ($_ -match '^node_modules/((?:@[^/]+/)?[^/]+)/') { $Matches[1] }
} | Sort-Object -Unique
$Notices = foreach ($Dependency in $Dependencies) {
    $PackageDir = Join-Path "$Upstream/node_modules" $Dependency
    $Package = Get-Content -Raw "$PackageDir/package.json" | ConvertFrom-Json
    "=== $Dependency $($Package.version) [$($Package.license)] ==="
    $Licenses = @(Get-ChildItem -LiteralPath $PackageDir -File | Where-Object Name -Match '^(licen[cs]e|copying|notice)([.-].*)?$')
    if ($Licenses.Count) {
        $Licenses | ForEach-Object { Get-Content -Raw -LiteralPath $_.FullName }
    } elseif ($Dependency -eq 'isarray') {
        (Get-Content -Raw "$PackageDir/README.md") -replace '(?s)^.*?## License', '## License'
    } else {
        throw "No license notice found for $Dependency."
    }
    ''
}
$Notices | Set-Content -Encoding utf8NoBOM "$Web/THIRD-PARTY-NOTICES.txt"
Copy-Item -Force "$Upstream/dist/bundle.js" "$Web/dist/"
Copy-Item -Force "$PSScriptRoot/android-export.js" $Web
$Html = Get-Content -Raw "$Upstream/index.html"
$Html.Replace('<html lang="en">', '<html lang="zh-CN">').
    Replace('<link rel="manifest" href="manifest.webmanifest">', '').
    Replace('<link rel="apple-touch-icon" href="icon_full.png">', '').
    Replace('<link rel="shortcut icon" href="favicon.png" type="image/x-icon" />', '').
    Replace('</head>', "    <script src=`"android-export.js`"></script>`n</head>") |
    Set-Content -Encoding utf8NoBOM "$Web/index.html"

$Manifest = Get-Content -Raw "$PSScriptRoot/AndroidManifest.xml"
$Version = ([xml]$Manifest).manifest.GetAttribute('versionName', 'http://schemas.android.com/apk/res/android')
if ($Debuggable) {
    $Manifest = $Manifest.Replace('<application', '<application android:debuggable="true"')
}
$Manifest | Set-Content -Encoding utf8NoBOM "$Staging/AndroidManifest.xml"

& "$BuildTools/aapt2.exe" link -I $PlatformJar --manifest "$Staging/AndroidManifest.xml" -o "$Staging/unsigned.apk"
& "$JdkBin/javac.exe" --release 8 -classpath $PlatformJar -d "$Staging/classes" "$PSScriptRoot/MainActivity.java"
$Classes = (Get-ChildItem "$Staging/classes" -Recurse -Filter '*.class').FullName
& "$BuildTools/d8.bat" --lib $PlatformJar --min-api 26 --output $Staging @Classes
& "$JdkBin/jar.exe" --update --file "$Staging/unsigned.apk" -C $Staging classes.dex -C $Staging assets
$ApkEntries = & "$JdkBin/jar.exe" tf "$Staging/unsigned.apk"
if ('assets/web/index.html' -cnotin $ApkEntries -or 'assets/web/dist/bundle.js' -cnotin $ApkEntries) {
    throw 'The APK is missing the packaged Web entry point or bundle.'
}
& "$BuildTools/zipalign.exe" -f 4 "$Staging/unsigned.apk" "$Staging/aligned.apk"

if ($SigningKeystore) {
    $Key = (Resolve-Path -LiteralPath $SigningKeystore).Path
    if (!$env:BOOKBENCH_KEYSTORE_PASSWORD) { throw 'Set BOOKBENCH_KEYSTORE_PASSWORD for the release signing key.' }
    $Password = 'env:BOOKBENCH_KEYSTORE_PASSWORD'
} else {
    $Key = "$Staging/local-signing.jks"
    $Password = 'pass:android'
    if (!(Test-Path -LiteralPath $Key)) {
        & "$JdkBin/keytool.exe" -genkeypair -keystore $Key -alias bookbench-local -storepass android -keypass android -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Bookbench Mobile local Android build"
    }
}
$Name = if ($Debuggable) { "bookbench-mobile-$Version-test.apk" } else { "bookbench-mobile-$Version.apk" }
$AliasArgs = if ($SigningKeyAlias) { @('--ks-key-alias', $SigningKeyAlias) } else { @() }
& "$BuildTools/apksigner.bat" sign --ks $Key @AliasArgs --ks-pass $Password --key-pass $Password --out "$Staging/$Name" "$Staging/aligned.apk"
& "$BuildTools/apksigner.bat" verify --verbose "$Staging/$Name"
Write-Output "$Staging/$Name"
