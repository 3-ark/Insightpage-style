## 2025-10-01 - Avoid DOM Subtree Serialization during Post-Processor DOM Scans
**Learning:** In Obsidian markdown post-processors, calling `el.innerHTML` or `el.closest(...)` on every element from `querySelectorAll('*')` forces repeated HTML serialization of subtrees and parent DOM traversals. Checking `el.textContent.includes(...)` first short-circuits execution before `closest()` or `innerHTML` checks are run.
**Action:** Always check `el.textContent` before accessing `el.innerHTML` or `el.closest()` when scanning for text markers in DOM elements.

## 2025-10-02 - Short-Circuit Regex Processing & Guard DOM Reassignments in Post-Processors
**Learning:** Re-assigning `container.innerHTML = transformed` when `transformed === originalHtml` destroys and re-parses the DOM tree unnecessarily. Short-circuiting markdown string transformers using fast `indexOf` checks for multiple delimiter characters (e.g., carets `^` or tildes `~`) avoids expensive DOM tag masking regexes when delimiters cannot form valid pairs.
**Action:** Always cache `container.innerHTML` reads, short-circuit delimiter parsing with `indexOf` checks, and only assign `container.innerHTML = transformed` when `transformed !== html`.

## 2025-10-03 - Defer Spec Preparation in Multi-Stage Renderers & Short-Circuit Subtree Selector Scans
**Learning:** In multi-stage renderers (e.g., chart rendering from inline spec vs block ID table reference), running initial `datasetPrep` before checking if data originates from a table ID causes redundant style computations, color generation, and chart structure creation that gets thrown away. In DOM post-processors, guarding `querySelectorAll` attribute queries with fast O(1) `classList.contains` or `getElementsByClassName` checks skips CSS selector engine passes on non-matching elements.
**Action:** Always defer spec preparation until the resolved data payload is ready, and guard subtree CSS attribute queries with fast class presence checks.

## 2025-10-04 - Precompute Normalized Hash Maps for Graph Node Resolution
**Learning:** In multi-stage chart renderers like Sankey diagrams, resolving node names across flows and attributes using linear array scans (`Array.prototype.includes` and `Array.prototype.find`) causes $O(F \times L)$ operations with repeated string allocations (`toLowerCase()` inside nested loops). Precomputing an $O(1)$ lookup `Set` for exact matches and a normalized `Map` for case and singular/plural variations reduces node resolution complexity from $O(F \times L)$ to $O(L + F)$ with zero redundant string allocations.
**Action:** Precompute normalized label lookup `Map`s and `Set`s before processing flow collections or node resolution loops.

## 2025-10-05 - Precompute O(1) Category Lookup Maps for Radar and Polar Area Charts
**Learning:** In radar and polar area chart rendering, resolving point values per category label using nested linear array scans (`pts.find((p) => String(p.x) === String(catLabel))`) causes $O(S \times C \times N)$ operations with redundant string coercions across polygon construction, arc calculations, and vertex dot rendering. Precomputing an $O(1)$ lookup `Map` per series reduces category resolution complexity to $O(S \times (N + C))$ with zero redundant string allocations.
**Action:** Precompute $O(1)$ `Map` lookups for category-to-value mappings when rendering multi-series radial or coordinate charts.

## 2025-10-06 - Precompute Node Index Lookup Maps for Layer Sorting in Graph Renderers
**Learning:** In Sankey diagram layout generation, sorting nodes in vertical layers by relative order of appearance using `nodes.indexOf(a)` inside `Array.prototype.sort()` comparators triggers $O(N)$ linear scans for every comparison ($O(L \times N \log N)$ total). Precomputing an $O(1)$ `nodeIndexMap` before sorting layers eliminates repeated linear array searches.
**Action:** Always precompute `Map` lookups for element indices before running custom `sort()` comparators on graph node layers.

## 2025-10-07 - Cache DOM Bounding Rects and Tooltip Dimensions in Chart Hover Handlers
**Learning:** Querying `container.getBoundingClientRect()`, `tooltip.offsetWidth`, and `tooltip.offsetHeight` on every `mousemove` event tick during interactive chart hover interactions forces repeated synchronous DOM layout reflows (layout thrashing). Caching the container rect and tooltip measurements on `mouseenter` (when tooltip text and display state are set) eliminates layout thrashing during continuous mouse movement across chart elements.
**Action:** Always cache container bounding rects and tooltip dimensions on `mouseenter` and invalidate on `mouseleave` rather than querying layout properties inside high-frequency `mousemove` listeners.

## 2025-10-08 - Cache Color Transparency Hex Conversions and Guard Post-Replacement innerHTML Reads
**Learning:** Re-computing color opacity conversions with Chroma on every chart prep pass allocates new objects and hex strings repeatedly. In markdown post-processors, reading `container.innerHTML` after replacing text nodes forces full HTML serialization of new child DOM subtrees; guarding with `textContent.includes()` avoids DOM serialization when all delimiter matches were already replaced.
**Action:** Cache Chroma color alpha hex conversions in an $O(1)$ `Map` and guard post-replacement `innerHTML` reads with `textContent` checks.

## 2025-10-09 - Avoid Array Re-Indexing and Chained Passes in Markdown Table Parsers
**Learning:** In markdown table parsers, chaining `.split().map().filter()` creates multiple intermediate arrays, while calling `.shift()` on row cell arrays triggers $O(N)$ element re-indexing on every line. Evaluating separator row checks via `Array.prototype.every()` with inline regexes allocates function closures repeatedly. Direct line iteration with start/end cell index bounds and hoisted separator regexes eliminates array re-indexing and intermediate array allocations.
**Action:** Use direct loop passes with index bounds for trimming boundary cells and hoist separator regexes when parsing text-based tables.

## 2025-10-10 - Direct O(1) Block Property Access & Hoist ID Lowercasing in Vault Metadata Lookups
**Learning:** In Obsidian metadata cache lookups, calling `Object.keys(fileCache.blocks).find(...)` allocates a full key array and triggers $O(N)$ linear scans with repeated `toLowerCase()` string allocations per block key. Checking direct object properties (`fileCache.blocks[cleanId] ?? fileCache.blocks[caretId]`) resolves exact block ID matches in $O(1)$ time with zero key array allocations, while hoisting `cleanId.toLowerCase()` outside fallback loops avoids repeated string lowercasing inside iteration callbacks.
**Action:** Use direct property access for exact block ID matches before falling back to lowercasing iterations, and always hoist lowercased target strings outside find/loop callbacks.

## 2025-10-11 - Single-Pass Linear Regression & Typed Array Accumulation
**Learning:** In trend line and linear regression calculations for chart series, chaining array mappings (`map`, `every`), `Array.from` calls, and multiple array iterations creates unnecessary O(N) array object allocations and garbage collection pressure. Single-pass loops using `Float64Array` and inline numeric evaluation eliminate array allocation overhead and simplify sum accumulation.
**Action:** Combine numeric sequence checks and parameter summations into a single loop pass using typed arrays when computing statistical trendlines.

## 2025-10-12 - Single-Pass Linear Evaluation of Radial Domain Bounds & Sankey Depth
**Learning:** In radial and Sankey charts, computing min/max Y domain values and node layer max depth using `dataPoints.map()` with `Math.max(...allYVals)` or `Object.values(nodeDepths)` allocates unnecessary $O(N)$ heap arrays and pushes $N$ arguments onto the call stack. Evaluating bounds in a single linear loop eliminates intermediate array allocations and stack frame pressure on large datasets.
**Action:** Use single-pass linear loops rather than array mapping and `Math.max(...array)` spread arguments when computing scale domain bounds.

## 2025-10-13 - Guard HTML Tag Masking Regexes with Fast Marker Checks in Text Transformers
**Learning:** In markdown string post-processors, unconditionally executing regexes to mask HTML tags and protected code/style/math blocks on plain text nodes or raw string segments allocates temporary arrays and placeholder strings even when no HTML markup exists. Checking `html.includes('<')` before running tag/block protection regexes skips expensive regex parsing, string allocations, and restoration replacement passes.
**Action:** Guard HTML tag and block masking regex passes with `html.includes('<')` when transforming plain text content or inline markdown markup.

## 2025-10-14 - Scalar Extent Accumulation & Direct Slicing in Map Renderers
**Learning:** Pushing thousands of map coordinate tuples into a heap array to pass to `L.latLngBounds` allocates $O(N)$ objects and forces Leaflet to re-loop over all points to find extents. Tracking `minLat`, `maxLat`, `minLng`, `maxLng` with scalar accumulators reduces memory overhead to $O(1)$ and lets `L.latLngBounds` construct bounds with just 2 corner points. In string coordinate parsing, slicing at `indexOf(',')` indices avoids temporary array allocations from `.split(',').map()`.
**Action:** Use scalar min/max accumulators for geographic bounding box calculations and slice string coordinates at comma indices rather than allocating coordinate arrays.

## 2025-10-15 - Direct Single-Pass Iteration for Sankey Scale Factors & Node Positioning
**Learning:** In Sankey diagram rendering, iterating over node layers using `layer.reduce()` and `layer.map()` allocates function closures and temporary node height arrays for every layer. Replacing higher-order array methods with single-pass `for` loops eliminates array object allocations per layer and reduces closure execution overhead during graph layout calculation.
**Action:** Use direct single-pass index loops instead of `layer.reduce()` or `layer.map()` when calculating layer totals and node layout coordinates.

## 2025-10-16 - Cache Chart Container Tooltip Element References
**Learning:** When binding interactive hover tooltips across chart elements (pie slices, radar vertices, Sankey flow paths and nodes), repeatedly querying `container.querySelector(':scope > .chart-plot-tooltip')` triggers browser CSS selector engine passes for every element ($O(N)$ querySelector passes). Caching the tooltip element reference directly on the container object (`(container as any)._chartTooltip`) reduces DOM queries from $N$ to $1$, serving subsequent tooltip bindings via fast $O(1)$ property lookups.
**Action:** Cache DOM element references on container objects when helper functions query child elements repeatedly during multi-element rendering loops.

## 2025-10-17 - Single-Pass Coordinate Parsing & Bounds Accumulation in Map Renderers
**Learning:** In map rendering for polylines and polygons, chaining `.map(parseLatLng).filter(...)` and subsequently looping over the filtered coordinate array to accumulate geographic bounds creates two temporary intermediate arrays per feature and performs multiple array iterations. Combining coordinate parsing, point filtering, and spatial bounds accumulation into a single `for` loop pass eliminates intermediate array heap allocations and reduces traversal overhead.
**Action:** Use a single `for` loop pass when parsing raw feature points to simultaneously validate coordinates, populate point lists, and update spatial bounding extents.

## 2025-10-18 - Guard Post-Replacement DOM Serialization with Fast Child Querying
**Learning:** In DOM post-processors, creating temporary `div` elements and setting `innerHTML` to check for comment text inside excluded elements (`code`, `pre`, `math`) triggers full HTML parsing and serialization. Querying `parentEl.querySelector` for excluded selectors first proves whether any excluded child elements exist, skipping temporary DOM tree instantiation and `innerHTML` serialization for plain HTML elements.
**Action:** Use `querySelector` to verify the presence of excluded child elements before building temporary DOM trees or serializing subtrees during post-processing.

## 2025-10-19 - Separate Static Elements from Interactive Zoom Loops & Hoist Regex Set Lookups
**Learning:** In D3 interactive timeline charts, re-rendering the static legend inside the `draw()` zoom event callback rebuilds DOM elements and invokes `getComputedTextLength()` text measurement queries on every zoom/pan tick. `getComputedTextLength()` forces synchronous SVG layout reflows (layout thrashing) up to 120 times per second during mouse drag/wheel interactions. Rendering static legend groups once per chart layout pass outside the `draw()` zoom loop eliminates SVG node re-creation and synchronous reflows. Hoisting reserved string identifier sets for object literal tokenization avoids temporary array allocations inside regex replace callbacks.
**Action:** Render static chart legends outside interactive zoom callbacks to eliminate layout thrashing, and hoist token sets to avoid per-match array allocations in regex callbacks.

## 2025-10-20 - Single-Pass Time Domain Accumulation & Pre-Computed Set Lookups in Timeline Processing
**Learning:** In timeline dataset mapping and chart rendering, checking column key roles via `.includes()` on arrays inside nested per-row property loops creates $O(R \times K \times C)$ linear array scans. In timeline time domain calculations, calling `processedEvents.map((d) => d.startDate)` and `processedEvents.map((d) => d.endDate)` allocates temporary Date arrays and triggers two full D3 array scanning passes (`d3.min` / `d3.max`). Pre-computing $O(1)$ lookup `Set`s for column key categories and accumulating `minTime` and `maxTime` in a single pass during initial event mapping eliminates array heap allocations and array traversal passes.
**Action:** Pre-compute key category `Set`s before dataset mapping loops, and accumulate min/max timestamps in scalar variables during event transformation.

## 2025-10-21 - Hoist Date Parsing Regexes & Short-Circuit Integer Years in Timeline Datasets
**Learning:** Re-instantiating era regular expressions (`BC`, `AD`) on every `parseEventDate` call during timeline dataset parsing creates unnecessary regex object allocations and execution overhead. Evaluating plain integer year strings (`/^[+-]?\d+$/`) first short-circuits execution before evaluating era regexes, avoiding era matching logic on standard numeric year values.
**Action:** Hoist regular expressions to module scope in dataset parsing functions and evaluate integer format checks before running era boundary regex tests.
