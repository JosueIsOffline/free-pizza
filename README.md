# NetAcad Solver

<img alt="My generous offer" width="300" src="assets/screenshots/my-offer.jpg"/>

## Manual Installation

### 1. Prepare the Project

```bash
# Navigate to the project folder
cd netacad-solver

# Install dependencies
npm install

# Build the extension in development mode
npm run start
The npm run start command will be "watching" for changes, so keep it running in the terminal.

2. Load the Extension in Your Browser
```

<details>
  <summary>For Chrome/Brave/Edge (Chromium users): (click)</summary>

1. Open your browser
2. Go to chrome://extensions/ (or brave://extensions/, edge://extensions/)
3. Enable "Developer mode" in the top right corner
4. Click "Load unpacked"
5. Select the dist folder inside your project

That's it! Extension is now ready to use 🎉

</details>

<details>
  <summary>For Firefox users: (click)</summary>

1. Open Firefox
2. Go to about:debugging#/runtime/this-firefox
3. Click "Load Temporary Add-on..."
4. Navigate to the dist folder and select the manifest.json file
5. That's it! Extension is now ready to use 🎉

</details>

## Usage

1. Open your course at [Netacad.com](https://netacad.com/)
2. Use one of following options:

- Click on quiz question and the right option(s) should be selected automatically
- Hover over the answers while holding the `Ctrl` button and the right option(s) should select automatically

![demo.gif](assets/videos/demo.gif)
![demo-hover.gif](assets/videos/demo-hover.gif)
