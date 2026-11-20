# Contributing to Glowtide

Thanks for helping. Bug reports, ideas and pull requests are all welcome.

## Reporting a bug or asking for a feature

Open an [issue](https://github.com/cynicalk/glowtide/issues/new/choose) and pick **Bug report**
or **Feature idea**. For a bug, the most useful things are:

- your Glowtide version (Settings → App → Updates) and Windows version;
- the music source (Any app, Spotify, YouTube Music or Demo) and the app you play in;
- what you did, what you expected and what happened;
- anything in `%APPDATA%\Glowtide\glowtide.log` from around that time.

Please don't paste song lyrics into issues; describe the song by title and artist instead.

## Working on the code

You need Windows 10 or 11 and Node.js 22.

```powershell
npm install
npm run dev          # the app with hot reload
npm run lint
npm test
```

`README.md` → **Develop** lists the `GLOWTIDE_*` switches for test runs. Use
`$env:GLOWTIDE_PROFILE` so a test run never touches your own settings.

Before you open a pull request:

- `npm run lint` and `npm test` pass (GitHub runs both, plus a build, on every pull request);
- new logic that can be pure goes in `src/shared` with tests beside the others in `test/`;
- user-facing text is plain and short, in British English, and says what happens rather than
  how it works;
- nothing is added that sends data anywhere new without the user choosing it.

## Licence

By contributing you agree that your work is released under the [MIT licence](LICENSE).
Don't add code, images, music or lyrics you don't have the right to share.
