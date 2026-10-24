---
source: ""
description: Interactive timeline chart examples illustrating loose JSON and unquoted YAML syntax support in InsightPage.
title: Example Timeline
tags:
  - example
  - timeline
  - chart
  - visualization
createdat: 1792585223774
lastupdatedat: 1792732844976
pinned: false
fileextension: .md
fileExtension: .md
---

InsightPage supports interactive zoomable timelines rendered using ```timeline```, ```timeline-chart```, or ```event-timeline``` code blocks.

---

## 1. Interactive Timeline Example (YAML Syntax)

Standard YAML supports unquoted keys and strings:

```timeline
- start: 2013-10-01
  end: 2016-09-30
  institution: Technical University Dresden
  title: BSc. Student in Computer Science
  type: education
  collection: []

- start: 2016-10-01
  end: 2019-01-31
  institution: Technical University Dresden
  title: MSc. Student in Computer Science
  type: education
  collection: [Glyphboard, Conversation Trainer, VisBlocks]

- start: 2019-03-01
  end: 2022-02-26
  institution: Aarhus University
  title: Ph.D. Student
  type: academia
  collection: [ProSample, ProSteer, ReVize, ReVis, ReData]

- start: 2022-03-01
  end: Date.now()
  institution: Aarhus University
  title: Postdoctoral Researcher
  type: academia
  collection: [MapBlender]
```

---

## 2. External CSV & JSON Dataset Files with Schema Mapping

InsightPage can load external CSV or JSON files directly from your workspace or notes directory, using custom schema mappings for title, start/end dates, collections, and categories:

```timeline
data = [5-Data/datasets/civilization_timelines.csv]
schemas = [
  title = "civilization",
  start = "start",
  end = "end",
  collection = {"startLabel", "endLabel"},
  categories = {"region", "timeline"}
]
```

Or using YAML configuration syntax:

```timeline
data: 5-Data/datasets/civilization_timelines.csv
schemas:
  title: civilization
  start: start
  end: end
  collection:
    - startLabel
    - endLabel
  categories:
    - region
    - timeline
```

---
## 3. Use Inline Table as Data Source

| civilization                                                                    | start | end   | startLabel | endLabel | region                          | timeline       |
| ------------------------------------------------------------------------------- | ----- | ----- | ---------- | -------- | ------------------------------- | -------------- |
| [[Aegean civilization]]                                                         | -2000 | -1200 |            |          | Europe (and colonial offshoots) | ANCIENT WORLD  |
| Age of pre-colonial civilization (Christian, Islamic, and traditional kingdoms) | 650   | 1880  |            |          | Sub-Saharan Africa              | MEDIEVAL WORLD |
| Age of Turkic empires                                                           | 500   | 1200  |            |          | Middle East                     | MEDIEVAL WORLD |
| Age of united Caliphate                                                         | 650   | 900   |            |          | Middle East                     | MEDIEVAL WORLD |
| Ancient Andean region                                                           | -1000 | 500   |            |          | pre-colonial Americas           | ANCIENT WORLD  |
| Ancient China                                                                   | -2000 | 500   |            |          | East Asia                       | ANCIENT WORLD  |
| Ancient Steppe empires                                                          | -1000 | 500   |            |          | the Steppe                      | ANCIENT WORLD  |
| Colonial Africa                                                                 | 1880  | 1980  |            |          | Sub-Saharan Africa              | MODERN WORLD   |
| Colonial United States                                                          | 1500  | 1776  |            |          | Europe (and colonial offshoots) | MODERN WORLD   |
| Early Islamic period                                                            | 1200  | 1500  |            |          | South Asia                      | MEDIEVAL WORLD |
| Early modern China                                                              | 1500  | 1918  |            | WWI      | East Asia                       | MODERN WORLD   |
| [[Early modern Europe]]                                                         | 1500  | 1800  |            |          | Europe (and colonial offshoots) | MODERN WORLD   |
| [[example]]                                                                     | -3000 | -2400 | 1          | 2        | Asia                            | MODERN WORLD   |
^table

```timeline
id: table
schemas = [
  title = "civilization",
  start = "start",
  end = "end",
  collection = {"startLabel", "endLabel"},
  categories = {"region", "timeline"}
]
```
## 4. Loose Syntax Support Examples

InsightPage intelligently parses loose JSON and YAML syntaxes without strict quotes, including:
- Loose double braces `{{ ... }}` or single object `{ ... }`
- Unquoted strings without double quotes
- Variable key-value spacing (with or without spaces after `:`)
- Dynamic `Date.now()` timestamps (rendering the "Today" indicator line)

### Loose Double-Brace Object

```timeline
{{start:2020-01-01, title:Project Alpha Launch, type:milestone, end:2021-06-01, collection:[Design, Prototype]}}
```

### Loose Object Array with Date.now()

```timeline
[
  {start:2021-01-01,end:2022-05-15,title:"Research Phase",category:R&D,collection:["Survey","Paper"]},
  {start:"2022-06-01",end:Date.now(),title:Product Rollout,category:Operations,collection:[V1,V2]}
]
```

---

## 4. Configuration Reference

Specify events using JSON/YAML arrays or external CSV/JSON dataset files:
- **`data`**: File path to CSV, TSV, or JSON dataset file (e.g., `5-data/timeline.csv`).
- **`schemas` / `schema`**: Field mapping configuration:
  - **`title`**: CSV/JSON column name to map to event title (e.g. `civilization`).
  - **`start`**: Column name for event start date or year (e.g., `-2000`, `650`, `2020-01-01`).
  - **`end`**: Column name for event end date or year.
  - **`collection`**: Column name(s) to collect into event tags/collections.
  - **`categories`**: Specific column name(s) to use as category filters and colors.
- **`start`**: Event start date (ISO string `YYYY-MM-DD` or timestamp or BC/AD year number).
- **`end`**: Event end date (optional; omitted end dates or `Date.now()` extend to present day). Using `Date.now()` renders the vertical "Today" indicator line.
- **`title`**: Title label displayed above the event bar.
- **`collection`**: Array of related project or publication tags. Multiple items collapse into a `+N` badge on tight zoom.
- **`[customCategory]`**: Any custom key (e.g., `type`, `institution`, `category`) is automatically discovered and mapped to color categories with category selection radio buttons.