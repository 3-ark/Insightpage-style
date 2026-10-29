import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import Module from 'node:module';

// Mock 'obsidian' module for Node runtime BEFORE loading chart modules
const originalRequire = Module.prototype.require;
Module.prototype.require = function (id: string) {
  if (id === 'obsidian') {
    return {
      parseYaml: (str: string) => null,
      requestUrl: async () => ({ status: 200, text: '' }),
      MarkdownRenderChild: class {
        el: any;
        containerEl: any;
        constructor(el: any) {
          this.el = el;
          this.containerEl = el;
        }
      },
    };
  }
  return originalRequire.apply(this, arguments as any);
};

test('parseEventDate correctly normalizes dates, timestamps, strings and fallbacks', async () => {
  const { parseEventDate } = await import('../src/timelineRenderer');
  const fallback = new Date('2020-01-01');

  const d1 = parseEventDate('2018-05-15', fallback);
  assert.equal(d1.getFullYear(), 2018);

  const timestamp = 1577836800000; // 2020-01-01T00:00:00.000Z
  const d2 = parseEventDate(timestamp, fallback);
  assert.equal(d2.getTime(), timestamp);

  const d3 = parseEventDate(new Date('2022-09-10'), fallback);
  assert.equal(d3.getFullYear(), 2022);

  const d4 = parseEventDate('invalid-date-string', fallback);
  assert.equal(d4.getTime(), fallback.getTime());

  const d5 = parseEventDate(undefined, fallback);
  assert.equal(d5.getTime(), fallback.getTime());

  // Integer year string short-circuit parsing (+/- numeric strings)
  const d6a = parseEventDate('2023', fallback);
  assert.equal(d6a.getFullYear(), 2023);

  const d6b = parseEventDate('+50', fallback);
  assert.equal(d6b.getFullYear(), 50);

  // BC dates
  const d6 = parseEventDate(-2000, fallback);
  assert.equal(d6.getFullYear(), -2000);

  const d7 = parseEventDate('-1000', fallback);
  assert.equal(d7.getFullYear(), -1000);

  // BC/BCE and AD/CE string variants
  const d8 = parseEventDate('500 BC', fallback);
  assert.equal(d8.getFullYear(), -500);

  const d9 = parseEventDate('300 BCE', fallback);
  assert.equal(d9.getFullYear(), -300);

  const d10 = parseEventDate('AD 100', fallback);
  assert.equal(d10.getFullYear(), 100);

  const d11 = parseEventDate('200 CE', fallback);
  assert.equal(d11.getFullYear(), 200);

  // Safety bounds check
  const d12 = parseEventDate('9999999', fallback);
  assert.equal(d12.getTime(), fallback.getTime());

  // Negative ISO formatted dates (e.g. -0200-01-01, -0200-05-15, -200-03-10)
  const d13 = parseEventDate('-0200-01-01', fallback);
  assert.equal(d13.getFullYear(), -200);
  assert.equal(d13.getMonth(), 0);
  assert.equal(d13.getDate(), 1);

  const d14 = parseEventDate('-0200-05-15', fallback);
  assert.equal(d14.getFullYear(), -200);
  assert.equal(d14.getMonth(), 4);
  assert.equal(d14.getDate(), 15);

  const d15 = parseEventDate('-200-03-10', fallback);
  assert.equal(d15.getFullYear(), -200);
  assert.equal(d15.getMonth(), 2);
  assert.equal(d15.getDate(), 10);

  // Single-digit month/day negative dates and BC suffix dates
  const d16 = parseEventDate('-2020-1-1', fallback);
  assert.equal(d16.getFullYear(), -2020);
  assert.equal(d16.getMonth(), 0);
  assert.equal(d16.getDate(), 1);

  const d17 = parseEventDate('2020-01-01 BC', fallback);
  assert.equal(d17.getFullYear(), -2020);
  assert.equal(d17.getMonth(), 0);
  assert.equal(d17.getDate(), 1);

  const d18 = parseEventDate('BC 2020-05-15', fallback);
  assert.equal(d18.getFullYear(), -2020);
  assert.equal(d18.getMonth(), 4);
  assert.equal(d18.getDate(), 15);
});

test('renderTimelineBlock correctly handles negative start and end date ranges', async () => {
  const { renderTimelineBlockAsync } = await import('../src/timelineRenderer');
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="container"></div></body></html>');
  (global as any).window = dom.window;
  (global as any).document = dom.window.document;
  (global as any).Element = dom.window.Element;
  (global as any).HTMLElement = dom.window.HTMLElement;
  (global as any).SVGElement = dom.window.SVGElement;
  Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true, writable: true });

  const container = dom.window.document.getElementById('container') as HTMLElement;
  const code = '{{start:-2020-01-01, title:Project Alpha Launch, type:milestone, end:-2021-06-01, collection:[Design, Prototype, [[Render Test/example|example]]]}}';

  await renderTimelineBlockAsync(code, container);
  await new Promise((resolve) => setTimeout(resolve, 50));

  const wrapper = container.querySelector('.timeline-wrapper');
  assert.ok(wrapper, 'Timeline wrapper should exist');

  const eventGroup = container.querySelector('.event-group');
  assert.ok(eventGroup, 'Event group should render for negative date event');

  const eventBar = container.querySelector('.event-bar') as SVGRectElement;
  assert.ok(eventBar, 'Event bar should exist');
  const width = parseFloat(eventBar.getAttribute('width') || '0');
  assert.ok(width > 0, 'Event bar width should be greater than 0 for negative year range');
});

test('formatTimelineTick dynamically formats tick labels based on domain span and tick interval', async () => {
  const { formatTimelineTick } = await import('../src/timelineRenderer');

  const DAY_MS = 86400000;
  const d = new Date('2020-05-15T10:30:00');

  // Multi-year tick interval (e.g., 365 days): year only
  assert.equal(formatTimelineTick(d, undefined, 365 * DAY_MS), '2020');

  // Multi-year span for BC date
  const bcDate = new Date(-200, 4, 15);
  bcDate.setFullYear(-200);
  assert.equal(formatTimelineTick(bcDate, undefined, 365 * DAY_MS), '200 BC');

  // Monthly tick interval (~30-90 days): month and year
  assert.equal(formatTimelineTick(d, undefined, 30 * DAY_MS), 'May 2020');

  // Daily/weekly tick interval (1-28 days): month, day, and year
  assert.equal(formatTimelineTick(d, undefined, 7 * DAY_MS), 'May 15, 2020');

  // Sub-day tick interval (< 1 day): month, day, and time
  assert.equal(formatTimelineTick(d, undefined, 0.25 * DAY_MS), 'May 15, 10:30');

  // Fallback domain-based calculation when tickIntervalMs is omitted
  const wideDomain: [Date, Date] = [new Date('2010-01-01'), new Date('2025-01-01')];
  assert.equal(formatTimelineTick(d, wideDomain), '2020');

  const shortDomain: [Date, Date] = [new Date('2020-05-01'), new Date('2020-05-30')];
  assert.equal(formatTimelineTick(d, shortDomain), 'May 15, 2020');
});

test('formatDisplayDate formats BC dates and years under 1000 with month and era', async () => {
  const { renderTimelineBlockAsync } = await import('../src/timelineRenderer');
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="container"></div></body></html>');
  (global as any).window = dom.window;
  (global as any).document = dom.window.document;

  const container = dom.window.document.getElementById('container') as HTMLElement;

  const code = JSON.stringify([
    {
      start: '-0200-01-01',
      end: '-0200-05-15',
      title: 'Ancient War',
    },
  ]);

  await renderTimelineBlockAsync(code, container);
  await new Promise((resolve) => setTimeout(resolve, 50));

  const wrapper = container.querySelector('.timeline-wrapper') as HTMLElement;
  assert.ok(wrapper, 'Wrapper should exist');

  const eventGroup = wrapper.querySelector('.event-group') as SVGElement;
  assert.ok(eventGroup, 'Event group should exist');

  const mouseEnterEvt = new dom.window.MouseEvent('mouseenter', {
    bubbles: true,
    cancelable: true,
    clientX: 100,
    clientY: 100,
  });
  eventGroup.dispatchEvent(mouseEnterEvt);

  const tooltipDate = wrapper.querySelector('.tt-date') as HTMLElement;
  assert.ok(tooltipDate, 'Date element in tooltip should exist');
  assert.equal(tooltipDate.textContent, 'Jan 200 BC – May 200 BC');
});

test('mapRawRowsToTimelineData supports case-insensitive schema mapping field matching', async () => {
  const { mapRawRowsToTimelineData } = await import('../src/timelineRenderer');
  const rawRows = [
    {
      civilizationname: 'Roman Republic',
      startyear: '-509',
      endyear: '-27',
      starttag: 'Foundation',
      endtag: 'Empire',
      georegion: 'Mediterranean',
      periodname: 'Ancient',
    },
  ];

  const mapped = mapRawRowsToTimelineData(rawRows, {
    title: 'CivilizationName',
    start: 'StartYear',
    end: 'EndYear',
    collection: ['StartTag', 'EndTag'],
    categories: ['GeoRegion', 'PeriodName'],
  });

  assert.equal(mapped.events[0].title, 'Roman Republic');
  assert.equal(mapped.events[0].start, '-509');
  assert.equal(mapped.events[0].end, '-27');
  assert.deepEqual(mapped.events[0].collection, ['Foundation', 'Empire']);
  assert.deepEqual(mapped.categories, ['GeoRegion', 'PeriodName']);
});

test('renderTimelineBlockAsync resolves cross-note block IDs (NoteName#^blockId) and error states', async () => {
  const { renderTimelineBlockAsync } = await import('../src/timelineRenderer');
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="container"></div></body></html>');
  (global as any).window = dom.window;
  (global as any).document = dom.window.document;

  const container = dom.window.document.getElementById('container') as HTMLElement;

  const otherNoteText = `| civilization | start | end |
| --- | --- | --- |
| Greek Empire | -800 | -146 |
^greek-table`;

  const mockApp = {
    workspace: {
      getActiveFile: () => ({ path: 'main.md' }),
    },
    vault: {
      cachedRead: async () => otherNoteText,
      getAbstractFileByPath: (p: string) => (p === 'HistoryNote.md' ? { path: 'HistoryNote.md' } : null),
    },
    metadataCache: {
      getFirstLinkpathDest: (link: string) => (link === 'HistoryNote' ? { path: 'HistoryNote.md' } : null),
      getFileCache: () => ({
        blocks: {
          'greek-table': {
            position: { start: { offset: 0 }, end: { offset: otherNoteText.length } },
          },
        },
      }),
    },
  };

  const code = `id: "HistoryNote#^greek-table"
schemas = [
  title = "civilization",
  start = "start",
  end = "end"
]`;

  await renderTimelineBlockAsync(code, container, { sourcePath: 'main.md' }, mockApp);

  const wrapper = container.querySelector('.timeline-wrapper');
  assert.ok(wrapper, 'Timeline wrapper should exist for cross-note block table');
  const eventBar = container.querySelector('.event-group');
  assert.ok(eventBar, 'Should render event from cross-note table');
});

test('parseTimelineCode correctly parses array of events and auto-discovers categories', async () => {
  const { parseTimelineCode } = await import('../src/timelineRenderer');
  const code = JSON.stringify([
    {
      start: '2016-01-31',
      end: '2017-06-30',
      title: 'BSc. Student in Computer Science',
      type: 'education',
      institution: 'University A',
    },
    {
      start: '2017-09-01',
      end: '2019-01-31',
      title: 'MSc. Student in Computer Science',
      collection: ['Jane', 'Thomas', 'Ash'],
      type: 'education',
      institution: 'University B',
    },
    {
      start: '2018-02-01',
      end: '2018-09-30',
      title: 'Web developer',
      type: 'industry',
      institution: 'Company X',
    },
  ]);

  const parsed = parseTimelineCode(code);
  assert.equal(parsed.events.length, 3);
  assert.deepEqual([...parsed.categories].sort(), ['institution', 'type'].sort());
  assert.equal(parsed.activeCategory, parsed.categories[0]);
});

test('parseTimelineConfig parses external CSV dataset config with loose schema mapping syntax', async () => {
  const { parseTimelineConfig } = await import('../src/timelineRenderer');
  const configCode = `data = [5-Data/datasets/civilization_timelines.csv]
schemas = [
  title = "civilization",
  start = "start",
  end = "end",
  collection = {"startLabel", "endLabel"},
  categories = {"region", "timeline"}
]`;

  const config = parseTimelineConfig(configCode);
  assert.equal(config.data, '5-Data/datasets/civilization_timelines.csv');
  assert.ok(config.schemas);
  assert.equal(config.schemas.title, 'civilization');
  assert.equal(config.schemas.start, 'start');
  assert.equal(config.schemas.end, 'end');
  assert.deepEqual(config.schemas.collection, ['startLabel', 'endLabel']);
  assert.deepEqual(config.schemas.categories, ['region', 'timeline']);
});

test('parseTimelineConfig parses YAML configuration syntax for external datasets', async () => {
  const { parseTimelineConfig } = await import('../src/timelineRenderer');
  const yamlConfig = `data: 5-Data/datasets/civilization_timelines.csv
schemas:
  title: civilization
  start: start
  end: end
  collection:
    - startLabel
    - endLabel
  categories:
    - region
    - timeline`;

  const config = parseTimelineConfig(yamlConfig);
  assert.equal(config.data, '5-Data/datasets/civilization_timelines.csv');
  assert.ok(config.schemas);
  assert.equal(config.schemas.title, 'civilization');
  assert.deepEqual(config.schemas.collection, ['startLabel', 'endLabel']);
  assert.deepEqual(config.schemas.categories, ['region', 'timeline']);
});

test('parseTimelineConfig parses block ID table reference syntax', async () => {
  const { parseTimelineConfig } = await import('../src/timelineRenderer');
  const tableConfig = `id: table
schemas = [
  title = "civilization",
  start = "start",
  end = "end",
  collection = {"startLabel", "endLabel"},
  categories = {"region", "timeline"}
]`;

  const config = parseTimelineConfig(tableConfig);
  assert.equal(config.id, 'table');
  assert.ok(config.schemas);
  assert.equal(config.schemas.title, 'civilization');
});

test('parseCsvOrTsv and mapRawRowsToTimelineData correctly parse CSV rows and map schema fields', async () => {
  const { parseCsvOrTsv, mapRawRowsToTimelineData } = await import('../src/timelineRenderer');
  const csvContent = `civilization,start,end,startLabel,endLabel,region,timeline
Aegean civilization,-2000,-1200,,,Europe (and colonial offshoots),ANCIENT WORLD
British India,1800,1945,,WWII,South Asia,MODERN WORLD`;

  const rows = parseCsvOrTsv(csvContent);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].civilization, 'Aegean civilization');

  const mapped = mapRawRowsToTimelineData(rows, {
    title: 'civilization',
    start: 'start',
    end: 'end',
    collection: ['startLabel', 'endLabel'],
    categories: ['region', 'timeline'],
  });

  assert.equal(mapped.events.length, 2);
  assert.equal(mapped.events[0].title, 'Aegean civilization');
  assert.equal(mapped.events[0].start, '-2000');
  assert.equal(mapped.events[0].end, '-1200');
  assert.deepEqual(mapped.categories, ['region', 'timeline']);
  assert.equal(mapped.events[1].collection?.[0], 'WWII');
});

test('parseMarkdownTableRows extracts table rows accurately', async () => {
  const { parseMarkdownTableRows } = await import('../src/timelineRenderer');
  const tableContent = `| civilization | start | end | startLabel | endLabel | region | timeline |
| --- | --- | --- | --- | --- | --- | --- |
| Aegean civilization | -2000 | -1200 | | | Europe | ANCIENT WORLD |
| British India | 1800 | 1945 | | WWII | South Asia | MODERN WORLD |
^table`;

  const rows = parseMarkdownTableRows(tableContent);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].civilization, 'Aegean civilization');
  assert.equal(rows[1].endLabel, 'WWII');
});

test('parseMarkdownTableRows correctly parses cells containing wikilinks with pipes without splitting event blocks', async () => {
  const { parseMarkdownTableRows } = await import('../src/timelineRenderer');
  const tableContent = `| civilization | start | end | startLabel | endLabel | region | timeline |
| --- | --- | --- | --- | --- | --- | --- |
| [[Aegean civilization|Aegean]] | -2000 | -1200 | | | Europe | ANCIENT WORLD |
| [[British India|India]] | 1800 | 1945 | | WWII | South Asia | MODERN WORLD |
^table`;

  const rows = parseMarkdownTableRows(tableContent);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].civilization, '[[Aegean civilization|Aegean]]');
  assert.equal(rows[0].start, '-2000');
  assert.equal(rows[0].end, '-1200');
  assert.equal(rows[0].region, 'Europe');
  assert.equal(rows[1].civilization, '[[British India|India]]');
  assert.equal(rows[1].start, '1800');
  assert.equal(rows[1].end, '1945');
  assert.equal(rows[1].region, 'South Asia');
});

test('renderTimelineBlockAsync loads data from table id and renders timeline SVG', async () => {
  const { renderTimelineBlockAsync } = await import('../src/timelineRenderer');
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="container"></div></body></html>');
  (global as any).window = dom.window;
  (global as any).document = dom.window.document;

  const container = dom.window.document.getElementById('container') as HTMLElement;

  const noteMarkdown = `| civilization | start | end | startLabel | endLabel | region | timeline |
| --- | --- | --- | --- | --- | --- | --- |
| Aegean civilization | -2000 | -1200 | | | Europe | ANCIENT WORLD |
| British India | 1800 | 1945 | | WWII | South Asia | MODERN WORLD |
^table`;

  const mockApp = {
    workspace: {
      getActiveFile: () => ({ path: 'note.md' }),
    },
    vault: {
      cachedRead: async () => noteMarkdown,
      getAbstractFileByPath: () => ({ path: 'note.md' }),
    },
    metadataCache: {
      getFileCache: () => ({
        blocks: {
          table: {
            id: 'table',
            position: { start: { offset: 0 }, end: { offset: noteMarkdown.length } },
          },
        },
      }),
    },
  };

  const code = `id: table
schemas = [
  title = "civilization",
  start = "start",
  end = "end",
  collection = {"startLabel", "endLabel"},
  categories = {"region", "timeline"}
]`;

  await renderTimelineBlockAsync(code, container, { sourcePath: 'note.md' }, mockApp);

  const wrapper = container.querySelector('.timeline-wrapper');
  assert.ok(wrapper, 'Timeline wrapper should exist');

  const eventGroups = container.querySelectorAll('.event-group');
  assert.equal(eventGroups.length, 2, 'Should render 2 events from table');
});

test('renderTimelineBlock renders timeline SVG, event groups, top & bottom axes, draggable legend, and action buttons', async () => {
  const { renderTimelineBlock } = await import('../src/timelineRenderer');
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="container"></div></body></html>');
  (global as any).window = dom.window;
  (global as any).document = dom.window.document;
  Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true, writable: true });

  const container = dom.window.document.getElementById('container') as HTMLElement;

  const code = JSON.stringify([
    {
      start: '2016-01-31',
      end: '2017-06-30',
      title: 'BSc. Student in Computer Science',
      type: 'education',
    },
    {
      start: '2017-09-01',
      end: '2019-01-31',
      title: 'MSc. Student in Computer Science',
      collection: ['Project A', 'Project B'],
      type: 'industry',
    },
  ]);

  renderTimelineBlock(code, container);

  await new Promise((resolve) => setTimeout(resolve, 50));

  const wrapper = container.querySelector('.timeline-wrapper');
  assert.ok(wrapper, 'Timeline wrapper should exist');

  const svg = wrapper.querySelector('svg.timeline-svg');
  assert.ok(svg, 'Timeline SVG element should exist');

  const axisTop = wrapper.querySelector('.axis-top');
  assert.ok(axisTop, 'Top axis should exist');

  const axisBottom = wrapper.querySelector('.axis-bottom');
  assert.ok(axisBottom, 'Bottom axis should exist');

  const legend = wrapper.querySelector('.legend');
  assert.ok(legend, 'Legend should exist');

  const copyBtn = wrapper.querySelector('.timeline-copy-btn');
  assert.ok(copyBtn, 'Copy button should exist');

  const downloadBtn = wrapper.querySelector('.timeline-download-btn');
  assert.ok(downloadBtn, 'Download SVG button should exist');

  const eventGroups = wrapper.querySelectorAll('.event-group');
  assert.equal(eventGroups.length, 2, 'Should render 2 event groups');

  const collectionNodes = wrapper.querySelectorAll('.collection-node');
  assert.equal(collectionNodes.length, 2, 'Should render 2 collection nodes for MSc event');
});

test('renderTimelineBlock handles multiple categories with radio buttons and re-renders on change', async () => {
  const { renderTimelineBlock } = await import('../src/timelineRenderer');
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="container"></div></body></html>');
  (global as any).window = dom.window;
  (global as any).document = dom.window.document;
  Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true, writable: true });

  const container = dom.window.document.getElementById('container') as HTMLElement;

  const data = {
    events: [
      {
        start: '2020-01-01',
        end: '2021-01-01',
        title: 'Project Alpha',
        type: 'work',
        domain: 'tech',
      },
    ],
    categories: ['type', 'domain'],
    activeCategory: 'type',
  };

  renderTimelineBlock(JSON.stringify(data), container);

  await new Promise((resolve) => setTimeout(resolve, 50));

  const radioContainer = container.querySelector('.timeline-category-controls');
  assert.ok(radioContainer, 'Radio controls container should exist');

  const radioInputs = radioContainer.querySelectorAll<HTMLInputElement>('input[type="radio"]');
  assert.equal(radioInputs.length, 2, 'Should render 2 radio button options');

  assert.equal(radioInputs[0].value, 'type');
  assert.equal(radioInputs[0].checked, true);
  assert.equal(radioInputs[1].value, 'domain');
  assert.equal(radioInputs[1].checked, false);

  radioInputs[1].checked = true;
  radioInputs[1].dispatchEvent(new dom.window.Event('change'));

  const updatedRadioInputs = radioContainer.querySelectorAll<HTMLInputElement>('input[type="radio"]');
  assert.equal(updatedRadioInputs[1].checked, true);
});

test('parseTimelineCode correctly parses JS object literal syntax with Date.now() and double braces', async () => {
  const { parseTimelineCode } = await import('../src/timelineRenderer');
  const jsInput = ` {{start: "2022-03-01", end: Date.now(), test:a, institution: "Aarhus University", title: "Postdoctoral Researcher", type: "academia", collection: ["mapblender"]},
  {start: "2019-03-01", end: "2022-02-26", test:a, institution: "Aarhus University", title: "Ph.D. Student", type: "academia", collection: ["ProSample", "ProSteer", "ReVize", "ReVis", "ReData", "ColorBrewer-lite", "VisFlow-lite"]},
  {start: "2016-10-01", end: "2019-01-31", test:b, institution: "Technical University Dresden", title: "MSc. Student in Computer Science", type: "education", collection: ["Glyphboard", "Conversation Trainer", "VisBlocks"]},
  {start: "2013-10-01", end: "2016-09-30", test:a, institution: "Technical University Dresden", title: "BSc. Student in Computer Science", type: "education", collection: []},
  {start: "2021-01-01", end: "2021-04-30", test:b, institution: "Carnegie Mellon University", title: "Visiting Ph.D. student at DIG Lab", type: "academia", collection: ["ProInterest"]},
  {start: "2016-10-02", end: "2018-03-30", test:a, institution: "Technical University Dresden", title: "Web developer", type: "academia", collection: []},
  {start: "2017-09-01", end: "2019-01-31", test:a, institution: "SAP", title: "Part-time developer", type: "industry", collection: ["Parallel Hierarchies"]}}`;

  const parsed = parseTimelineCode(jsInput);
  assert.equal(parsed.events.length, 7);
  assert.equal(parsed.events[0].title, 'Postdoctoral Researcher');
  assert.ok(parsed.events[0].end, 'end should be populated from Date.now()');
  assert.deepEqual([...parsed.categories].sort(), ['institution', 'test', 'type'].sort());
});

test('parseTimelineCode handles variable key-value spacing (with or without spaces after :)', async () => {
  const { parseTimelineCode } = await import('../src/timelineRenderer');
  const noSpaces = `{start:"2020-01-01",end:"2021-01-01",title:Project A,type:work,category:engineering}`;
  const parsed1 = parseTimelineCode(noSpaces);
  assert.equal(parsed1.events.length, 1);
  assert.equal(parsed1.events[0].title, 'Project A');
  assert.equal(parsed1.events[0].type, 'work');

  const mixedSpaces = `{ start : "2020-01-01" , end : "2021-01-01" , title : Project B , type : work }`;
  const parsed2 = parseTimelineCode(mixedSpaces);
  assert.equal(parsed2.events.length, 1);
  assert.equal(parsed2.events[0].title, 'Project B');
  assert.equal(parsed2.events[0].type, 'work');
});

test('renderTimelineBlock displays "Today" indicator line for dynamic Date.now() ongoing events', async () => {
  const { renderTimelineBlock } = await import('../src/timelineRenderer');
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="container"></div></body></html>');
  (global as any).window = dom.window;
  (global as any).document = dom.window.document;

  const container = dom.window.document.getElementById('container') as HTMLElement;

  const code = `{start:"2022-01-01",end:Date.now(),title:Current Project,type:work}`;
  renderTimelineBlock(code, container);

  await new Promise((resolve) => setTimeout(resolve, 50));

  const nowIndicator = container.querySelector('.now-indicator');
  assert.ok(nowIndicator, 'Today indicator line should exist for Date.now() event');
  assert.match(nowIndicator.textContent || '', /Today/);
});

test('parseTimelineCode parses simple YAML input syntax', async () => {
  const { parseTimelineCode } = await import('../src/timelineRenderer');
  const yamlInput = `- start: 2020-01-01
  end: 2021-01-01
  title: YAML Project
  type: open-source`;

  const parsed = parseTimelineCode(yamlInput);
  assert.equal(parsed.events.length, 1);
  assert.equal(parsed.events[0].title, 'YAML Project');
  assert.equal(parsed.events[0].type, 'open-source');
});

test('renderTimelineBlock displays error block on invalid data', async () => {
  const { renderTimelineBlock } = await import('../src/timelineRenderer');
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="container"></div></body></html>');
  (global as any).window = dom.window;
  (global as any).document = dom.window.document;

  const container = dom.window.document.getElementById('container') as HTMLElement;

  renderTimelineBlock('invalid json {{{', container);

  await new Promise((resolve) => setTimeout(resolve, 50));

  const errorDiv = container.querySelector('.chart-error');
  assert.ok(errorDiv, 'Error div should be rendered for invalid timeline data');
  assert.match(errorDiv.textContent || '', /Unable to render timeline chart/);
});

test('stripWikilinks and parseWikilinksToHtml process wikilinks correctly', async () => {
  const { stripWikilinks, parseWikilinksToHtml } = await import('../src/timelineRenderer');

  assert.equal(stripWikilinks('[[Note Title]]'), 'Note Title');
  assert.equal(stripWikilinks('[[Note Target|Alias Display]]'), 'Alias Display');
  assert.equal(stripWikilinks('Event with [[Link A]] and [[Link B|Alias]]'), 'Event with Link A and Alias');

  assert.equal(
    parseWikilinksToHtml('[[Note Title]]'),
    '<a class="internal-link" data-href="Note Title" href="Note Title" style="color: var(--link-color, #3b82f6); text-decoration: underline; cursor: pointer;">Note Title</a>'
  );
  assert.equal(
    parseWikilinksToHtml('[[Note Target|Alias Display]]'),
    '<a class="internal-link" data-href="Note Target" href="Note Target" style="color: var(--link-color, #3b82f6); text-decoration: underline; cursor: pointer;">Alias Display</a>'
  );
});

test('renderTimelineBlock tooltips update on mouse events, parse wikilinks, and support link clicks', async () => {
  const { renderTimelineBlock } = await import('../src/timelineRenderer');
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="container"></div></body></html>');
  (global as any).window = dom.window;
  (global as any).document = dom.window.document;
  (global as any).Element = dom.window.Element;
  (global as any).HTMLElement = dom.window.HTMLElement;
  (global as any).SVGElement = dom.window.SVGElement;
  (global as any).requestAnimationFrame = (cb: Function) => { cb(); return 1; };
  (global as any).cancelAnimationFrame = () => {};
  Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true, writable: true });

  let openedLink = '';
  const mockApp = {
    workspace: {
      openLinkText: (href: string) => {
        openedLink = href;
      },
    },
  };

  const container = dom.window.document.getElementById('container') as HTMLElement;

  const code = JSON.stringify([
    {
      start: '2020-01-01',
      end: '2021-01-01',
      title: '[[Project Note|Awesome Project]]',
      collection: ['SubItem1', 'SubItem2'],
      type: 'test-cat',
    },
  ]);

  renderTimelineBlock(code, container, { sourcePath: 'index.md' }, mockApp);
  await new Promise((resolve) => setTimeout(resolve, 50));

  const wrapper = container.querySelector('.timeline-wrapper') as HTMLElement;
  assert.ok(wrapper, 'Wrapper should exist');

  const tooltip = wrapper.querySelector('.timeline-tooltip') as HTMLElement;
  assert.ok(tooltip, 'Tooltip element should exist');
  assert.equal(tooltip.style.opacity, '0');

  const eventGroup = wrapper.querySelector('.event-group') as SVGElement;
  assert.ok(eventGroup, 'Event group should exist');

  // Verify SVG label is stripped of brackets
  const eventLabel = eventGroup.querySelector('.event-label');
  assert.equal(eventLabel?.textContent, 'Awesome Project');

  // Verify element.isShown() method works on SVG/HTML elements without error
  assert.equal(typeof (eventGroup as any).isShown, 'function');
  assert.equal(typeof (tooltip as any).isShown, 'function');

  // Trigger mouseenter and mousemove on event group
  const mouseEnterEvt = new dom.window.MouseEvent('mouseenter', {
    bubbles: true,
    cancelable: true,
    clientX: 100,
    clientY: 100,
  });
  eventGroup.dispatchEvent(mouseEnterEvt);

  assert.equal(tooltip.style.opacity, '1', 'Tooltip should be visible on mouseenter');

  const link = tooltip.querySelector('a.internal-link') as HTMLElement;
  assert.ok(link, 'Wikilink in tooltip title should render as HTML link');
  assert.equal(link.getAttribute('data-href'), 'Project Note');
  assert.equal(link.textContent, 'Awesome Project');

  // Simulate clicking the wikilink inside tooltip
  const clickEvt = new dom.window.MouseEvent('click', {
    bubbles: true,
    cancelable: true,
  });
  link.dispatchEvent(clickEvt);
  assert.equal(openedLink, 'Project Note', 'Clicking tooltip wikilink should open link target');

  // Trigger mouseleave
  const mouseLeaveEvt = new dom.window.MouseEvent('mouseleave', {
    bubbles: true,
    cancelable: true,
  });
  eventGroup.dispatchEvent(mouseLeaveEvt);

  // Wait for 250ms hide timeout delay
  await new Promise((resolve) => setTimeout(resolve, 250));

  assert.equal(tooltip.style.opacity, '0', 'Tooltip should hide after mouseleave delay');
});

test('renderTimelineBlock tooltip positions correctly with scroll and viewport constraints', async () => {
  const { renderTimelineBlock } = await import('../src/timelineRenderer');
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="container"></div></body></html>', {
    url: 'http://localhost/',
  });
  (global as any).window = dom.window;
  (global as any).document = dom.window.document;
  (global as any).Element = dom.window.Element;
  (global as any).HTMLElement = dom.window.HTMLElement;
  (global as any).SVGElement = dom.window.SVGElement;
  (global as any).requestAnimationFrame = (cb: Function) => cb();
  (global as any).cancelAnimationFrame = () => {};

  dom.window.innerWidth = 1000;
  dom.window.innerHeight = 800;

  const container = dom.window.document.getElementById('container') as HTMLElement;
  const code = JSON.stringify([
    {
      start: '2020-01-01',
      end: '2021-01-01',
      title: 'Viewport Test Event',
    },
  ]);

  renderTimelineBlock(code, container);
  await new Promise((resolve) => setTimeout(resolve, 50));

  const wrapper = container.querySelector('.timeline-wrapper') as HTMLElement;
  const tooltip = wrapper.querySelector('.timeline-tooltip') as HTMLElement;
  const eventGroup = wrapper.querySelector('.event-group') as SVGElement;

  // Mock getBoundingClientRect for wrapper and tooltip
  wrapper.getBoundingClientRect = () => ({
    left: 100,
    top: 200,
    right: 900,
    bottom: 700,
    width: 800,
    height: 500,
    x: 100,
    y: 200,
    toJSON: () => {},
  });

  Object.defineProperty(tooltip, 'offsetWidth', { value: 200, configurable: true });
  Object.defineProperty(tooltip, 'offsetHeight', { value: 65, configurable: true });

  // Mouse enter at clientX=150, clientY=250
  const mouseEnterEvt = new dom.window.MouseEvent('mouseenter', {
    bubbles: true,
    cancelable: true,
    clientX: 150,
    clientY: 250,
  });
  eventGroup.dispatchEvent(mouseEnterEvt);

  // targetX = 150 + 12 = 162. clampX = 162 - 100 = 62px. targetY = 250 + 12 = 262. clampY = 262 - 200 = 62px.
  assert.equal(tooltip.style.transform, 'translate3d(62px, 62px, 0)');

  // Dispatch scroll on window to trigger scroll invalidation listener
  dom.window.dispatchEvent(new dom.window.Event('scroll'));

  // Move mouse near bottom-right edge of viewport (clientX=880, clientY=680)
  const mouseMoveEvt = new dom.window.MouseEvent('mousemove', {
    bubbles: true,
    cancelable: true,
    clientX: 880,
    clientY: 680,
  });
  eventGroup.dispatchEvent(mouseMoveEvt);

  assert.equal(tooltip.style.transform, 'translate3d(568px, 403px, 0)');
});

test('renderTimelineBlock scales axis ticks on zoom-out (k < 1.0)', async () => {
  const { renderTimelineBlock } = await import('../src/timelineRenderer');
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="container"></div></body></html>');
  (global as any).window = dom.window;
  (global as any).document = dom.window.document;
  (global as any).Element = dom.window.Element;
  (global as any).HTMLElement = dom.window.HTMLElement;
  (global as any).SVGElement = dom.window.SVGElement;
  (global as any).requestAnimationFrame = (cb: Function) => cb();
  (global as any).cancelAnimationFrame = () => {};
  Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true, writable: true });

  const container = dom.window.document.getElementById('container') as HTMLElement;
  const code = JSON.stringify([
    {
      start: '2020-01-01',
      end: '2021-01-01',
      title: 'Zoom Scale Control Event',
    },
  ]);

  renderTimelineBlock(code, container);
  await new Promise((resolve) => setTimeout(resolve, 50));

  const wrapper = container.querySelector('.timeline-wrapper') as HTMLElement;
  const axisTop = wrapper.querySelector('.axis-top') as SVGElement;
  assert.ok(axisTop, 'Top axis should exist');

  const initialTicksCount = axisTop.querySelectorAll('.tick').length;
  assert.ok(initialTicksCount > 0, 'Initial ticks should be present');

  // Trigger zoom event with k = 0.3 (zoomed out)
  const d3 = require('d3');
  const svgEl = wrapper.querySelector('svg.timeline-svg') as SVGElement;
  const transformZoomOut = d3.zoomIdentity.scale(0.3);

  d3.select(svgEl).call(d3.zoom().transform, transformZoomOut);

  const zoomOutTicksCount = axisTop.querySelectorAll('.tick').length;
  assert.ok(
    zoomOutTicksCount <= initialTicksCount,
    `Zoomed out ticks (${zoomOutTicksCount}) should be less than or equal to initial ticks (${initialTicksCount})`
  );
});
