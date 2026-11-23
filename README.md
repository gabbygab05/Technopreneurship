# eLingkod — beginner setup and project guide

This is the working eLingkod student prototype in this folder. The screens, local sample data, mock service, and setup are already in place. The project uses Expo SDK 58 to match the Expo Go version on your phone.

## 1. What is included

- **React Native + Expo + JavaScript:** runs on Android with Expo Go and in a desktop or mobile browser.
- **`react-native-maps`:** pannable and zoomable map with colored rider pins. It is included in Expo Go for SDK 58; a Google Maps API key is not needed for Expo Go. A standalone Android app or store build requires a Google Maps Android API key and a rebuild.
- **Browser map:** the web build uses an interactive schematic map with selectable rider pins; the native map package is loaded only on native platforms.
- **Expo Location:** asks for foreground location permission and centers the map on the device. If permission is declined or location fails, it uses the Cagayan de Oro demonstration location.
- **AsyncStorage:** remembers that the guide has been seen so it appears on the first launch. The Profile screen can reopen it.
- **Local JavaScript data and a mock service:** 15 invented riders and asynchronous `getNearbyRiders`, `getRidersByPlatform`, `getRiderById`, and `getEstimatedFare` functions.
- **Local screen state:** keeps navigation simple for a beginner MVP; no server or login is required.

## 2. Screens and flow

First launch → Welcome / User Guide → Home map → Rider Details → return to Home.

The Home bottom navigation opens Home, Commuter PRO, or Profile. Profile can reopen the guide. PRO shows simulated premium examples and a demo-only upgrade message. The app does not make bookings, charge a subscription, or generate a referral commission.

## 3. Files and folders

```text
elingkod/
├── App.js                     # Screen UI, navigation state, map, and location behavior
├── components/
│   ├── RiderMap.native.js     # Interactive native map
│   └── RiderMap.web.js        # Browser-compatible schematic map
├── assets/
│   └── logos/                 # Replace the starter PNGs with platform logos
├── app.json                   # App identity and location permission prompt
├── package.json               # Expo and library dependencies
├── data/
│   └── riders.js              # 15 simulated riders
├── services/
│   └── riderService.js        # Small asynchronous mock API
└── utils/
    └── colors.js              # UI and platform marker colors
```

### Replace the map marker images

Replace these transparent starter images with your logo PNG files (keep the same filenames):

- `assets/logos/angkas.png`
- `assets/logos/move-it.png`
- `assets/logos/joyride.png`

Square images with transparent backgrounds work best. The map displays each logo inside a circular marker.

## 4. Software to install

1. Install **Node.js LTS** (Expo SDK 58 needs Node.js 22.13 or newer) from [nodejs.org](https://nodejs.org/).
2. Install **Visual Studio Code** from [code.visualstudio.com](https://code.visualstudio.com/).
3. On the Android phone, install **Expo Go** from Google Play. The phone and computer should normally use the same Wi-Fi network.

No Android Studio is needed for the Expo Go workflow. An Android emulator is optional.

## 5. Install dependencies and start the project

Open this project folder in VS Code. In VS Code choose **Terminal → New Terminal**, then run:

```sh
npm install
npx expo install --fix
npx expo install react-native-maps expo-location @react-native-async-storage/async-storage
npx expo start
```

To run it in your browser instead, start Expo's web development server:

```sh
npm run web
```

Expo will print a local address (usually `http://localhost:8081`) and open the app in your default browser. To create a static web export for hosting, run `npm run web:build`; the output is written to `dist/`.

### Publish a shareable public URL

The project is configured for Netlify. For a quick public link:

1. Run `npm run web:build`.
2. Open [Netlify Drop](https://app.netlify.com/drop).
3. Drag the generated `dist/` folder into the deploy area. Netlify publishes it and gives you a public URL to share.

To publish updates, rebuild with `npm run web:build` and upload the new `dist/` folder to the existing site's deploy area. If you later connect a Git repository to Netlify, `netlify.toml` configures it to build and publish automatically. The app itself does not need a server; rider data is demo data stored in the browser bundle.

The first command installs the dependencies declared in `package.json`. `expo install --fix` aligns them with this project's Expo SDK; the next command ensures the three Expo Go libraries have SDK-compatible versions. Leave the Expo terminal running.

To connect an Android phone:

1. Connect the phone and computer to the same Wi-Fi network.
2. Open Expo Go on the phone and tap **Scan QR code**.
3. Scan the QR code shown in the VS Code terminal or Expo Dev Tools.
4. This project targets SDK 58 to match your Expo Go. If Expo Go reports a mismatch, confirm the selected SDK on Expo's [Android compatible Expo Go download page](https://expo.dev/go), then restart with `npx expo start`.

If the Wi-Fi network blocks local devices, stop the server with **Ctrl+C**, then start a tunnel with:

```sh
npx expo start --tunnel
```

## 6. Staged development and what to check

The requested stages have been implemented in the workspace. Use these checks as you explore them:

### Stage 1 — project setup

Run the install commands above, then `npx expo start` and open the QR code in Expo Go. Confirm the app opens without an SDK compatibility message.

### Stage 2 — UI and screen flow

On a fresh app install, check the Welcome guide and press **GOT IT!**. Confirm the Home screen opens. Use the bottom tabs to open Commuter PRO and Profile. From Profile, open the guide again.

### Stage 3 — simulated rider data

On Home, confirm the platform totals come from the 15 locally defined riders (5 Angkas, 5 Move It, 5 JoyRide). Check the fare snapshot and confirm the disclaimer labels all rider data simulated.

### Stage 4 — map

Pan and zoom the map. Check that Angkas markers are red, Move It blue, JoyRide yellow, and the device/demo location green. Tap a rider marker and check the platform and rider ID.

### Stage 5 — application interactions

Select each platform filter and confirm only that platform's pins remain. Open a rider and compare its distance, ETA, and fare. Try **OPEN PLATFORM WEBSITE** and confirm the warning appears before a platform information site opens. Try PRO's upgrade button and check the no-payment message. Toggle Profile notifications and open the privacy/about items.

### Stage 6 — student MVP usability period

Use the app on Android before inviting participants. For a seven-day class MVP with 30–50 university students, ask participants to locate riders, identify platforms, compare fares, select a rider, and explain Commuter PRO. Collect only the feedback your project needs, and tell participants the map, profile, fares, and ETAs are demonstration data. Do not ask them to treat this as a real transport service.

## 7. Technical limitations

- Rider positions, fare estimates, arrival times, and availability are fictional and are not fetched from Angkas, Move It, or JoyRide.
- The platform buttons open public platform websites for information after a clear warning. They do not deep-link to a booking flow or create a booking.
- The location permission is optional; the demo remains usable with the Cagayan de Oro fallback. Browser location requires a secure context (localhost or HTTPS) and user permission. The browser map is schematic and does not use map tiles.
- Expo Go includes `react-native-maps` without an API key. If you later make a standalone Android binary, create a Google Cloud project, enable Maps SDK for Android, restrict an API key to your Android package/signing certificate, configure the `react-native-maps` Expo config plugin in `app.json`, and rebuild. Do not publish a real key in a public repository.
- This is a seven-day academic prototype, not an operational ride-hailing service. Authentication, a backend, real notifications, payments, subscriptions, and API partnerships are outside this MVP.

## 8. Common troubleshooting

- **`npm` or `node` is not recognized:** install/reinstall Node.js LTS, restart VS Code, then check `node --version` and `npm --version`.
- **Expo Go says the project is incompatible:** confirm your phone has the SDK 58 Expo Go build from [expo.dev/go](https://expo.dev/go), then restart with `npx expo start`.
- **The QR code does not connect:** make sure both devices are on the same Wi-Fi. If the network blocks device discovery, use `npx expo start --tunnel`.
- **A package version warning appears:** run `npx expo install --fix`, then stop and restart the server with `npx expo start`.
- **The map is blank:** check internet access and allow the map time to load. Expo Go uses the included native map provider; a standalone app needs the Google Maps setup described above.
- **Location permission was denied:** tap **Refresh** and allow location, or keep using the fallback Cagayan de Oro map location.
- **The app shows an old screen after edits:** press `r` in the Expo terminal to reload. If Metro reports a cache problem, stop it and run `npx expo start --clear`.

## 9. Suggested project creation command (for a separate fresh copy)

This workspace already contains the project files, so do not run this command inside the current project. To create a second Expo SDK 58 blank app elsewhere, run:

```sh
npx create-expo-app@latest elingkod --template blank@sdk-58
cd elingkod
npx expo install react-native-maps expo-location @react-native-async-storage/async-storage
```

Then copy this workspace's `App.js`, `app.json`, `data/`, `services/`, and `utils/` into the new project, replacing its starter `App.js` and `app.json`.
