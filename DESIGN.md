---
name: The Musical Mosaic
description: Your webcam rebuilt live out of album covers, styled as a sibling of The Musical Compass.
colors:
  ink: "#000000"
  ink-soft: "#4D4D4D"
  muted: "#6B6B6B"
  paper: "#FFFFFF"
  sidebar-grey: "#F2F2F2"
  sidebar-rule: "#CFCFCF"
  field-rule: "#9A9A9A"
  danger: "#C40000"
  accent-default: "#42AAFF"
typography:
  countdown:
    fontFamily: "Arimo, Arial, Helvetica, sans-serif"
    fontSize: "clamp(72px, 12vw, 160px)"
    fontWeight: 700
    lineHeight: 1.1
    fontFeature: "\"tnum\""
  headline:
    fontFamily: "Arimo, Arial, Helvetica, sans-serif"
    fontSize: "22px"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  brand-small:
    fontFamily: "Arimo, Arial, Helvetica, sans-serif"
    fontSize: "20px"
    fontWeight: 700
  title:
    fontFamily: "Arimo, Arial, Helvetica, sans-serif"
    fontSize: "18px"
    fontWeight: 700
  section:
    fontFamily: "Arimo, Arial, Helvetica, sans-serif"
    fontSize: "15px"
    fontWeight: 700
  body:
    fontFamily: "Arimo, Arial, Helvetica, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.45
    fontFeature: "\"tnum\""
  body-small:
    fontFamily: "Arimo, Arial, Helvetica, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "Arimo, Arial, Helvetica, sans-serif"
    fontSize: "12.5px"
    fontWeight: 700
rounded:
  none: "0px"
spacing:
  side-y: "22px"
  side-x: "26px"
  stage-x: "40px"
  sidebar-width: "360px"
components:
  button-primary:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.section}"
    rounded: "{rounded.none}"
    padding: "8px 14px"
    width: "100%"
  button-primary-hover:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
  button-secondary:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.body-small}"
    rounded: "{rounded.none}"
    padding: "7px 12px"
  sidebar-panel:
    backgroundColor: "{colors.sidebar-grey}"
    textColor: "{colors.ink}"
    padding: "22px 26px"
---

# Design System: The Musical Mosaic

## Overview

A sibling of The Musical Compass (`../compass`, mymusicalcompass.com) and built on its system: white paper, black ink, one Arial-lineage face, square chrome with black borders, and a grey sidebar of numbered steps beside a centered stage. The Compass gets its color from four quadrant fills; the Mosaic gets all of its color from content: the album covers in the mosaic, the cover wall on the welcome screen, and a live accent taken from the album you are mostly made of.

The owner rejected two themed looks (a blue-and-yellow photobooth and a "station tile" mosaic wall) as tacky, then found a neutral dark version emotionless. This direction, matching their other site, is the one they chose.

## Colors

The Compass neutrals exactly: ink #000, ink-soft #4D4D4D for secondary text, muted #6B6B6B for hints and disabled text, paper #FFF, sidebar grey #F2F2F2 with #CFCFCF rules, field rule #9A9A9A for disabled borders, danger #C40000 for camera errors.

**The live accent.** `--accent` defaults to the Compass's quadrant blue (#42AAFF). Once the camera runs, app.js `setAccent` takes the most-used album in the frame with LAB chroma of at least 12, clamps its lightness to 62-80, multiplies a/b by 1.6 and converts to RGB, so black text still reads on it. It is used where the Compass uses a quadrant color: text selection, the active album-crate underline (a 4px inset bar) and the Spotify import progress bar.

## Typography

Arimo everywhere, self-hosted from the Compass's font files in four subsets (`web/assets/fonts/`), including the downloadable photo strip. Weight does the hierarchy: brand 22px/700 (20px under 420px), notice title 22px/700, hovered-album title 18px/700, section headings 15px/700 ("1. Camera"), body 15px, small text 14px, labels 12.5px/700. The countdown is clamp(72-160px)/700. Tabular numerals throughout.

## Layout

The Compass shell: a CSS grid with a fixed 360px sidebar on the left (masthead, 1. Camera, 2. Albums, 3. Photo strip, You're made of, footer, separated by 1px rules) and a sticky stage on the right. The stage is a single centered grid column sized by the mosaic, which keeps its aspect ratio (max height 100vh - 175px) inside a 2px black frame. The readout below is exactly the mosaic's width (`width: 0; min-width: 100%`). Hide controls removes the sidebar and the stage takes the page. Under 900px everything stacks: masthead, stage, Camera, Photo strip, Albums, You're made of, footer.

## Elevation & Depth

Flat. Depth is drawn with black borders, never shadows: 2px around the mosaic, the welcome notice, the countdown and the paused badge; 1px around the camera preview, strip thumbnail and cover thumbnails.

## Shapes

Square. Every element has 0 radius.

## Components

- **Brand mark:** the Compass mark's 2x2 grid in a 2px black frame, filled live with the four albums you are most made of (the first four albums before the camera starts). It also appears on the photo strip.
- **Buttons:** primary is white with a 2px black border, bold 15px, full width in the sidebar, inverting to black on hover and pressing down 1px. Secondary uses a 1px border, regular 14px. Disabled buttons get a grey border and muted text.
- **Welcome:** the album atlas tiled at 24px per cover, drifting over 160s, with a white notice box in a 2px black border: "Who are you made of?", one line of copy and Turn on camera.
- **Readout:** under the mosaic, like the Compass result: the hovered album's 56px cover in a 2px border, its title in 18px bold and the artist in soft ink. With nothing hovered it shows a muted hint. Save still and Hide controls sit on the right.
- **Album crates:** white boxes with a 1.5px grey border; the active one gets a black border and an accent underline.
- **You're made of:** rows like the Compass song list: a 28px cover in a 1px black border, bold title, soft-ink artist and share percentage. Hover turns the row white with a 1px black border.
- **Photo strip:** white paper, four frames in 2px black borders, then the brand mark, "The Musical Mosaic" in Arimo bold, the date and the top three albums.
- **Motion:** only the photobooth moment (a 450ms flash and a 1.6s strip print) and the 0.12s button inversion; everything collapses under reduced motion.

## Do's and Don'ts

- Do keep it visually consistent with The Musical Compass; when in doubt, copy its rule.
- Do let color come from the albums only.
- Don't round anything or add shadows.
- Don't add a second typeface or a fixed brand hue.
- Don't bring back the blue-and-yellow, tile-wall or dark neutral looks.
