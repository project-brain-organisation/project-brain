# ⚡ Project Brain

AI-powered project notes manager. Talk naturally — it files everything automatically.

## Setup

1. Make sure you have **Node.js** installed (https://nodejs.org)
2. Open a terminal in this folder
3. Run:

```
npm install
node server.js
```

4. Open your browser at **http://localhost:3747**

That's it. Leave the terminal running while you use the app.

---

## How it works

- **New Project** — click the button in the sidebar, give it a name and emoji
- **Chat box** — type anything naturally:
  - *"make a section called White Space"* → creates the section
  - *"the robot miniboss should have three attack phases"* → AI files it under Bosses (or creates that section)
  - *"export this"* → downloads a JSON backup
  - *"open folder"* → opens your files in Finder/Explorer
- **Files tab** — browse and preview all the real files saved on disk
- **📂 Open Folder** button — jumps straight to the project folder in your file manager

---

## File structure

```
data/
  your-project-name/
    _meta.json          ← project info
    bosses.json         ← section data (structured)
    bosses.md           ← section notes (readable)
    white_space.json
    white_space.md
    ...
```

Every section gets two files: a `.json` for the app and a `.md` you can read in any text editor or Obsidian.

---

## Commands in the chat

| Say... | What happens |
|--------|-------------|
| "make a section called X" | Creates section X |
| "create a tag for X" | Creates section X |
| "export this" | Downloads project as JSON |
| "open folder" | Opens project folder |
| Anything else | AI files it as a note in the right section |
"# Project-Brain" 
