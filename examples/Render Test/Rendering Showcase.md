---
title: Rendering Showcase
description: A showcase of rich text rendering capabilities, tabs, callouts, and mathematical notation.
tags:
  - example
  - rendering
  - markdown
  - katex
createdat: 1794105987573
lastupdatedat: 1794105987573
---

# Rendering Showcase

> [!Summary] Rich Markdown Syntaxes
> This note demonstrates the rich Markdown rendering capabilities of InsightPage, including callouts, math notation, interactive tables, and embedded media.

---

## 1. Standard Markdown & Highlights

InsightPage supports standard CommonMark and GitHub Flavored Markdown with extended styling:

* Text formatting: **bold**, *italic*, ***bold italic***, ~~strikethrough~~, ^superscript^, ~subscript~, and ==highlighted text==.
* Nested formatting: ==***bold highlighted text***== and ==_underlined highlight_==.

> "The important thing is not to stop questioning. Curiosity has its own reason for existence."
>
> — Albert Einstein::cmt[Renowned theoretical physicist best known for developing the theory of relativity.]

---

## 2. Interactive & Editable Tables

| Feature           | Supported | Notes                                           |
| ----------------- | :-------: | ----------------------------------------------- |
| Editable Tables   |    ✅     | Direct in-table editing with column sorting.     |
| Charts & Plots    |    ✅     | Declarative Chart.js and Observable Plot syntax.|
| Mermaid Diagrams  |    ✅     | Flowcharts, sequence diagrams, state machines.   |
| LaTeX Math        |    ✅     | Full KaTeX support for inline & display math.   |
| Syntax Highlight  |    ✅     | Prism-powered highlighting for 50+ languages.   |
| Native Tabs       |    ✅     | Tabbed view containers inside any note.         |
| Interactive Maps  |    ✅     | Leaflet.js maps with markers, lines, & polygons.|
| Music Scores      |    ✅     | ABC sheet music notation with audio playback.   |

---

## 3. Interactive Callout Popovers & Comments

Use inline comment syntax for contextual annotations and footnotes:

::cmt[💡 Clickable comment popover containing extra context without cluttering the main text.]

```markdown
::cmt[💡 Clickable comment popover containing extra context without cluttering the main text.]
```

---

## 4. Tabbed Note Layouts

Organize multifaceted documentation or comparisons into neat tabs using ```tabs```:

```tabs
--- Maxwell Equations
$$\begin{aligned}
\nabla \cdot \mathbf{E} &= \frac{\rho}{\varepsilon_0} \\
\nabla \cdot \mathbf{B} &= 0 \\
\nabla \times \mathbf{E} &= -\frac{\partial \mathbf{B}}{\partial t} \\
\nabla \times \mathbf{B} &= \mu_0 \mathbf{J} + \mu_0 \varepsilon_0 \frac{\partial \mathbf{E}}{\partial t}
\end{aligned}$$

--- Subscript & Chemical Formulas
* Water: H~2~O
* Glucose: C~6~H~12~O~6~
* Einstein relation: E = mc^2^

--- Highlight & Parsing
Standard Highlight: ==Highlighted text== parses directly into semantic HTML `<mark>` elements, supporting nested AST styles like ==***bold italic highlight***==.
```

---

## 5. ABC Sheet Music Rendering

Render interactive sheet music with `abc` code blocks:

```abc
X: 1
T: Ode to Joy
M: 4/4
L: 1/4
K: C
E E F G | G F E D | C C D E | E3/2 D/ D2 |
```

---

## 6. Visual Component References

InsightPage separates specialized visualization formats into dedicated showcase notes for easy reference and AI code-generation:

* 👉 **[[Example Mermaid]]**: Flowcharts, state diagrams, Gantt charts, and sequence diagrams.
* 👉 **[[Example Chart]]**: Bar, line, pie, donut, sankey, radar, and scatter charts via Chart DSL & Observable Plot.
* 👉 **[[Example Map]]**: Interactive Leaflet maps with pins, routes, and geographic shapes.
* 👉 **[[Example Timeline]]**: Interactive zoomable timelines with YAML event schemas and table data sourcing.
* 👉 **[[Skills for AI]]**: Comprehensive Markdown syntax rules, DSL options, and prompt engineering specifications for AI.
