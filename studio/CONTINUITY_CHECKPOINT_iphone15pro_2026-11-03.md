# Skygate Studio: iPhone 15 Pro viewport correction

Date: 2026-11-03, Asia/Jakarta
Base: main 7f894372b98b2b218c342eee6952b8633e2eaa1d (includes audio audition and splash PLAY music).

## User report
Studio screenshot still showed Portrait 9:16 and a phone preview too short/wide compared with iPhone 15 Pro.

## Correct dimensions
Apple lists a 1179 x 2556 physical display. The logical full-screen display is 393 x 852 at 3x, equivalent to 131:284 (approximately 9:19.5 in portrait). The 1080 x 1920 artboard is a design coordinate system, NOT the phone display ratio.

Sources:
- https://support.apple.com/id-id/111829
- https://github.com/microsoft/playwright/blob/main/packages/isomorphic/deviceDescriptorsSource.json

## Implementation
- Studio Live, editable Draft and Publish review use a fixed 393 x 852 internal iframe viewport.
- Scale the entire screen uniformly to the available desktop/mobile editor space. Resizing the Studio does not reload the draft or change the project.
- Bezel dimensions are derived from the screen rather than an inherited 9:16 frame.
- Header names the iPhone 15 Pro PWA full-screen profile. The existing 1080 x 1920 source coordinates are retained and identified separately.
- Fix selection handles: child iframe rectangles are local coordinates and must not have the outer page's stage position subtracted. Handles and iframe now share the same scaled coordinate system.
- Preserve circular control positioning while dragging a SPIN/AUTO/NORMAL layer.
- Remove the legacy attached notch decoration instead of pretending to emulate iOS hardware.

## Scope and limitations
Only Studio presentation code changes. No gameplay renderer, RNG, math, audio files, audio controls, server, saved project, published releases or heartbeat behavior changes. This is full-screen geometry simulation, not native Safari/OS emulation: toolbar, Dynamic Island occlusion and safe-area env values depend on the actual device and OS. Native iPhone QA remains distinct.

## QA gate
Syntax validation; full existing Node and Chromium game/Studio tests; existing Chromium/WebKit splash audio tests; new Chromium/WebKit device viewport test checks logical 393x852, physical ratio, responsive scaling, selection alignment, Publish review, no horizontal overflow and unchanged project JSON.

Merge only when CI passes; verify Railway terminal SUCCESS for the merged commit before reporting live. Do not republish any stored project.

Game: https://skygate-web-production.up.railway.app/play/
Studio: https://skygate-web-production.up.railway.app/studio/
