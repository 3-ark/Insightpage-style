---
source: ""
description: Interactive timeline chart examples illustrating table data sourcing, external datasets, and loose syntax support in InsightPage.
title: Example Timeline
tags:
  - example
  - timeline
  - chart
  - visualization
createdat: 1794198919426
lastupdatedat: 1794198919426
pinned: false
---

# Example Timeline

InsightPage supports interactive zoomable timelines rendered using ```timeline```, ```timeline-chart```, or ```event-timeline``` code blocks.

---

## 1. Interactive Timeline Example (YAML Syntax)

Standard YAML supports unquoted keys, strings, and dynamic timestamps:

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

## 2. External CSV, TSV & JSON Dataset Files with Schema Mapping

InsightPage can load external CSV, TSV, or JSON dataset files using custom schema mappings for title, start/end dates, collections, and categories.

> [!NOTE] File System Access Requirement
> Reading relative paths (such as `5-Data/datasets/civilization_timelines.csv`) requires **granting a local folder as your File System (FS) Vault** in Note Vault settings (or using absolute `http(s)://` / `data:` URIs).
> 
> Without a granted FS folder handle, use **Inline Tables** (shown in Section 3 below) or embedded YAML/JSON event arrays, which work directly out of the box in all environments.

#### Loose Assignment Syntax
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

#### YAML Configuration Syntax
```timeline
data: 5-Data/datasets/civilization_timelines.csv
schemas:
  title: civilization
  start: start
  end: end
  collections:
    - startLabel
    - endLabel
  categories:
    - region
    - timeline
```

---

## 3. Use Inline Table as Data Source

You can bind a timeline directly to any Markdown table in the note by specifying `id: table` or `table: "#table-id"`:

| civilization                                                                    | start   | end   | startLabel       | endLabel | region                          | timeline       |
| ------------------------------------------------------------------------------- | ------- | ----- | ---------------- | -------- | ------------------------------- | -------------- |
| [[Aegean civilization]]                                                         | -2000   | -1200 |                  |          | Europe (and colonial offshoots) | ANCIENT WORLD  |
| Age of pre-colonial civilization (Christian, Islamic, and traditional kingdoms) | 650     | 1880  |                  |          | Sub-Saharan Africa              | MEDIEVAL WORLD |
| Age of Turkic empires                                                           | 500     | 1200  |                  |          | Middle East                     | MEDIEVAL WORLD |
| Age of united Caliphate                                                         | 650     | 900   |                  |          | Middle East                     | MEDIEVAL WORLD |
| Ancient Andean region                                                           | -1000   | 500   |                  |          | pre-colonial Americas           | ANCIENT WORLD  |
| Ancient China                                                                   | -2000   | 500   |                  |          | East Asia                       | ANCIENT WORLD  |
| Ancient Steppe empires                                                          | -1000   | 500   |                  |          | the Steppe                      | ANCIENT WORLD  |
| British India                                                                   | 1800    | 1945  |                  | WWII     | South Asia                      | MODERN WORLD   |
| Classic age of Mesoamerica                                                      | 100     | 900   |                  |          | pre-colonial Americas           | ANCIENT WORLD  |
| Colonial Africa                                                                 | 1880    | 1980  |                  |          | Sub-Saharan Africa              | MODERN WORLD   |
| Colonial United States                                                          | 1500    | 1776  |                  |          | Europe (and colonial offshoots) | MODERN WORLD   |
| Early Islamic period                                                            | 1200    | 1500  |                  |          | South Asia                      | MEDIEVAL WORLD |
| Early modern China                                                              | 1500    | 1918  |                  | WWI      | East Asia                       | MODERN WORLD   |
| [[Early modern Europe]]                                                         | 1500    | 1800  |                  |          | Europe (and colonial offshoots) | MODERN WORLD   |
| Early Nubian civilization                                                       | -2000   | -1000 |                  |          | Sub-Saharan Africa              | ANCIENT WORLD  |
| Egyptian civilization                                                           | -3000   | -550  |                  |          | Middle East                     | ANCIENT WORLD  |
| First Persian Empire                                                            | -550    | -330  |                  |          | Middle East                     | ANCIENT WORLD  |
| Formative age of Mesoamerica                                                    | -1500   | 100   |                  |          | pre-colonial Americas           | ANCIENT WORLD  |
| Formative Japan (age of Yamato rule)                                            | 500     | 800   |                  |          | East Asia                       | MEDIEVAL WORLD |
| Formative US                                                                    | 1776    | 1865  |                  |          | Europe (and colonial offshoots) | MODERN WORLD   |
| Fractured Islamic world                                                         | 900     | 2018  |                  | present  | Middle East                     | MODERN WORLD   |
| Great power US                                                                  | 1865    | 1945  |                  | WWII     | Europe (and colonial offshoots) | MODERN WORLD   |
| Greek age                                                                       | -1200   | 0     |                  |          | Europe (and colonial offshoots) | ANCIENT WORLD  |
| Heian age                                                                       | 800     | 1200  |                  |          | East Asia                       | MEDIEVAL WORLD |
| Imperial Japan                                                                  | 1870    | 1945  |                  | WWII     | East Asia                       | MODERN WORLD   |
| Indian kingdom age                                                              | -500    | 1200  |                  |          | South Asia                      | ANCIENT WORLD  |
| Indus civilization                                                              | -2500   | -1500 |                  |          | South Asia                      | ANCIENT WORLD  |
| Inter-Persian period                                                            | -330    | 200   |                  |          | Middle East                     | ANCIENT WORLD  |
| Kush                                                                            | -1000   | 300   |                  |          | Sub-Saharan Africa              | ANCIENT WORLD  |
| Medieval Andean region                                                          | 500     | 1530  |                  |          | pre-colonial Americas           | MEDIEVAL WORLD |
| Medieval China                                                                  | 500     | 1500  |                  |          | East Asia                       | MEDIEVAL WORLD |
| Medieval Europe                                                                 | 500     | 1500  |                  |          | Europe (and colonial offshoots) | MEDIEVAL WORLD |
| Mesopotamian civilization                                                       | -3500   | -550  |                  |          | Middle East                     | ANCIENT WORLD  |
| Modern Africa                                                                   | 1980    | 2018  | WWII             | present  | Sub-Saharan Africa              | MODERN WORLD   |
| Modern Europe                                                                   | 1800    | 2018  |                  | present  | Europe (and colonial offshoots) | MODERN WORLD   |
| Modern India                                                                    | 1945    | 2018  |                  | present  | South Asia                      | MODERN WORLD   |
| Modern Japan                                                                    | 1945    | 2018  |                  | present  | East Asia                       | MODERN WORLD   |
| Mongol Empire                                                                   | 1200    | 1300  |                  |          | the Steppe                      | MEDIEVAL WORLD |
| Mughal Empire                                                                   | 1500    | 1800  |                  |          | South Asia                      | MODERN WORLD   |
| Peak of Aksum                                                                   | 300     | 650   |                  |          | Sub-Saharan Africa              | MEDIEVAL WORLD |
| People's Republic of China                                                      | 1945    | 2018  | WWII             | present  | East Asia                       | MODERN WORLD   |
| Postclassic age of Mesoamerica                                                  | 900     | 1520  |                  |          | pre-colonial Americas           | MEDIEVAL WORLD |
| Ptolemaic Egypt                                                                 | -330    | 0     |                  |          | Middle East                     | ANCIENT WORLD  |
| Republic of China                                                               | 1918    | 1945  |                  |          | East Asia                       | MODERN WORLD   |
| Roman > Byzantine Egypt                                                         | 0       | 650   |                  |          | Middle East                     | ANCIENT WORLD  |
| Roman Empire                                                                    | 0       | 500   |                  |          | Europe (and colonial offshoots) | ANCIENT WORLD  |
| Roman Republic                                                                  | -500    | 0     |                  |          | Europe (and colonial offshoots) | ANCIENT WORLD  |
| Second Persian Empire                                                           | -200    | 650   |                  |          | Middle East                     | ANCIENT WORLD  |
| Shogunate                                                                       | 1200    | 1870  |                  |          | East Asia                       | MEDIEVAL WORLD |
| Superpower US                                                                   | 1945    | 2018  |                  | present  | Europe (and colonial offshoots) | MODERN WORLD   |
| Vedic age                                                                       | -1500   | -500  |                  |          | South Asia                      | ANCIENT WORLD  |
| [[example]]                                                                     | -99-8-1 | 34-7-1| [[aNote]]        | 2        | Asia                            | MODERN WORLD   |
^table

```timeline
id: table
schemas:
  title: civilization
  start: start
  end: end
  collections:
    - startLabel
    - endLabel
  categories:
    - region
    - timeline
```

---

## 4. Loose Syntax Support Examples

InsightPage intelligently parses loose JSON and YAML syntaxes without strict quotes, including:
- Loose double braces `{{ ... }}` or single object `{ ... }`
- Unquoted strings without double quotes
- Variable key-value spacing (with or without spaces after `:`)
- Dynamic `Date.now()` timestamps (rendering the "Today" indicator line)
- Historical BCE negative dates (e.g., `-2020-08-15`, `-2000`, `-330-08-01`)
- Embedded wikilinks in titles and collection tags (`[[Target Note|Alias]]`)

### Loose Double-Brace Object

```timeline
{{start:-2020-08-15, title:Project Alpha Launch, type:milestone, end:-2021-12-01, collection:[Design, Prototype, [[Render Test/example|example]]]}}
```

### Loose Object Array with Date.now()

```timeline
[
  {start:2021-01-01,end:2022-05-15,title:"Research Phase",category:R&D,collection:["Survey","Paper"]},
  {start:"2022-06-01",end:Date.now(),title:Product Rollout,category:Operations,collection:[V1,V2]}
]
```

---

## 5. Configuration Reference

All timeline configurations support the following keys across YAML, JSON, and table schemas:

| Option | Syntax & Types | Description |
| --- | --- | --- |
| **`data`** | `data: path/to/dataset.csv` / `data = [path]` | Path to CSV, TSV, or JSON dataset file (or URL). |
| **`id` / `table`** | `id: table` / `table: "#table-id"` | Reference an HTML or Markdown table in the note by its block ID. |
| **`schemas` / `schema`** | `schemas: { title, start, end, collections, categories }` | Field mapping configuration between dataset columns and timeline properties. |
| **`title`** | String / Wikilink (e.g. `[[My Note]]`) | Title label displayed on the event bar. Clickable to navigate to linked note. |
| **`start`** | ISO string (`YYYY-MM-DD`), number, or BCE year (e.g. `-2000`, `650`) | Event start date or year. |
| **`end`** | ISO string, number, or `Date.now()` (optional) | Event end date. If omitted or set to `Date.now()`, extends to present day and displays the "Today" indicator line. |
| **`collection` / `collections`** | Array of strings / wikilinks (e.g. `[Tag1, Tag2]`) | Related project or publication tags. Multiple items collapse into a `+N` badge on tight zoom. |
| **`categories` / `[customCategory]`** | Array of column names or custom keys (e.g. `type`, `region`) | Automatically discovered and mapped to distinct colors, complete with radio-button category switching controls. |
