# Handoff: YouTube video download feature

Paste this whole file into a fresh Claude Code session on the other device
(after `git pull origin main`) to pick up full context instantly.

## What this project is

A local Node.js static-file app (`server.js`, port 3010) that lets you paste a
YouTube URL, preview it via the IFrame API, copy an `<iframe>` embed snippet,
and control playback with keyboard shortcuts. No build step, no framework —
plain HTML/CSS/JS served by a hand-rolled HTTP server.

## What was requested

Add a "download the actual video file" option to the app (previously it only
embedded/previewed videos, never downloaded them).

## What was built (already committed + pushed to origin/main, commit `14aa76d`)

- **`server.js`** — new `GET /api/download?url=...` route:
  - Validates the URL is actually a youtube.com/youtu.be host.
  - Spawns `python -m yt_dlp` (yt-dlp installed as a pip package, invoked as a
    module — no yt-dlp.exe binary needed) with
    `-f "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/best" --merge-output-format mp4`,
    writing into a per-request temp dir (`fs.mkdtempSync`).
  - `--no-check-certificate` is passed because the original dev machine has an
    SSL-inspecting network filter (see below) — harmless to keep on a clean
    network too.
  - On success, streams the resulting file back as the HTTP response with a
    proper RFC 5987 `Content-Disposition` (handles unicode titles), then
    deletes the temp dir once the response finishes.
  - On failure, returns the tail of yt-dlp's stderr as the response body so
    errors are visible to the caller.
- **`js/download.js`** — `downloadVideo()`: calls `/api/download`, reads the
  filename back out of `Content-Disposition`, and triggers a normal browser
  file-download from the response blob.
- **Download Video button** added to `youtube-embed.html`, styled in
  `style.css` (green, to read distinctly from the red primary buttons).
- **README.md** updated: new requirements section (Python + `pip install
  yt-dlp`, `ffmpeg` on PATH), a "Download Video" feature section, updated
  file-reference table and script load order.

## Requirements to check on the new device before testing

- Node.js (any recent version) — already required for the rest of the app.
- Python with `yt-dlp` installed: `pip install yt-dlp`. (On the original
  machine this was already present via pip, no separate binary download
  needed — invoked as `python -m yt_dlp`.)
- `ffmpeg` on `PATH` (needed to merge separate video+audio streams into one
  mp4). On the original machine this came from a winget install
  (`Gyan.FFmpeg`).

## Verification status — **this is the important part**

The route's plumbing was verified end-to-end on the original machine:
- Static file serving still works (200 on `/`).
- The download route correctly spawns yt-dlp, captures its exit code and
  stderr, and returns a clean error response when yt-dlp fails.

**What was NOT verified: an actual successful video download producing a
playable file.** The original dev machine has a network-level content filter
(see below) that blocks all yt-dlp/curl/python requests to YouTube, so a real
end-to-end download (button click → real mp4 saved and playable) could not be
tested there. **This is the first thing to test on the new device**: paste a
real YouTube URL, click Download Video, confirm a valid, playable `.mp4`
actually lands in the browser's downloads folder.

## Important context: do not build a filter bypass

The original dev machine runs **Techloq**, a network-level content filter,
which was found to actively intercept and block all non-browser HTTPS
requests to `youtube.com` (confirmed via a raw curl test returning a `302`
redirect to `filter.techloq.com` with a block-page payload) — not merely an
SSL cert trust issue.

The user confirmed this filter is administered by **someone else** (not
managed by them). I (Claude) declined to help engineer a technical workaround
to route around it, since defeating someone else's intentionally configured
restriction isn't something to help with regardless of how the request is
framed (e.g. "a different approach that avoids the issue" doesn't change
this — the block targets the destination/content, not a specific tool's
fingerprint, so any successful download from that network would equally be a
bypass). **If you're picking this back up on a machine that also has this
filter (or a similar one), don't try to find a clever workaround — that
boundary should hold.** The new device mentioned in this handoff is a
*different* device without this filter, which is why testing is expected to
work there.

A draft message asking the filter's administrator to allow
`youtube.com` / `youtu.be` / `*.googlevideo.com` was written for the user to
send through proper channels; it's not part of the app itself.

## Suggested next step

1. `git pull origin main` on the new device.
2. Confirm `python -m yt_dlp --version` and `ffmpeg -version` both work.
3. `node server.js`, open `http://localhost:3010`.
4. Paste a real YouTube URL, click **Download Video**, confirm a real
   playable mp4 downloads. Report back if the format selection
   (`bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/best`) needs adjusting for quality/
   compatibility, or if yt-dlp needs a newer version / a JS runtime flag
   (`--js-runtimes node`) — an earlier warning on the old machine mentioned
   YouTube's extractor wanting a JS runtime for some formats.
