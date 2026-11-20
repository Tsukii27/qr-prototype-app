# QR Attendance Prototype

Mobile prototype used to measure the execution time, number of operations, and memory
usage of five algorithms (indexed search, insertion, existence check, summation, merge
sort) on datasets of 50, 100, and 200 students.

## Requirements
- Node.js [v26.13.0] (check with `node --version`)
- Expo Go [58.0.5] on your phone, connected to the same Wi-Fi as your computer

## Run
```
npm ci
npx expo start
```
Scan the QR code shown in the terminal with Expo Go.

For final measurements, use production mode:
```
npm run start:prod
```

## Using the app
- **Benchmark tab:** select dataset sizes, tap "Run benchmark", then "Share results as CSV".
- **Simulator tab:** load a class and scan QR events to see the system working.

## Tested with
Expo SDK [58.0.26], React Native [0.88.1], Hermes engine, [Vivo Y20i].