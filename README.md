# FreeView

A fast, good-looking visual speed dial for your browser's new tab page. Every feature is free: there are no paid tiers, accounts, ads or tracking.

![FreeView icon](icons/icon128.png)

## Features

**Speed dial**
- Visual dials with automatic page screenshots, site logos, your own images (upload or URL) or plain text tiles with custom colors
- Unlimited dials and groups; switch groups with tabs, arrow keys, or by remembering the last group you used
- Drag and drop to reorder dials, move them between groups, reorder groups, or add links dragged in from other pages
- Right-click menus: open in a new tab, background tab, new window or incognito window; edit, duplicate, copy the link, refresh the thumbnail, move to another group
- Undo for deleted dials
- "Open all" and "Refresh all thumbnails" for a group

**Adding pages**
- Toolbar popup that adds the current page with a fresh screenshot
- Right-click any page or link and choose "Add to FreeView", with a submenu for each group
- Keyboard shortcut `Alt+Shift+A` adds the current page from any tab
- Import a bookmark folder as a group, or add your most visited sites in one click

**Look and feel**
- One-click themes, plus dark, light or system color mode and any accent color
- Backgrounds: solid color, 16 gradient presets or your own CSS gradient, an uploaded image, an image URL, or a new photo every day; adjustable blur and darkening
- Layout controls: columns, dial size and shape, spacing, corner radius, opacity, shadows, hover effect, title position, page width and vertical centering
- Three dial styles: screenshots, logos or a compact list
- System fonts or any Google Font, adjustable title size and text color
- Custom CSS for complete control

**Sidebar**
- Bookmarks (tree view with search), most visited sites, recently closed tabs and windows, history, open tabs and browser pages
- Drag any item onto the grid to make it a dial
- Opens with a button, the `B` key, or by touching the screen edge

**Search and clock**
- Search box using your browser's default engine or Google, Bing, DuckDuckGo, Brave, Ecosia, Startpage, Yahoo or a custom URL; typing an address opens it directly
- Clock in 12 or 24-hour format, with the date

**Analytics**
- Visit counts per dial, last visit and a daily activity chart over 7, 30 or 90 days, or all time
- Summary of total visits, most visited dial and unused dials

**Privacy, sync and backup**
- Password lock for the new tab page and settings, with an optional timeout
- Sync dials, groups and settings across computers through your browser's own sync
- Export everything, including screenshots and images, to a JSON file; import by replacing or merging
- Automatic daily backups with one-click restore

**Keyboard shortcuts**

| Key | Action |
| --- | --- |
| `1`–`9`, `0` | Open dial 1–10 (`Shift` opens it in a background tab) |
| `←` `→` | Previous / next group |
| `/` | Focus search |
| `N` / `G` | Add a dial / add a group |
| `B` | Toggle the sidebar |
| `L` | Lock now |

## Install

FreeView is a Manifest V3 extension with no build step.

1. Download or clone this repository.
2. Open `chrome://extensions` (or `edge://extensions`, `brave://extensions`).
3. Turn on **Developer mode**.
4. Click **Load unpacked** and select the repository folder.
5. Open a new tab.

## Privacy

See the full [privacy policy](PRIVACY.md). All data is stored locally in your browser. Nothing is sent anywhere, except:
- when sync is on, your dials and settings go through your browser's built-in sync storage;
- the "Photo of the day" background loads images from picsum.photos;
- a Google Font, if you choose one, loads from fonts.googleapis.com.

### Why each permission is needed

| Permission | Used for |
| --- | --- |
| `<all_urls>`, `tabs` | Taking screenshots of pages you've saved as dials, and counting visits |
| `storage`, `unlimitedStorage` | Storing dials, screenshots and settings |
| `bookmarks`, `topSites`, `sessions`, `history` | The sidebar and the import tools |
| `contextMenus` | "Add to FreeView" on right-click |
| `favicon` | Site logos |
| `alarms` | Daily automatic backups |
| `search` | Searching with your browser's default search engine |

## Project layout

```
manifest.json      Extension manifest
background.js      Service worker: context menus, screenshots, visit tracking, sync, backups
newtab.html        New tab page
options.html       Settings page
popup.html         Toolbar popup
js/storage.js      Shared data layer (dials, settings, thumbnails, sync, backups, lock)
js/presets.js      Fonts, gradients and themes
js/newtab.js       New tab page logic
js/options.js      Settings page logic
js/popup.js        Popup logic
css/               Stylesheets
icons/             Extension icons
```

## License

[MIT](LICENSE)
