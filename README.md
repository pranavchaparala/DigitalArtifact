# PRANAV.EXE — Head Sticker Experience

## Run locally

```bash
python3 serve.py
```
Then open http://localhost:8080 in your browser.

## Or just open index.html
Double-click index.html — works in Chrome/Edge (Firefox may block local files).
Note: FBX loading requires the Python server due to CORS.

## How to use
- **Drag** any sticker from the left panel
- **Drop** it on the 3D head
- **Orbit** the head by clicking and dragging the canvas
- **Scroll** to zoom in/out
- **Hover** placed stickers to see their label

## Add your own stickers
Replace files in /stickers/ folder and update js/stickers.js with your base64 PNGs.

## Structure
```
pranav-exe/
├── index.html          ← Main page
├── serve.py            ← Local server
├── models/
│   └── head_planes.fbx ← Your 3D model
├── stickers/
│   └── *.png           ← Sticker images
└── js/
    ├── stickers.js     ← Embedded sticker data
    └── app.js          ← Three.js scene + drag logic
```
