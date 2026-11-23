![Build](https://github.com/element-hq/element-web/actions/workflows/build_desktop_and_deploy.yaml/badge.svg)

# Element Desktop

Element Desktop is a Matrix client for desktop platforms with Element Web at its core.

## BabaCom internal test build

Unsigned internal test candidates come from the `BabaCom` workflow (`.github/workflows/babacom.yaml`):

1. `BabaCom build and e2e` builds the patched Element Call widget, builds the web app with
   `apps/web/config.babacom.json`, runs the BabaCom end-to-end tests and uploads `babacom-webapp`.
2. `BabaCom Windows package` packs that same artifact into `webapp.asar`, builds with the `babacom/build.json` variant
   and uploads `babacom-windows-unsigned`: the Squirrel installer, the zipped `win-unpacked` app, `BUILD-INFO.txt`
   (source commit and run) and `SHA256SUMS.txt`.

The build is unsigned, so Windows reports an unknown publisher; keep that check. Signing belongs to release-candidate
acceptance. The variant installs as "BabaCom Internal Test" with its own app ID, link scheme and profile, so it does not
replace an Element installation.

The embedded configuration targets `http://127.0.0.1:18008` (`proof.babacom.test`).
Voice and widgets are enabled. Registration, guests and external integrations are disabled.
Element Call is bundled locally and needs the dedicated Matrix and RTC services for calls.
BabaCom's Chinese strings load from `apps/web/res/babacom-translations.json`. Keep BabaCom strings there, not in
`src/i18n/strings/`, whose non-English files come from Element's translation service.

To reproduce the build locally from the repository root:

```powershell
node apps/web/scripts/build-babacom-call-widget.mjs   # the web build fails without the patched widget
Copy-Item apps/web/config.babacom.json apps/web/config.json
pnpm -C apps/web run build
Copy-Item -Recurse apps/web/webapp apps/desktop/webapp  # or extract a downloaded babacom-webapp artifact there
pnpm -C apps/desktop run asar-webapp
$env:VARIANT_PATH = "babacom/build.json"
pnpm -C apps/desktop exec nx build element-desktop --skip-nx-cache -- --publish never --x64 -w squirrel `
    -c.directories.output=dist/babacom-<build>
```

`--skip-nx-cache` matters locally: the desktop `build` target caches all of `apps/desktop/dist`, so each cached build
would copy every older package in it into the Nx cache. If electron-builder cannot download Electron, add
`-c.electronDist=<node_modules/electron/dist>` to use the same pinned version from the dependency install. Do not disable
TLS verification.

CI also starts and quits each candidate in an isolated profile. Playwright needs the Node inspector, which the shipped
build disables through an Electron fuse, so run the test on a copy:

```powershell
Copy-Item -Recurse apps/desktop/dist/babacom-<build>/win-unpacked <copy>
pnpm -C apps/desktop exec electron-fuses write --app "<copy>/BabaCom Internal Test.exe" EnableNodeCliInspectArguments=on
$env:ELEMENT_DESKTOP_EXECUTABLE = "<copy>/BabaCom Internal Test.exe"
pnpm -C apps/desktop exec playwright test playwright/e2e/launch/babacom-candidate.spec.ts
```

Once the dedicated test service is restored, start each test account in a separate profile:

```powershell
Set-Location D:/Code/babacom/element-local/apps/desktop
& './dist/babacom-<build>/win-unpacked/BabaCom Internal Test.exe' `
    --profile-dir 'D:/Code/babacom/.matrix-runtime/g1/windows/client-a' --no-update
```

For the second account, use `client-b` in the same command.
Sign in with the short usernames `proof-a` and `proof-b` in the respective windows.
A full Matrix ID triggers server discovery. A short username uses the configured homeserver.
Keep personal Element profiles separate.

### Two-account acceptance

1. Open the same test room in both profiles and confirm that messages reach the other account in each direction.
2. Start and join an Element Call. Enable each microphone after its user approves, then confirm audio in both directions.
3. Share a synthetic window with system audio off. Stop sharing, repeat with audio explicitly enabled, and check the
   picture and audio from the receiving profile.
4. Stop sharing, leave the call and exit both clients. Record the results separately for chat, voice, sharing and exit.

# First Steps

Before you do anything else, fetch the dependencies:

```
pnpm install
```

# Fetching Element

Since this package is just the Electron wrapper for Element Web, it doesn't contain any of the Element Web code,
so the first step is to get a working copy of Element Web. There are a few ways of doing this:

```
# Fetch the prebuilt release Element package from the element-web GitHub releases page. The version
# fetched will be the same as the local element-desktop package.
# We're explicitly asking for no config, so the packaged Element will have no config.json.
pnpm run fetch --noverify --cfgdir ""
```

...or if you'd like to use GPG to verify the downloaded package:

```
# Fetch the Element public key from the element.io web server over a secure connection and import
# it into your local GPG keychain (you'll need GPG installed). You only need to to do this
# once.
pnpm run fetch --importkey
# Fetch the package and verify the signature
pnpm run fetch --cfgdir ""
```

...or either of the above, but fetching a specific version of Element:

```
# Fetch the prebuilt release Element package from the element-web GitHub releases page. The version
# fetched will be the same as the local element-desktop package.
pnpm run fetch --noverify --cfgdir "" v1.5.6
```

If you only want to run the app locally and don't need to build packages, you can
provide the `webapp` directory directly:

```
ln -s ../web/webapp ./
```

[TODO: add support for fetching develop builds, arbitrary URLs and arbitrary paths]

# Building

## Native Build

TODO: List native pre-requisites

Support for searching in encrypted rooms is provided by [prebuilt native modules](https://github.com/element-hq/element-web/blob/develop/docs/native-node-modules.md)
which are installed automatically by `pnpm install`.

Then, run

```
pnpm run build
```

This will do a couple of things:

- Run the `setversion` script to set the local package version to match whatever
  version of Element you installed above.
- Run electron-builder to build a package. The package built will match the operating system
  you're running the build process on.

## Docker

Alternatively, you can also build using docker, which will always produce the linux package:

```
# Run this once to make the docker image
pnpm run docker:setup

pnpm run docker:install
pnpm run docker:build
```

After running, the packages should be in `dist/`.

# Starting

If you'd just like to run the electron app locally for development:

```
pnpm start
```

# Config

If you'd like the packaged Element to have a configuration file, you can create a
config directory and place `config.json` in there, then specify this directory
with the `--cfgdir` option to `pnpm run fetch`, eg:

```
mkdir myconfig
cp /path/to/my/config.json myconfig/
pnpm run fetch --cfgdir myconfig
```

The config dir for the official Element app is in `element.io`. If you use this,
your app will auto-update itself using builds from element.io.

# Profiles

To run multiple instances of the desktop app for different accounts, you can
launch the executable with the `--profile` argument followed by a unique
identifier, e.g `element-desktop --profile Work` for it to run a separate profile and
not interfere with the default one.

Alternatively, a custom location for the profile data can be specified using the
`--profile-dir` flag followed by the desired path.

# User-specified config.json

- `%APPDATA%\$NAME\config.json` on Windows
- `$XDG_CONFIG_HOME/$NAME/config.json` or `~/.config/$NAME/config.json` on Linux
- `~/Library/Application Support/$NAME/config.json` on macOS

In the paths above, `$NAME` is typically `Element`, unless you use `--profile
$PROFILE` in which case it becomes `Element-$PROFILE`, or it is using one of
the above created by a pre-1.7 install, in which case it will be `Riot` or
`Riot-$PROFILE`.

You may also specify a different path entirely for the `config.json` file by
providing the `--config $YOUR_CONFIG_JSON_FILE` to the process, or via the
`ELEMENT_DESKTOP_CONFIG_JSON` environment variable.

# Translations

To add a new translation, head to the [translating doc](https://github.com/vector-im/element-web/blob/develop/docs/translating.md).

For a developer guide, see the [translating dev doc](https://github.com/vector-im/element-web/blob/develop/docs/translating-dev.md).

# Report bugs & give feedback

If you run into any bugs or have feedback you'd like to share, please let us know on GitHub.

To help avoid duplicate issues, please [view existing issues](https://github.com/vector-im/element-web/issues?q=is%3Aopen+is%3Aissue+sort%3Areactions-%2B1-desc) first (and add a +1) or [create a new issue](https://github.com/vector-im/element-web/issues/new/choose) if you can't find it. Please note that this issue tracker is associated with the [element-web](https://github.com/vector-im/element-web) repo, but is also applied to the code in this repo as well.

## Copyright & License

Copyright (c) 2016-2017 OpenMarket Ltd

Copyright (c) 2017 Vector Creations Ltd

Copyright (c) 2017-2025 New Vector Ltd

This software is multi licensed by New Vector Ltd (Element). It can be used either:

(1) for free under the terms of the GNU Affero General Public License (as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version); OR

(2) for free under the terms of the GNU General Public License (as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version); OR

(3) under the terms of a paid-for Element Commercial License agreement between you and Element (the terms of which may vary depending on what you and Element have agreed to).
Unless required by applicable law or agreed to in writing, software distributed under the Licenses is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the Licenses for the specific language governing permissions and limitations under the Licenses.
