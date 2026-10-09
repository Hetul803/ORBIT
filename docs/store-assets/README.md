# Store asset manifest

Generated October 9, 2026 from the checked-in light-mode ORBIT web captures and the shipped ORBIT Ring icon. These files are sized for store setup but must be replaced with final native-device captures after the signed build is installed.

## Sets

- `screenshots/ios-dynamic-island-medium`: 1179×2556, five PNGs, no alpha.
- `screenshots/ios-dynamic-island-large`: 1290×2796, five PNGs, no alpha.
- `screenshots/android-phone`: 1080×1920, five PNGs, no alpha.
- `icons/app-store-1024.png`: 1024×1024.
- `icons/play-store-512.png`: 512×512.
- `play-feature-1024x500.png`: 1024×500, no alpha.

The screenshot order is sign-in, onboarding, Today, watcher result, and honest offline error. No fake Catch item or introduction was added.

## SHA-256

```text
d47c70e351a630f70fde508a7686f33111adb68c2a51ccc7c99ffc10eb8fc988  icons/app-store-1024.png
16ffb8b797afe0f2bde21a814dfc0a4cef0035f0e6b3014d4c2e80523bdb435b  icons/play-store-512.png
ddb8b63fe5d96dbfa0e336a0f759c76735c7ab35cf7df357a2216992377c259e  play-feature-1024x500.png
```

Before submission, capture the five screens again on the final TestFlight build and Android preview build, confirm light mode, remove private data, export to these same target sizes, and update this manifest.
