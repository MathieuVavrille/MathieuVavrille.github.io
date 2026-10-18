# Vector Race

A standalone, turn-based grid racing game with a track editor. Choose a starting
point, change each velocity component by −1, 0 or +1, and reach the finish at rest.
Includes six tracks, an optimal-path solver and animated playback, editable road
blocks and Bézier paths, French/English text, and light/dark themes.

## GitHub Pages integration

The game is served at `/vector-race/`. After this contribution is merged and
GitHub Pages publishes it, the upstream URL is:

<https://mathieuvavrille.github.io/vector-race/>

The existing homepage links to it through the **Vector Race** navigation item.
The only change to an existing site file is that two-line entry in `_config.yml`.
All game files, documentation, license, and tests are contained in this directory.
The personal pages, layouts, styles, documents, and other applications are intact.

`index.html` deliberately has **no Jekyll front matter**: Jekyll copies the game
as static files, without adding the personal site's layouts or CSS. Stylesheets,
ES modules, the solver worker, the original track, and the source archive all use
relative URLs, so the same files work under a repository subpath. No root-level
build dependencies, configuration changes, custom domain, or backend are needed.
The `_tests/` directory is excluded from the published site by Jekyll's normal
underscore-directory rule.

## Run locally

From the repository root:

```sh
python3 -m http.server 8080
```

Open <http://localhost:8080/vector-race/>. Opening the HTML directly with `file://`
is unsupported because the game uses ES modules, fetch, and a module worker.
For the complete personal site, use its existing Jekyll setup instead:

```sh
bundle install
bundle exec jekyll serve
```

## Checks

Node.js 20 or later is only needed for development tests, with no npm dependencies:

```sh
npm --prefix vector-race test
```

The suite covers the movement and collision rules, optimal solutions, editor
gestures and history, track import/export, saved games, translations, themes,
the solver worker, and HTTP asset resolution under nested hosting paths.

## Data and source

Progress, records, settings, and custom tracks stay in this browser's localStorage
under the game-specific key `vector-race.v1`. Nothing is sent to a server.
Data saved on a different website is not automatically transferred; custom `.trk`
tracks can be exported and imported through the editor.

The browser files here are the unbundled source. The game's **Sources complètes
.ZIP** footer link also provides the full source archive, including the original
Python prototype and the local launcher. That archive is a source download, not
a runtime dependency.

## License

This browser adaptation retains the supplied Vector Race prototype's rules,
original track, and GNU GPL v3 license. See [LICENSE](LICENSE).
`GPL-3.0-only` applies to Vector Race in this directory; this addition does not
change the licensing of the personal website or its existing content.
